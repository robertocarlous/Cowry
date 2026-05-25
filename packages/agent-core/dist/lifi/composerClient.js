const COMPOSER_BASE = "https://li.quest";
const INTEGRATOR = process.env.LIFI_INTEGRATOR?.trim() || "cowry";
export async function getDepositQuote(params) {
    const apiKey = process.env.LIFI_API_KEY?.trim();
    const url = new URL(`${COMPOSER_BASE}/v1/quote`);
    url.searchParams.set("fromChain", String(params.fromChainId));
    url.searchParams.set("toChain", String(params.fromChainId));
    url.searchParams.set("fromToken", params.fromTokenAddress);
    url.searchParams.set("toToken", params.toTokenAddress);
    url.searchParams.set("fromAmount", params.fromAmount);
    url.searchParams.set("fromAddress", params.fromAddress);
    url.searchParams.set("integrator", INTEGRATOR);
    url.searchParams.set("opportunityId", params.opportunityId);
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    };
    if (apiKey) {
        headers["x-lifi-api-key"] = apiKey;
    } else {
        console.warn("[LI.FI Composer] No LIFI_API_KEY set — rate limits may apply.");
    }
    const res = await fetch(url.toString(), {
        headers
    });
    if (!res.ok) {
        let detail = "";
        try {
            const body = await res.json();
            detail = body.message ?? "";
        } catch  {
            detail = await res.text().catch(()=>"");
        }
        throw new Error(`LI.FI Composer error ${res.status}: ${detail.slice(0, 300)}`);
    }
    return res.json();
}
export function toBaseUnits(humanAmount, decimals) {
    return String(Math.round(humanAmount * 10 ** decimals));
}
export function estimateDailyEarnings(amountUsd, apy) {
    const daily = amountUsd * (apy / 100) / 365;
    return `~$${daily.toFixed(4)}`;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/lifi/composerClient.ts