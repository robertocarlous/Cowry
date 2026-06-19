"use client";

interface Recipient { username: string; address: string; amount: number; }

// ── Draft: payment preview awaiting user confirmation ─────────────────────────
type DraftProps = {
  type:         "draft";
  recipients:   Recipient[];
  totalAmount:  number;
  tokenSymbol?: string;
  note?:        string;
  txLoading?:   boolean;
  onConfirm:    () => void;
  onCancel:     () => void;
};

// ── tx_ready: fallback when agent wallet is not configured ────────────────────
type ReadyProps = {
  type:             "tx_ready";
  recipients:       Recipient[];
  totalAmount:      number;
  tokenSymbol:      string;
  note:             string;
  agentAddress?:    string;
  agentRegistered?: boolean;
  onSign:           () => void;
  txLoading:        boolean;
};

// ── tx_sent: agent already executed on-chain — no user signing needed ─────────
type SentProps = {
  type:         "tx_sent";
  recipients:   Recipient[];
  totalAmount:  number;
  tokenSymbol:  string;
  txHash:       string;
  explorerUrl:  string;
  agentAddress: string;
};

type Props = DraftProps | ReadyProps | SentProps;

export function TransactionCard(props: Props) {
  const { recipients, totalAmount, tokenSymbol = "USDm" } = props;

  const headerLabel =
    props.type === "draft"   ? "Payment Preview"      :
    props.type === "tx_sent" ? "Executed by Cowry AI" :
                               "Sign Manually (Fallback)";
  const headerIcon =
    props.type === "draft"   ? "💳" :
    props.type === "tx_sent" ? "🤖" : "✍️";

  return (
    <div className="w-full bg-cowry-card border border-cowry-blue/20 rounded-2xl overflow-hidden">

      {/* Header strip */}
      <div className={`border-b border-cowry-border px-4 py-2.5 flex items-center gap-2 ${
        props.type === "tx_sent"
          ? "bg-gradient-to-r from-green-500/10 to-cowry-blue/10"
          : "bg-gradient-to-r from-cowry-blue/10 to-cowry-purple/10"
      }`}>
        <span className="text-base">{headerIcon}</span>
        <span className={`text-xs font-semibold uppercase tracking-widest ${
          props.type === "tx_sent" ? "text-green-400" : "text-cowry-blue"
        }`}>
          {headerLabel}
        </span>
      </div>

      {/* Recipients */}
      {recipients.length > 0 && (
        <div className="px-4 pt-3 space-y-2">
          {recipients.map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-cowry-muted">
                {r.username.startsWith("@") ? r.username : `@${r.username}`}
              </span>
              <span className="font-semibold text-white">
                {r.amount.toLocaleString()} {tokenSymbol}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      {totalAmount > 0 && (
        <div className="mx-4 my-3 pt-2.5 border-t border-cowry-border flex justify-between text-sm">
          <span className="text-cowry-muted font-medium">Total</span>
          <span className={`font-bold ${props.type === "tx_sent" ? "text-green-400" : "text-cowry-blue"}`}>
            {totalAmount.toLocaleString()} {tokenSymbol}
          </span>
        </div>
      )}

      {/* tx_ready: fallback note */}
      {props.type === "tx_ready" && props.note && (
        <p className="mx-4 mb-3 text-xs text-amber-400/80 leading-relaxed">{props.note}</p>
      )}
      {props.type === "tx_ready" && props.agentAddress && (
        <p className="mx-4 mb-3 text-[10px] text-cowry-muted">
          Agent{" "}
          <a href={`https://celoscan.io/address/${props.agentAddress}`}
             target="_blank" rel="noopener noreferrer"
             className="text-cowry-blue hover:text-cowry-mint font-mono">
            {props.agentAddress.slice(0, 6)}…{props.agentAddress.slice(-4)}
          </a>
          {props.agentRegistered ? " · ERC-8004 ✓" : ""}
        </p>
      )}

      {/* tx_sent: agent info + explorer link */}
      {props.type === "tx_sent" && (
        <div className="mx-4 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-cowry-muted">
            <span>🤖</span>
            <span>
              Sent by{" "}
              <a href={`https://celoscan.io/address/${props.agentAddress}`}
                 target="_blank" rel="noopener noreferrer"
                 className="text-cowry-blue hover:text-cowry-mint font-mono">
                {props.agentAddress.slice(0, 6)}…{props.agentAddress.slice(-4)}
              </a>
            </span>
          </div>

          {/* Tx hash row */}
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
            <span className="text-xs text-cowry-muted shrink-0">Tx</span>
            <span className="font-mono text-xs text-green-400 flex-1 truncate">
              {props.txHash.slice(0, 14)}…{props.txHash.slice(-8)}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(props.txHash)}
              className="text-cowry-muted hover:text-white transition-colors text-xs shrink-0"
              title="Copy transaction hash"
            >
              ⧉
            </button>
            <a href={props.explorerUrl} target="_blank" rel="noopener noreferrer"
               className="text-cowry-blue hover:text-cowry-mint text-xs shrink-0 transition-colors"
               title="View on CeloScan">
              ↗
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 mt-1 flex gap-2">

        {props.type === "draft" && (
          <>
            <button onClick={props.onConfirm}
              className="flex-1 bg-cowry-blue text-cowry-darker text-sm font-bold py-2.5 rounded-xl hover:bg-cowry-mint active:scale-95 transition-all">
              ✓ Confirm
            </button>
            <button onClick={props.onCancel}
              className="flex-1 bg-cowry-darker border border-cowry-border text-cowry-muted text-sm font-semibold py-2.5 rounded-xl hover:text-white transition-all">
              Cancel
            </button>
          </>
        )}

        {props.type === "tx_ready" && (
          <button onClick={props.onSign} disabled={props.txLoading}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-400 text-cowry-darker text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity">
            {props.txLoading ? <><Spinner /> Signing…</> : "✍️ Sign & Send (manual)"}
          </button>
        )}

        {props.type === "tx_sent" && (
          <div className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-green-400 font-semibold">
            <span>✅</span><span>Payment complete — no signature needed</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
