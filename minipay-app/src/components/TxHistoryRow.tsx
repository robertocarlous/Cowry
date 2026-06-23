"use client";
import { useState } from "react";
import type { TxHistoryItem } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TxHistoryRow({ tx, showDate = false }: { tx: TxHistoryItem; showDate?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(tx.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — silently ignore
    }
  }

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
        tx.direction === "sent"
          ? "bg-red-500/10 text-red-400"
          : "bg-green-500/10 text-green-400"
      }`}>
        {tx.direction === "sent" ? "↑" : "↓"}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {tx.direction === "sent" ? "Sent" : "Received"}{" "}
          <span className={tx.direction === "sent" ? "text-red-400" : "text-green-400"}>
            {tx.amount}
          </span>
        </p>
        <p className="text-xs text-cowry-muted truncate">
          {tx.direction === "sent" ? "To" : "From"}: {tx.counterparty}
          {showDate && tx.timestamp ? ` · ${formatDate(tx.timestamp)}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={copyHash}
          title="Copy transaction hash"
          className="w-7 h-7 rounded-lg bg-cowry-darker border border-cowry-border hover:border-cowry-green/40 flex items-center justify-center transition-colors"
        >
          {copied ? (
            <span className="text-green-400 text-[10px]">✓</span>
          ) : (
            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-muted">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
          )}
        </button>

        <a
          href={tx.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View on CeloScan"
          className="w-7 h-7 rounded-lg bg-cowry-darker border border-cowry-border hover:border-cowry-green/40 flex items-center justify-center transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-muted">
            <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
