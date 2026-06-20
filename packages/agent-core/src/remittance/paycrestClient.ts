/**
 * Paycrest v2 API client
 * Docs: https://docs.paycrest.io
 *
 * Used for the remittance / cross-border off-ramp flow: sender pays USDC on
 * Celo, recipient receives local currency via bank transfer or mobile money.
 */

const PAYCREST_BASE = "https://api.paycrest.io/v2";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? "";
  } catch {
    return (await res.text().catch(() => "")).slice(0, 300);
  }
}

/** fetch() with a hard timeout, in addition to whatever external signal the caller passed. */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  externalSignal?.addEventListener("abort", () => controller.abort());
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Institution {
  name: string;
  code: string;
  type: string;
}

/** List supported banks / mobile money providers for a currency (e.g. "NGN"). */
export async function getInstitutions(currencyCode: string, signal?: AbortSignal): Promise<Institution[]> {
  const res = await fetch(`${PAYCREST_BASE}/institutions/${currencyCode}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Paycrest institutions error ${res.status}: ${await readError(res)}`);
  }
  const body = (await res.json()) as { data?: Institution[] };
  return body.data ?? [];
}

/**
 * Verify an account number / phone number against an institution and return
 * the account holder's name.
 *
 * Some mobile money corridors don't support name lookups and return the
 * literal string "OK" to indicate the account is valid but the name is
 * unavailable — callers should treat that case specially (it is NOT an error).
 */
const VERIFY_TIMEOUT_MS = 15_000;
const VERIFY_MAX_ATTEMPTS = 3;

