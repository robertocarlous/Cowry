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
export async function verifyAccount(institution: string, accountIdentifier: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${PAYCREST_BASE}/verify-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ institution, accountIdentifier }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Paycrest verify-account error ${res.status}: ${await readError(res)}`);
  }
  const body = (await res.json()) as { data?: string };
  const name = body.data?.trim();
  if (!name) {
    throw new Error("Paycrest verify-account response missing data");
  }
  return name;
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
