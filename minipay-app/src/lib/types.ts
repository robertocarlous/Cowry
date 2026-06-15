// ── Agent API types (mirrors @cowry/agent-core/types.js) ─────────────────────

export type EncodedTxJson = {
  to: string;
  data: string;
  value: string;
  description: string;
};

export type ChatResponse =
  | { type: "clarify"; question: string; transactions?: EncodedTxJson[]; tokenSymbol?: string }
  | {
      type: "draft";
      draftId: string;
      preview: string;
      action: string;
      recipients: { username: string; address: string; amount: number }[];
      totalAmount: number;
      tokenSymbol: string;
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
      agent?: {
        address: string;
        erc8004?: { registered: boolean; agentId?: string; hint?: string };
      };
    }
  | { type: "cancelled"; message: string }
  | { type: "info"; message: string; transactions?: EncodedTxJson[] }
  | {
      /**
       * The Cowry AI agent already signed and broadcast the payment on-chain.
       * The user does NOT need to sign anything.
       */
      type: "tx_sent";
      preview: string;
      txHash: string;
      explorerUrl: string;
      /** Agent wallet address that executed the tx */
      agentAddress: string;
    }
  | {
      /** Recent on-chain transaction history for the user's wallet. */
      type: "tx_history";
      items: TxHistoryItem[];
    }
  | {
      /** Cross-border remittance quote awaiting user confirm (Paycrest). */
      type: "remittance_quote";
      preview: string;
      recipientLabel: string;
      sendAmount: string;
      sendToken: "USDC" | "USDT";
      receiveAmount: string;
      receiveCurrency: string;
      rateLabel: string;
      /** Platform fee included in `sendAmount`, e.g. "0.5". */
      feeAmount: string;
      /** Human-readable fee summary, e.g. "0.5 USDC (1% fee)". */
      feeLabel: string;
    };

export type TxHistoryItem = {
  hash: string;
  direction: "sent" | "received";
  amount: string;
  token: "USDC" | "USDm";
  counterparty: string;
  explorerUrl: string;
};

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
  usdmDecimals?: number;
};

export type BridgeChainsConfig = {
  source: ChainInfo;
  destinations: ChainInfo[];
};

export type BridgeQuoteResult = {
  quoteId: string;
  tool: string;
  summary: string;
  fromTokenAddress: string;
  fromAmount: string;
  /** LI.FI spender — approve this before signing the bridge tx */
  approvalAddress: string;
  preflight?: {
    needsApproval: boolean;
    sufficientBalance: boolean;
  };
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
