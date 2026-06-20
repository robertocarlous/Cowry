const PAYCREST_BASE = "https://api.paycrest.io/v2";
async function readError(res) {
    try {
        const body = await res.json();
        return body.message ?? body.error ?? "";
    } catch  {
        return (await res.text().catch(()=>"")).slice(0, 300);
    }
}
function fetchWithTimeout(url, init, timeoutMs, externalSignal) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    externalSignal?.addEventListener("abort", ()=>controller.abort());
    return fetch(url, {
        ...init,
        signal: controller.signal
    }).finally(()=>clearTimeout(timer));
}
const RETRYABLE_STATUS = new Set([
    502,
    503,
    504
]);
function sleep(ms) {
    return new Promise((resolve)=>setTimeout(resolve, ms));
}
export async function getInstitutions(currencyCode, signal) {
    const res = await fetch(`${PAYCREST_BASE}/institutions/${currencyCode}`, {
        headers: {
            Accept: "application/json"
        },
        signal
    });
    if (!res.ok) {
        throw new Error(`Paycrest institutions error ${res.status}: ${await readError(res)}`);
    }
    const body = await res.json();
    return body.data ?? [];
}
const VERIFY_TIMEOUT_MS = 15_000;
const VERIFY_MAX_ATTEMPTS = 3;
export async function verifyAccount(institution, accountIdentifier, signal) {
    let lastError = new Error("Paycrest verify-account failed");
    for(let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++){
        if (signal?.aborted) throw lastError;
        let res;
        try {
            res = await fetchWithTimeout(`${PAYCREST_BASE}/verify-account`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    institution,
                    accountIdentifier
                })
            }, VERIFY_TIMEOUT_MS, signal);
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < VERIFY_MAX_ATTEMPTS) {
                await sleep(attempt * 800);
                continue;
            }
            throw new Error(signal?.aborted ? "cancelled" : `Account verification timed out. The provider may be slow right now — please try again.`);
        }
        if (!res.ok) {
            const detail = await readError(res);
            lastError = new Error(`Paycrest verify-account error ${res.status}: ${detail}`);
            if (RETRYABLE_STATUS.has(res.status) && attempt < VERIFY_MAX_ATTEMPTS) {
                await sleep(attempt * 800);
                continue;
            }
            if (RETRYABLE_STATUS.has(res.status)) {
                throw new Error("Account verification timed out after retrying. Please try again in a moment.");
            }
            throw lastError;
        }
        const body = await res.json();
        const name = body.data?.trim();
        if (!name) {
            throw new Error("Paycrest verify-account response missing data");
        }
        return name;
    }
    throw lastError;
}
export async function getEstimatedRate(network, fromToken, amount, toCurrency) {
    const res = await fetch(`${PAYCREST_BASE}/rates/${network}/${fromToken}/${amount}/${toCurrency}`, {
        headers: {
            Accept: "application/json"
        }
    });
    if (!res.ok) {
        throw new Error(`Paycrest rates error ${res.status}: ${await readError(res)}`);
    }
    const body = await res.json();
    const rate = body.data?.sell?.rate;
    if (!rate) {
        throw new Error("Paycrest rates response missing sell.rate");
    }
    return rate;
}
export async function getOrderStatus(orderId, signal) {
    const apiKey = process.env.PAYCREST_API_KEY?.trim();
    if (!apiKey) throw new Error("PAYCREST_API_KEY env var is not set");
    const res = await fetch(`${PAYCREST_BASE}/sender/orders/${orderId}`, {
        headers: {
            Accept: "application/json",
            "API-Key": apiKey
        },
        signal
    });
    if (!res.ok) throw new Error(`Paycrest order status error ${res.status}: ${await readError(res)}`);
    const body = await res.json();
    if (!body.data) throw new Error("Paycrest order status response missing data");
    return {
        id: body.data.id,
        status: body.data.status,
        amountPaid: body.data.amountPaid
    };
}
export async function createOnRampOrder(params, signal) {
    const apiKey = process.env.PAYCREST_API_KEY?.trim();
    if (!apiKey) throw new Error("PAYCREST_API_KEY env var is not set");
    const res = await fetch(`${PAYCREST_BASE}/sender/orders`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "API-Key": apiKey
        },
        signal,
        body: JSON.stringify({
            amount: String(params.fiatAmount),
            amountIn: "fiat",
            source: {
                type: "fiat",
                currency: params.fiatCurrency,
                refundAccount: {
                    institution: params.refundInstitution,
                    accountIdentifier: params.refundAccountIdentifier,
                    accountName: params.refundAccountName
                }
            },
            destination: {
                type: "crypto",
                currency: params.toCurrency,
                recipient: {
                    address: params.recipientAddress,
                    network: params.network
                }
            },
            ...params.reference ? {
                reference: params.reference
            } : {}
        })
    });
    if (!res.ok) throw new Error(`Paycrest on-ramp order error ${res.status}: ${await readError(res)}`);
    const body = await res.json();
    const data = body.data;
    if (!data?.providerAccount?.accountIdentifier) {
        throw new Error("Paycrest on-ramp response missing providerAccount details");
    }
    return {
        id: data.id,
        status: data.status,
        rate: data.rate,
        providerBank: data.providerAccount.institution,
        providerAccountNumber: data.providerAccount.accountIdentifier,
        providerAccountName: data.providerAccount.accountName,
        amountToTransfer: data.providerAccount.amountToTransfer,
        fiatCurrency: data.providerAccount.currency,
        validUntil: data.providerAccount.validUntil
    };
}
export async function createOffRampOrder(params, signal) {
    const apiKey = process.env.PAYCREST_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("PAYCREST_API_KEY env var is not set");
    }
    const res = await fetch(`${PAYCREST_BASE}/sender/orders`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "API-Key": apiKey
        },
        signal,
        body: JSON.stringify({
            amount: String(params.amount),
            source: {
                type: "crypto",
                currency: params.fromCurrency,
                network: params.network,
                refundAddress: params.refundAddress
            },
            destination: {
                type: "fiat",
                currency: params.toCurrency,
                recipient: {
                    institution: params.institution,
                    accountIdentifier: params.accountIdentifier,
                    accountName: params.accountName,
                    memo: params.memo ?? "Cowry remittance"
                }
            }
        })
    });
    if (!res.ok) {
        throw new Error(`Paycrest order error ${res.status}: ${await readError(res)}`);
    }
    const body = await res.json();
    const data = body.data;
    if (!data?.providerAccount?.receiveAddress) {
        throw new Error("Paycrest order response missing providerAccount.receiveAddress");
    }
    return {
        id: data.id,
        status: data.status,
        rate: data.rate,
        senderFee: data.senderFee,
        transactionFee: data.transactionFee,
        reference: data.reference,
        receiveAddress: data.providerAccount.receiveAddress,
        validUntil: data.providerAccount.validUntil,
        network: data.providerAccount.network
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/remittance/paycrestClient.ts