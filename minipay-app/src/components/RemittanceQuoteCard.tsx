"use client";

type Props = {
  recipientLabel:  string;
  sendAmount:      string;
  sendToken:       "USDC" | "USDT";
  receiveAmount:   string;
  receiveCurrency: string;
  rateLabel:       string;
  feeLabel:        string;
  onConfirm:       () => void;
  onCancel:        () => void;
};

export function RemittanceQuoteCard({
  recipientLabel,
  sendAmount,
  sendToken,
  receiveAmount,
  receiveCurrency,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="w-full bg-cowry-dark border border-cowry-border rounded-2xl px-5 py-5">

      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-semibold uppercase tracking-wide text-white">
          Confirm Transfer
        </span>
        <span className="text-[11px] font-medium text-cowry-green bg-cowry-green/10 border border-cowry-green/40 rounded-full px-3 py-1">
          Quote locked
        </span>
      </div>

      {/* You pay / Recipient gets */}
      <div className="flex justify-between gap-4 mb-5">
        <div>
          <p className="text-xs text-cowry-muted mb-1">You pay</p>
          <p className="text-lg font-bold text-white">{sendAmount} {sendToken}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cowry-muted mb-1">Recipient gets</p>
          <p className="text-lg font-bold text-white">{receiveAmount} {receiveCurrency}</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="mb-6">
        <p className="text-xs text-cowry-muted mb-1">To</p>
        <p className="text-sm font-semibold text-white">{recipientLabel}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onConfirm}
          className="flex-1 bg-cowry-green text-black text-sm font-bold py-3 rounded-full active:scale-95 transition-all">
          Confirm
        </button>
        <button onClick={onCancel}
          className="flex-1 bg-transparent border border-cowry-green/60 text-white text-sm font-semibold py-3 rounded-full hover:border-cowry-green transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}