export async function verifyAccount(institution: string, accountIdentifier: string, signal?: AbortSignal): Promise<string> {
  let lastError: Error = new Error("Paycrest verify-account failed");

  for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw lastError;

    let res: Response;
    try {
      res = await fetchWithTimeout(`${PAYCREST_BASE}/verify-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ institution, accountIdentifier }),
      }, VERIFY_TIMEOUT_MS, signal);
    } catch (e) {
      // Network error or our own timeout abort — retryable.
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < VERIFY_MAX_ATTEMPTS) { await sleep(attempt * 800); continue; }
      throw new Error(
        signal?.aborted ? "cancelled" : `Account verification timed out. The provider may be slow right now — please try again.`,
      );
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

    const body = (await res.json()) as { data?: string };
    const name = body.data?.trim();
    if (!name) {
      throw new Error("Paycrest verify-account response missing data");
    }
    return name;
  }

  throw lastError;
}

/**
 * Get an ESTIMATED exchange rate for amount `fromToken` -> `toCurrency` over
 * `network`. This is a public, no-auth estimate — the real rate is locked
 * when an order is created via createOffRampOrder().
 */
export async function getEstimatedRate(
  network: string,
  fromToken: string,
  amount: number | string,
  toCurrency: string,
): Promise<string> {
  const res = await fetch(`${PAYCREST_BASE}/rates/${network}/${fromToken}/${amount}/${toCurrency}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Paycrest rates error ${res.status}: ${await readError(res)}`);
  }
  const body = (await res.json()) as { data?: { sell?: { rate?: string } } };
  const rate = body.data?.sell?.rate;
  if (!rate) {
    throw new Error("Paycrest rates response missing sell.rate");
  }
  return rate;
}

export interface CreateOrderParams {
  /** Human USDC amount, e.g. 200 */
  amount: number;
  /** Source chain network, e.g. "celo" */
  network: string;
  /** Source token symbol, e.g. "USDC" */
  fromCurrency: string;
  /** Address that gets refunded if the order fails/expires */
  refundAddress: string;
  /** Destination fiat currency code, e.g. "NGN" */
  toCurrency: string;
  /** Institution code from getInstitutions() */
  institution: string;
  accountIdentifier: string;
  accountName: string;
  memo?: string;
}

export interface OffRampOrder {
  id: string;
  status: string;
  rate: string;
  senderFee: string;
  transactionFee: string;
  reference: string;
  /** On-chain address the agent must send USDC to in order to fund the order. */
  receiveAddress: string;
  validUntil: string;
  network: string;
}

export interface CreateOnRampParams {
  /** Fiat amount to convert, e.g. 10000 for 10000 NGN */
  fiatAmount: number;
  /** Fiat currency code, e.g. "NGN" */
  fiatCurrency: string;
  /** Refund bank account — where fiat goes back if order fails/expires */
  refundInstitution: string;
  refundAccountIdentifier: string;
  refundAccountName: string;
  /** Destination crypto token, e.g. "USDC" */
  toCurrency: string;
  /** Destination wallet address */
  recipientAddress: string;
  /** Destination network, e.g. "celo" */
  network: string;
  reference?: string;
}

export interface OnRampOrder {
  id: string;
  status: string;
  rate: string;
  /** Virtual fiat bank account the user must pay to */
  providerBank: string;
  providerAccountNumber: string;
  providerAccountName: string;
  /** Exact fiat amount to transfer (locked) */
  amountToTransfer: string;
  fiatCurrency: string;
  validUntil: string;
}

export interface OrderStatus {
  id: string;
  status: string;
  /** Amount of crypto sent to the recipient (present when settled) */
  amountPaid?: string;
}

/**
 * Get the status of an existing Paycrest order (on-ramp or off-ramp).
 * Requires PAYCREST_API_KEY.
 */
export async function getOrderStatus(orderId: string, signal?: AbortSignal): Promise<OrderStatus> {
  const apiKey = process.env.PAYCREST_API_KEY?.trim();
  if (!apiKey) throw new Error("PAYCREST_API_KEY env var is not set");
  const res = await fetch(`${PAYCREST_BASE}/sender/orders/${orderId}`, {
    headers: { Accept: "application/json", "API-Key": apiKey },
    signal,
  });
  if (!res.ok) throw new Error(`Paycrest order status error ${res.status}: ${await readError(res)}`);
  const body = (await res.json()) as { data?: { id: string; status: string; amountPaid?: string } };
  if (!body.data) throw new Error("Paycrest order status response missing data");
  return { id: body.data.id, status: body.data.status, amountPaid: body.data.amountPaid };
}

/**
 * Create an on-ramp order. Returns a virtual bank account the user must pay
 * fiat to. Once Paycrest detects the deposit the crypto is released to
 * `recipientAddress` on `network`.
 * Requires PAYCREST_API_KEY.
 */
export async function createOnRampOrder(params: CreateOnRampParams, signal?: AbortSignal): Promise<OnRampOrder> {
  const apiKey = process.env.PAYCREST_API_KEY?.trim();
  if (!apiKey) throw new Error("PAYCREST_API_KEY env var is not set");

  const res = await fetch(`${PAYCREST_BASE}/sender/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "API-Key": apiKey,
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
          accountName: params.refundAccountName,
        },
      },
      destination: {
        type: "crypto",
        currency: params.toCurrency,
        recipient: {
          address: params.recipientAddress,
          network: params.network,
        },
      },
      ...(params.reference ? { reference: params.reference } : {}),
    }),
  });

  if (!res.ok) throw new Error(`Paycrest on-ramp order error ${res.status}: ${await readError(res)}`);

  const body = (await res.json()) as {
    data?: {
      id: string;
      status: string;
      rate: string;
      providerAccount?: {
        institution: string;
        accountIdentifier: string;
        accountName: string;
        amountToTransfer: string;
        currency: string;
        validUntil: string;
      };
    };
  };

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
    validUntil: data.providerAccount.validUntil,
  };
}

/**
 * Create an off-ramp order. This LOCKS the real exchange rate and returns the
 * on-chain `receiveAddress` that must be funded with USDC to execute the payout.
 * Requires PAYCREST_API_KEY.
 */
export async function createOffRampOrder(params: CreateOrderParams, signal?: AbortSignal): Promise<OffRampOrder> {
  const apiKey = process.env.PAYCREST_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PAYCREST_API_KEY env var is not set");
  }

  const res = await fetch(`${PAYCREST_BASE}/sender/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "API-Key": apiKey,
    },
    signal,
    body: JSON.stringify({
      amount: String(params.amount),
      source: {
        type: "crypto",
        currency: params.fromCurrency,
        network: params.network,
        refundAddress: params.refundAddress,
      },
      destination: {
        type: "fiat",
        currency: params.toCurrency,
        recipient: {
          institution: params.institution,
          accountIdentifier: params.accountIdentifier,
          accountName: params.accountName,
          memo: params.memo ?? "Cowry remittance",
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Paycrest order error ${res.status}: ${await readError(res)}`);
  }

  const body = (await res.json()) as {
    data?: {
      id: string;
      status: string;
      rate: string;
      senderFee: string;
      transactionFee: string;
      reference: string;
      providerAccount?: { network: string; receiveAddress: string; validUntil: string };
    };
  };

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
    network: data.providerAccount.network,
  };
}
