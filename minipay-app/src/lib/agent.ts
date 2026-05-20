import type { ChatResponse, ChainInfo, BridgeQuoteResult, BridgeStatus } from "./types";

function base(): string {
  // In production/staging: set NEXT_PUBLIC_AGENT_URL to the hosted agent URL.
  // In local dev: empty string → calls /api/* which Next.js proxies to the agent service.
  return process.env.NEXT_PUBLIC_AGENT_URL ?? "";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export function chat(
  message:       string,
  walletAddress: string,
  sessionId:     string,
): Promise<ChatResponse> {
  return post("/chat", { message, walletAddress, sessionId });
}

// ── Bridge ────────────────────────────────────────────────────────────────────

export async function getChains(): Promise<ChainInfo[]> {
  const { chains } = await get<{ chains: ChainInfo[] }>("/bridge/chains");
  return chains;
}

export function getBridgeQuote(params: {
  fromChainId:      number;
  fromTokenAddress: string;
  fromAmount:       string;
  fromAddress:      string;
  toChainId:        number;
  toTokenAddress:   string;
  toAddress:        string;
}): Promise<BridgeQuoteResult> {
  return post("/bridge/quote", params);
}

export function getBridgeStatus(
  txHash:      string,
  fromChainId: number,
  toChainId:   number,
): Promise<BridgeStatus> {
  return get(
    `/bridge/status?txHash=${txHash}&fromChainId=${fromChainId}&toChainId=${toChainId}`,
  );
}

// ── Tx status ─────────────────────────────────────────────────────────────────

export function getTxStatus(txHash: string) {
  return get<{ status: string; message: string }>(`/tx/${txHash}`);
}
