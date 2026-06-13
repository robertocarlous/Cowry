"use client";

type Props = {
  recipientLabel:  string;
  sendAmount:      string;
  sendToken:       "USDC" | "USDT";
  receiveAmount:   string;
  receiveCurrency: string;
  rateLabel:       string;
  onConfirm:       () => void;
  onCancel:        () => void;
};

export function RemittanceQuoteCard({
  recipientLabel,
  sendAmount,
  sendToken,
  receiveAmount,
  receiveCurrency,
  rateLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="w-full bg-cowry-card border border-cowry-blue/20 rounded-2xl overflow-hidden">

      {/* Header strip */}
      <div className="border-b border-cowry-border px-4 py-2.5 flex items-center gap-2 bg-gradient-to-r from-cowry-blue/10 to-cowry-purple/10">
        <span className="text-base">🌍</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-cowry-blue">
          Cross-Border Payment
        </span>
      </div>

      {/* Details */}
      <div className="px-4 pt-3 pb-1 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">To</span>
          <span className="font-semibold text-white text-right">{recipientLabel}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">They get</span>
          <span className="font-bold text-cowry-mint text-right">
            {receiveAmount} {receiveCurrency}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">You send</span>
          <span className="font-semibold text-white text-right">
            {sendAmount} {sendToken}
          </span>
        </div>
      </div>

      {/* Rate */}
      <div className="mx-4 my-3 pt-2.5 border-t border-cowry-border flex justify-between text-xs">
        <span className="text-cowry-muted font-medium">Rate</span>
        <span className="text-cowry-muted">{rateLabel}</span>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 mt-1 flex gap-2">
        <button onClick={onConfirm}
          className="flex-1 bg-cowry-blue text-cowry-darker text-sm font-bold py-2.5 rounded-xl hover:bg-cowry-mint active:scale-95 transition-all">
          ✓ Confirm
        </button>
        <button onClick={onCancel}
          className="flex-1 bg-cowry-darker border border-cowry-border text-cowry-muted text-sm font-semibold py-2.5 rounded-xl hover:text-white transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}
