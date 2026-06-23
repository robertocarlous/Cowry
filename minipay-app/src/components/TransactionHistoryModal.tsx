"use client";
import { useEffect, useState } from "react";
import { getTxHistory } from "@/lib/agent";
import type { TxHistoryItem } from "@/lib/types";
import { TxHistoryRow } from "./TxHistoryRow";

interface Props {
  walletAddress: string;
  onClose: () => void;
}

export function TransactionHistoryModal({ walletAddress, onClose }: Props) {
  const [items, setItems] = useState<TxHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError("");
    getTxHistory(walletAddress, 1)
      .then((res) => {
        setItems(res.items);
        setHasMore(res.hasMore);
        setPage(1);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load transactions"))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  const loadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    getTxHistory(walletAddress, nextPage)
      .then((res) => {
        setItems((prev) => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        setPage(nextPage);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load more transactions"))
      .finally(() => setLoadingMore(false));
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cowry-dark border-t border-cowry-border rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-cowry-border">
          <div className="w-10 h-1 bg-cowry-border rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-sm font-bold text-white">Transaction History</h2>
            </div>
            <button
              onClick={onClose}
              className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {error && (
            <div className="m-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 rounded-full border-2 border-cowry-green border-t-transparent animate-spin" />
              <p className="text-xs text-cowry-muted">Loading transactions…</p>
            </div>
          ) : items.length === 0 && !error ? (
            <p className="text-sm text-cowry-muted text-center py-16">
              No USDC, USDm or USDT transactions found for your wallet.
            </p>
          ) : (
            <>
              <div className="divide-y divide-cowry-border">
                {items.map((tx, i) => (
                  <TxHistoryRow key={`${tx.hash}-${i}`} tx={tx} showDate />
                ))}
              </div>

              {hasMore && (
                <div className="px-4 py-4 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs font-semibold text-cowry-green border border-cowry-green/40 hover:border-cowry-green rounded-full px-5 py-2 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
