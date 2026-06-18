"use client";

type Props = {
  bank:             string;
  accountNumber:    string;
  accountName:      string;
  amountToTransfer: string;
  fiatCurrency:     string;
  estimatedUsdc:    string;
  validUntil:       string;
  orderId:          string;
};

export function OnRampCard({
  bank,
  accountNumber,
  accountName,
  amountToTransfer,
  fiatCurrency,
  estimatedUsdc,
  validUntil,
}: Props) {
  const expiry = new Date(validUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="w-full bg-cowry-card border border-cowry-blue/20 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="border-b border-cowry-border px-4 py-2.5 flex items-center gap-2 bg-gradient-to-r from-cowry-blue/10 to-cowry-purple/10">
        <span className="text-base">💰</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-cowry-blue">
          Buy USDC — Transfer Details
        </span>
      </div>

      {/* Details */}
      <div className="px-4 pt-3 pb-1 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">Bank</span>
          <span className="font-semibold text-white text-right">{bank}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">Account No.</span>
          <span className="font-bold text-cowry-mint text-right tracking-wider">{accountNumber}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">Account Name</span>
          <span className="font-semibold text-white text-right">{accountName}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">Amount to Send</span>
          <span className="font-bold text-white text-right">
            {amountToTransfer} {fiatCurrency}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-cowry-muted">You'll receive</span>
          <span className="font-semibold text-cowry-mint text-right">~{estimatedUsdc} USDC</span>
        </div>
      </div>

      {/* Expiry */}
      <div className="mx-4 my-3 pt-2.5 border-t border-cowry-border flex justify-between text-xs">
        <span className="text-cowry-muted font-medium">Expires at</span>
        <span className="text-yellow-400 font-semibold">{expiry}</span>
      </div>

      {/* Note */}
      <div className="px-4 pb-4">
        <p className="text-xs text-cowry-muted text-center leading-relaxed">
          Transfer the exact amount above. Your USDC will arrive automatically once Paycrest confirms the deposit.
        </p>
      </div>
    </div>
  );
}
