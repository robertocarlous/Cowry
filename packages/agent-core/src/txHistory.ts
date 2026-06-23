import type { TxHistoryItem } from "./types.js";

const KNOWN_TOKENS: Record<string, { symbol: "USDC" | "USDm" | "USDT"; decimals: number }> = {
  "0xceba9300f2b948710d2653dd7b07f33a8b32118c": { symbol: "USDC", decimals: 6 },
  "0x765de816845861e75a25fca122bb6898b8b1282a": { symbol: "USDm", decimals: 18 },
  "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e": { symbol: "USDT", decimals: 6 },
};

type CeloScanTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  timeStamp: string;
};

export type TxHistoryPage = {
  items: TxHistoryItem[];
  hasMore: boolean;
};

/**
 * Paginated USDC/USDm/USDT transfer history for a wallet, via CeloScan's
 * tokentx endpoint. `page` is 1-indexed; `pageSize` caps items per page.
 * CeloScan's own pagination is per-page across ALL tokens (not just the
 * known ones), so we over-fetch and re-filter to size the page correctly.
 */
const CELO_CHAIN_ID = 42220;

export async function fetchTransactionHistory(
  wallet: `0x${string}`,
  page = 1,
  pageSize = 10,
): Promise<TxHistoryPage> {
  const apiKey = process.env.ETHERSCAN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Transaction history is not configured (missing ETHERSCAN_API_KEY).");
  }

  const offset = pageSize * 2; // headroom for non-USDC/USDm/USDT transfers filtered out below
  // CeloScan's standalone v1 API is deprecated — Celo is now served via Etherscan's
  // unified multi-chain v2 API (https://docs.etherscan.io/v2-migration).
  const url = `https://api.etherscan.io/v2/api?chainid=${CELO_CHAIN_ID}&module=account&action=tokentx&address=${wallet}&sort=desc&offset=${offset}&page=${page}&apikey=${apiKey}`;
  const res = await fetch(url);
  const json = (await res.json()) as { status: string; result: unknown[] | string };

  if (json.status !== "1" || !Array.isArray(json.result)) {
    return { items: [], hasMore: false };
  }

  const raw = json.result as CeloScanTx[];
  const filtered = raw.filter((tx) => KNOWN_TOKENS[tx.contractAddress.toLowerCase()]);
  const hasMore = raw.length >= offset;

  const items: TxHistoryItem[] = filtered.slice(0, pageSize).map((tx) => {
    const meta = KNOWN_TOKENS[tx.contractAddress.toLowerCase()]!;
    const direction = tx.from.toLowerCase() === wallet.toLowerCase() ? "sent" : "received";
    const other = direction === "sent" ? tx.to : tx.from;
    const short = `${other.slice(0, 6)}…${other.slice(-4)}`;
    const amount = (Number(BigInt(tx.value)) / 10 ** meta.decimals).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
    return {
      hash: tx.hash,
      direction,
      amount: `${amount} ${meta.symbol}`,
      token: meta.symbol,
      counterparty: short,
      explorerUrl: `https://celoscan.io/tx/${tx.hash}`,
      timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
    };
  });

  return { items, hasMore };
}
