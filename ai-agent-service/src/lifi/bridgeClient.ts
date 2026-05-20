/**
 * LI.FI cross-chain bridge client — fully bidirectional.
 *
 * Supports:
 *   Inbound:  any EVM chain  →  Celo (USDm or USDC)
 *   Outbound: Celo (USDm or USDC)  →  any EVM chain
 *
 * Flow:
 *  1. Call getBridgeQuote() — returns calldata the user signs on the source chain.
 *  2. User broadcasts the tx from their wallet on fromChainId.
 *  3. LI.FI relays funds to the destination chain.
 *  4. Poll getBridgeStatus() until status === "DONE" | "FAILED".
 */

import { CELO_USDM_ADDRESS, CELO_USDC_ADDRESS } from "./celoTokens.js";

const LIFI_BASE  = "https://li.quest/v1";
const INTEGRATOR = process.env.LIFI_INTEGRATOR?.trim() || "cowry";

export const CELO_CHAIN_ID = 42220;

// ── Supported chains catalogue ────────────────────────────────────────────────
// Used by GET /bridge/chains so the frontend can build its chain/token selectors.

export type ChainInfo = {
  chainId:  number;
  name:     string;
  /** USDC address on this chain, if available */
  usdc?:    string;
  /** USDm address — only on Celo */
  usdm?:    string;
  /** Display decimals for USDC on this chain (always 6 for non-Celo) */
  usdcDecimals: number;
};

export const SUPPORTED_CHAINS: Record<number, ChainInfo> = {
  1:      { chainId: 1,      name: "Ethereum",  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", usdcDecimals: 6 },
  10:     { chainId: 10,     name: "Optimism",  usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", usdcDecimals: 6 },
  56:     { chainId: 56,     name: "BNB Chain", usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", usdcDecimals: 18 },
  137:    { chainId: 137,    name: "Polygon",   usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", usdcDecimals: 6 },
  8453:   { chainId: 8453,   name: "Base",      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", usdcDecimals: 6 },
  42161:  { chainId: 42161,  name: "Arbitrum",  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", usdcDecimals: 6 },
  43114:  { chainId: 43114,  name: "Avalanche", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", usdcDecimals: 6 },
  59144:  { chainId: 59144,  name: "Linea",     usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", usdcDecimals: 6 },
  534352: { chainId: 534352, name: "Scroll",    usdc: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", usdcDecimals: 6 },
  42220:  {
    chainId: 42220,
    name: "Celo",
    usdc: CELO_USDC_ADDRESS,
    usdm: CELO_USDM_ADDRESS,
    usdcDecimals: 6,
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type BridgeQuoteParams = {
  /** Source chain ID */
  fromChainId: number;
  /** Token address on the source chain */
  fromTokenAddress: string;
  /** Amount in base units as a string */
  fromAmount: string;
  /** Sender wallet address (signs the source-chain tx) */
  fromAddress: `0x${string}`;
  /** Destination chain ID */
  toChainId: number;
  /** Token address on the destination chain */
  toTokenAddress: string;
  /** Recipient wallet address on the destination chain */
  toAddress: `0x${string}`;
};

export type BridgeTx = {
  to:       `0x${string}`;
  data:     `0x${string}`;
  value:    string;
  chainId:  number;
  gasLimit?: string;
  gasPrice?: string;
};

export type BridgeQuote = {
  id:   string;
  tool: string;
  estimate: {
    fromAmount:        string;
    toAmount:          string;
    toAmountMin:       string;
    executionDuration: number;
    feeCosts: { name: string; amountUSD: string }[];
    gasCosts: { amountUSD: string }[];
  };
  action: {
    fromChainId: number;
    toChainId:   number;
    fromToken:   { symbol: string; decimals: number; address: string };
    toToken:     { symbol: string; decimals: number; address: string };
  };
  transactionRequest: BridgeTx;
};

export type BridgeStatusResult =
  | { status: "PENDING" | "FAILED" | "NOT_FOUND" }
  | { status: "DONE"; toTxHash: `0x${string}`; receivedAmount: string };

// ── Internal helpers ──────────────────────────────────────────────────────────

function lifiHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = process.env.LIFI_API_KEY?.trim();
  if (key) h["x-lifi-api-key"] = key;
  else console.warn("[LI.FI] No LIFI_API_KEY set — rate limits may apply.");
  return h;
}

async function lifiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${LIFI_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: lifiHeaders() });
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { message?: string }).message ?? ""; } catch { /* ignore */ }
    throw new Error(`LI.FI ${path} error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function chainName(id: number): string {
  return SUPPORTED_CHAINS[id]?.name ?? `chain-${id}`;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

/**
 * Get a bridge quote between any two supported chains.
 * Works in both directions — inbound to Celo and outbound from Celo.
 */
export async function getBridgeQuote(params: BridgeQuoteParams): Promise<BridgeQuote> {
  return lifiGet<BridgeQuote>("/quote", {
    fromChain:    String(params.fromChainId),
    toChain:      String(params.toChainId),
    fromToken:    params.fromTokenAddress,
    toToken:      params.toTokenAddress,
    fromAmount:   params.fromAmount,
    fromAddress:  params.fromAddress,
    toAddress:    params.toAddress,
    integrator:   INTEGRATOR,
    allowBridges: "across,stargate,relay,cbridge",
  });
}

// ── Status polling ────────────────────────────────────────────────────────────

/**
 * Check the status of a bridge transaction after broadcasting.
 * Poll every ~15s until status === "DONE" or "FAILED".
 */
export async function getBridgeStatus(
  txHash:      string,
  fromChainId: number,
  toChainId:   number,
): Promise<BridgeStatusResult> {
  type RawStatus = {
    status:     string;
    receiving?: { txHash?: string; amount?: string };
  };

  let raw: RawStatus;
  try {
    raw = await lifiGet<RawStatus>("/status", {
      txHash,
      fromChain: String(fromChainId),
      toChain:   String(toChainId),
    });
  } catch {
    return { status: "NOT_FOUND" };
  }

  if (raw.status === "DONE") {
    return {
      status:         "DONE",
      toTxHash:       (raw.receiving?.txHash ?? "0x") as `0x${string}`,
      receivedAmount: raw.receiving?.amount ?? "0",
    };
  }
  if (raw.status === "FAILED") return { status: "FAILED" };
  return { status: "PENDING" };
}

// ── Human-readable summary ────────────────────────────────────────────────────

export function formatBridgeSummary(quote: BridgeQuote): string {
  const from         = quote.action.fromToken;
  const to           = quote.action.toToken;
  const sentHuman    = (Number(quote.estimate.fromAmount)  / 10 ** from.decimals).toFixed(4);
  const receivedMin  = (Number(quote.estimate.toAmountMin) / 10 ** to.decimals).toFixed(4);
  const durationMin  = Math.ceil(quote.estimate.executionDuration / 60);
  const feeUsd       = quote.estimate.feeCosts.reduce((s, f) => s + Number(f.amountUSD), 0).toFixed(2);
  const gasUsd       = quote.estimate.gasCosts.reduce((s, g) => s + Number(g.amountUSD), 0).toFixed(2);

  return [
    `Bridge via ${quote.tool}`,
    `• Send:     ${sentHuman} ${from.symbol} on ${chainName(quote.action.fromChainId)}`,
    `• Receive:  ≥${receivedMin} ${to.symbol} on ${chainName(quote.action.toChainId)}`,
    `• Fee:      $${feeUsd}  |  Gas: $${gasUsd}`,
    `• Est. time: ~${durationMin} min`,
  ].join("\n");
}
