// ── Agent API types (mirrors ai-agent-service/src/types.ts) ──────────────────

export type EncodedTxJson = {
  to: string;
  data: string;
  value: string;
  description: string;
};

export type ChatResponse =
  | { type: "clarify"; question: string; transactions?: EncodedTxJson[] }
  | {
      type: "draft";
      draftId: string;
      preview: string;
      action: string;
      recipients: { username: string; address: string; amount: number }[];
      totalAmount: number;
    }
  | {
      type: "tx_ready";
      draftId: string;
      preview: string;
      tx: {
        chainId: number;
        token: { address: string; symbol: string; decimals: number };
        cowryPay: string;
        note: string;
        transactions: EncodedTxJson[];
      };
    }
  | { type: "cancelled"; message: string }
  | { type: "info"; message: string; transactions?: EncodedTxJson[] };

// ── UI message model ──────────────────────────────────────────────────────────

export type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  response?: ChatResponse;
};

// ── Bridge types ──────────────────────────────────────────────────────────────

export type ChainInfo = {
  chainId: number;
  name: string;
  usdc?: string;
  usdm?: string;
  usdcDecimals: number;
};

export type BridgeQuoteResult = {
  quoteId: string;
  tool: string;
  summary: string;
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    gasLimit?: string;
    gasPrice?: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    executionDuration: number;
    feeCosts: { name: string; amountUSD: string }[];
    gasCosts: { amountUSD: string }[];
  };
};

export type BridgeStatus =
  | { status: "PENDING" | "FAILED" | "NOT_FOUND" }
  | { status: "DONE"; toTxHash: string; receivedAmount: string };
