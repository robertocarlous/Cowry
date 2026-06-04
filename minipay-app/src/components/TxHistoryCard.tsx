"use client";
import { useState } from "react";
import type { TxHistoryItem } from "@/lib/types";

interface Props {
  items: TxHistoryItem[];
}

export function TxHistoryCard({ items }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard not available — silently ignore
    }
  }

  return (
    <div className="w-full bg-cowry-card border border-cowry-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cowry-blue/10 to-cowry-purple/10 border-b border-cowry-border px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">📋</span>
        <span className="text-xs font-semibold text-cowry-blue uppercase tracking-widest">
          Recent Transactions
        </span>
      </div>

      {/* List */}
      <div className="divide-y divide-cowry-border">
        {items.map((tx, i) => (
          <div key={`${tx.hash}-${i}`} className="px-4 py-3 flex items-center gap-3">
            {/* Direction icon */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              tx.direction === "sent"
                ? "bg-red-500/10 text-red-400"
                : "bg-green-500/10 text-green-400"
            }`}>
              {tx.direction === "sent" ? "↑" : "↓"}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {tx.direction === "sent" ? "Sent" : "Received"}{" "}
                <span className={tx.direction === "sent" ? "text-red-400" : "text-green-400"}>
                  {tx.amount}
                </span>
              </p>
              <p className="text-xs text-cowry-muted truncate">
                {tx.direction === "sent" ? "To" : "From"}: {tx.counterparty}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Copy hash */}
              <button
                onClick={() => copyHash(tx.hash)}
                title="Copy transaction hash"
                className="w-7 h-7 rounded-lg bg-cowry-darker border border-cowry-border hover:border-cowry-blue/40 flex items-center justify-center transition-colors"
              >
                {copied === tx.hash ? (
                  <span className="text-green-400 text-[10px]">✓</span>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-muted">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                )}
              </button>

              {/* Open in CeloScan */}
              <a
                href={tx.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View on CeloScan"
                className="w-7 h-7 rounded-lg bg-cowry-darker border border-cowry-border hover:border-cowry-blue/40 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-muted">
                  <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-cowry-border">
        <a
          href="https://celoscan.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cowry-muted hover:text-cowry-blue transition-colors"
        >
          View all on CeloScan →
        </a>
      </div>
    </div>
  );
}
