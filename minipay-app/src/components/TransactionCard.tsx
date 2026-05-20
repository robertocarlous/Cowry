"use client";

interface Recipient {
  username: string;
  address:  string;
  amount:   number;
}

type DraftProps = {
  type:        "draft";
  recipients:  Recipient[];
  totalAmount: number;
  onConfirm:   () => void;
  onCancel:    () => void;
  tokenSymbol?: string;
  note?:       string;
  txLoading?:  boolean;
};

type ReadyProps = {
  type:        "tx_ready";
  recipients:  Recipient[];
  totalAmount: number;
  tokenSymbol: string;
  note:        string;
  onSign:      () => void;
  txLoading:   boolean;
};

type Props = DraftProps | ReadyProps;

export function TransactionCard(props: Props) {
  const { recipients, totalAmount, tokenSymbol = "USDm" } = props;

  return (
    <div className="w-full bg-white border border-cowry-primary/20 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-cowry-bubble px-4 py-2.5 flex items-center gap-2">
        <span className="text-cowry-primary text-base">💳</span>
        <span className="text-xs font-semibold text-cowry-secondary uppercase tracking-wide">
          {props.type === "draft" ? "Payment Preview" : "Ready to Sign"}
        </span>
      </div>

      {/* Recipients */}
      {recipients.length > 0 && (
        <div className="px-4 pt-3 space-y-1.5">
          {recipients.map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-600">
                {r.username.startsWith("@") ? r.username : `@${r.username}`}
              </span>
              <span className="font-medium text-gray-800">
                {r.amount.toLocaleString()} {tokenSymbol}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      {totalAmount > 0 && (
        <div className="mx-4 my-3 pt-2.5 border-t border-gray-100 flex justify-between text-sm font-semibold">
          <span className="text-gray-700">Total</span>
          <span className="text-cowry-secondary">
            {totalAmount.toLocaleString()} {tokenSymbol}
          </span>
        </div>
      )}

      {/* Note */}
      {props.type === "tx_ready" && props.note && (
        <p className="mx-4 mb-3 text-xs text-gray-500">{props.note}</p>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 mt-1 flex gap-2">
        {props.type === "draft" && (
          <>
            <button
              onClick={props.onConfirm}
              className="flex-1 bg-cowry-primary text-white text-sm font-semibold py-2.5 rounded-xl active:opacity-80 transition-opacity"
            >
              Confirm
            </button>
            <button
              onClick={props.onCancel}
              className="flex-1 bg-gray-100 text-gray-600 text-sm font-semibold py-2.5 rounded-xl active:opacity-70 transition-opacity"
            >
              Cancel
            </button>
          </>
        )}
        {props.type === "tx_ready" && (
          <button
            onClick={props.onSign}
            disabled={props.txLoading}
            className="w-full bg-cowry-secondary text-white text-sm font-semibold py-2.5 rounded-xl active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {props.txLoading ? (
              <>
                <Spinner />
                Signing…
              </>
            ) : (
              "Sign & Send"
            )}
          </button>
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
