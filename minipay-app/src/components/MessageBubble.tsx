"use client";
import type { Message } from "@/lib/types";
import { TransactionCard } from "./TransactionCard";
import { TxHistoryCard } from "./TxHistoryCard";
import { RemittanceQuoteCard } from "./RemittanceQuoteCard";
import { OnRampCard } from "./OnRampCard";

interface Props {
  message:    Message;
  onConfirm:  () => void;
  onCancel:   () => void;
  onSign:     (r: Message["response"] & { type: "tx_ready" }) => void;
  onApprove?: (
    txs: NonNullable<Extract<Message["response"], { type: "clarify" }>["transactions"]>,
    tokenSymbol?: string,
  ) => void;
  txLoading:  boolean;
}

export function MessageBubble({ message, onConfirm, onCancel, onSign, onApprove, txLoading }: Props) {
  const isUser = message.role === "user";
  const r = message.response;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>

      {/* Bot avatar */}
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-cowry-card border border-cowry-border flex-shrink-0 mt-1 flex items-center justify-center text-[10px]">
          🐚
        </div>
      )}

      <div className={`max-w-[82%] flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>

        {/* Bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? "bg-cowry-blue text-cowry-darker font-medium rounded-br-sm"
              : "bg-cowry-card border border-cowry-border text-white rounded-bl-sm"
          }`}
        >
          {message.text}
        </div>

        {/* Approve button */}
        {r?.type === "clarify" && r.transactions && r.transactions.length > 0 && onApprove && (
          <button
            onClick={() => onApprove(r.transactions!, r.tokenSymbol)}
            disabled={txLoading}
            className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {txLoading ? "Approving…" : (
              <>
                <span>🔑</span> Approve {r.tokenSymbol ?? "token"} spend
              </>
            )}
          </button>
        )}

        {/* Transaction cards */}
        {r?.type === "draft" && (
          <TransactionCard
            type="draft"
            recipients={r.recipients}
            totalAmount={r.totalAmount}
            tokenSymbol={r.tokenSymbol}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
        {r?.type === "tx_ready" && (
          <TransactionCard
            type="tx_ready"
            recipients={[]}
            totalAmount={0}
            tokenSymbol={r.tx.token.symbol}
            note={r.tx.note}
            agentAddress={r.agent?.address}
            agentRegistered={r.agent?.erc8004?.registered}
            onSign={() => onSign(r)}
            txLoading={txLoading}
          />
        )}

        {/* Agent executed on-chain — no user signing needed */}
        {r?.type === "tx_sent" && (
          <TransactionCard
            type="tx_sent"
            recipients={[]}
            totalAmount={0}
            tokenSymbol=""
            txHash={r.txHash}
            explorerUrl={r.explorerUrl}
            agentAddress={r.agentAddress}
          />
        )}

        {/* Transaction history */}
        {r?.type === "tx_history" && (
          <TxHistoryCard items={r.items} />
        )}

        {/* On-ramp virtual account */}
        {r?.type === "onramp_virtual_account" && (
          <OnRampCard
            bank={r.bank}
            accountNumber={r.accountNumber}
            accountName={r.accountName}
            amountToTransfer={r.amountToTransfer}
            fiatCurrency={r.fiatCurrency}
            estimatedUsdc={r.estimatedUsdc}
            validUntil={r.validUntil}
            orderId={r.orderId}
          />
        )}

        {/* Cross-border remittance quote */}
        {r?.type === "remittance_quote" && (
          <RemittanceQuoteCard
            recipientLabel={r.recipientLabel}
            sendAmount={r.sendAmount}
            sendToken={r.sendToken}
            receiveAmount={r.receiveAmount}
            receiveCurrency={r.receiveCurrency}
            rateLabel={r.rateLabel}
            feeLabel={r.feeLabel}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}

        <span className="text-[10px] text-cowry-border px-1">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
