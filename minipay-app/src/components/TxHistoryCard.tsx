"use client";
import type { TxHistoryItem } from "@/lib/types";
import { TxHistoryRow } from "./TxHistoryRow";

interface Props {
  items: TxHistoryItem[];
  onViewAll: () => void;
}

export function TxHistoryCard({ items, onViewAll }: Props) {
  return (
    <div className="w-full bg-cowry-card border border-cowry-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cowry-green/10 to-cowry-mint/10 border-b border-cowry-border px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">📋</span>
        <span className="text-xs font-semibold text-cowry-green uppercase tracking-widest">
          Recent Transactions
        </span>
      </div>

      {/* List */}
      <div className="divide-y divide-cowry-border">
        {items.map((tx, i) => (
          <TxHistoryRow key={`${tx.hash}-${i}`} tx={tx} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-cowry-border">
        <button
          onClick={onViewAll}
          className="text-xs text-cowry-muted hover:text-cowry-green transition-colors"
        >
          View all transactions →
        </button>
      </div>
    </div>
  );
}
