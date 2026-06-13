/** A recipient saved by the SENDER for fast reuse ("Mom", "Landlord", ...). */
export type SavedRecipient = {
  /** Lowercased nickname, used for matching ("mom"). */
  nickname: string;
  countryCode: string;
  currencyCode: string;
  institutionCode: string;
  institutionName: string;
  /** AES-256-GCM encrypted account number / phone number. */
  accountIdentifierEnc: string;
  accountName: string;
  /** Masked label for the UI, e.g. "GTBank ••••6789". */
  displayLabel: string;
};

/** State while collecting recipient details across multiple chat turns. */
export type PendingRemittance = {
  amount: number;
  /** Source token on Celo to send — "USDC" or "USDT". Defaults to USDC. */
  token: "USDC" | "USDT";
  countryCode?: string;
  currencyCode?: string;
  institutionQuery?: string;
  institutionCode?: string;
  institutionName?: string;
  accountIdentifier?: string;
  /** Numbered list shown to the user when no confident institution match was found. */
  institutionCandidates?: { name: string; code: string }[];
};

/** A fully-resolved remittance ready to show as a quote / confirm. */
export type PendingRemittanceQuote = {
  amount: number;
  /** Source token on Celo being sent — "USDC" or "USDT". */
  token: "USDC" | "USDT";
  countryCode: string;
  currencyCode: string;
  institutionCode: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
  estimatedReceive: string;
  displayLabel: string;
  recipientNickname?: string;
  /** Paycrest order id created at quote-build time (locks the rate). */
  orderId: string;
  /** On-chain address to send the source token to in order to fund the order. */
  receiveAddress: string;
  /** Locked exchange rate (1 unit of `token` -> currencyCode), as returned by Paycrest. */
  rate: string;
  /** ISO timestamp — order must be funded before this, else recreate on confirm. */
  validUntil: string;
};
