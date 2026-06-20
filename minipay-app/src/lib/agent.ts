import type { ChatResponse, BridgeChainsConfig, BridgeQuoteResult, BridgeStatus } from "./types";

function base(): string {
  // In production/staging: set NEXT_PUBLIC_AGENT_URL to the hosted agent URL.
  // In local dev: /api → Next.js proxies /api/* to the agent service on 3001.
  return process.env.NEXT_PUBLIC_AGENT_URL ?? "/api";
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal,
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
  signal?:       AbortSignal,
): Promise<ChatResponse> {
  return post("/chat", { message, walletAddress, sessionId }, signal);
}

// ── Cross-chain send (LI.FI; Celo → other chain USDC) ───────────────────────

export async function getBridgeChains(): Promise<BridgeChainsConfig> {
  return get<BridgeChainsConfig>("/bridge/chains");
}

/** @deprecated Use getBridgeChains — kept for cached bundles */
export const getChains = getBridgeChains;

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

// ── Voice notes (speech → text) ─────────────────────────────────────────────

export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.set("audio", blob, "voice-note.webm");

  const res = await fetch(`${base()}/transcribe`, { method: "POST", body: form, signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Transcription failed (${res.status})`);
  }
  const data = await res.json() as { text?: string };
  return data.text ?? "";
}

// ── Tx status ─────────────────────────────────────────────────────────────────

export function getTxStatus(txHash: string) {
  return get<{ status: string; message: string }>(`/tx/${txHash}`);
}
