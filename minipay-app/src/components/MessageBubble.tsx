"use client";
import type { Message } from "@/lib/types";
import { TransactionCard } from "./TransactionCard";

interface Props {
  message: Message;
  onConfirm: () => void;
  onCancel:  () => void;
  onSign:    (txs: Message["response"] & { type: "tx_ready" }) => void;
  txLoading: boolean;
}

export function MessageBubble({ message, onConfirm, onCancel, onSign, txLoading }: Props) {
  const isUser = message.role === "user";
  const r = message.response;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Main bubble */}
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? "bg-cowry-primary text-white rounded-br-sm"
              : "bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100"
          }`}
        >
          {message.text}
        </div>

        {/* Special cards for draft / tx_ready */}
        {r?.type === "draft" && (
          <TransactionCard
            type="draft"
            recipients={r.recipients}
            totalAmount={r.totalAmount}
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
            onSign={() => onSign(r)}
            txLoading={txLoading}
          />
        )}

        <span className="text-[10px] text-gray-400 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
