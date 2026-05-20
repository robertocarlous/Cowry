"use client";
import { useState, useRef } from "react";
import { useWallet }        from "@/hooks/useWallet";
import { useChat }          from "@/hooks/useChat";
import { MessageBubble }    from "./MessageBubble";
import { BridgePanel }      from "./BridgePanel";
import { RegisterScreen }   from "./RegisterScreen";
import type { Message }     from "@/lib/types";

const SUGGESTIONS = [
  "Send 5 USDm to @alice",
  "Split $10 among @bob, @carol",
  "Create group Friends with @bob, @carol",
  "My balance",
];

export function ChatInterface() {
  const {
    address,
    username,
    shortAddress,
    inMiniPay,
    loading: walletLoading,
    connect,
    onRegistered,
    ensureCelo,
    wrongChain,
    isConnected,
    isRegistered,
    isChecking,
  } = useWallet();

  const { messages, loading, txLoading, send, confirm, cancel, signAndSend, addBotMessage, bottomRef } =
    useChat(address ?? null);

  const [input,      setInput]      = useState("");
  const [showBridge, setShowBridge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    send(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSign = (r: Extract<Message["response"], { type: "tx_ready" }>) => {
    if (!r) return;
    signAndSend(r.tx.transactions, r.tx.token.symbol);
  };

  // ── Loading wallet ────────────────────────────────────────────────────────
  if (walletLoading || isChecking) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cowry-dark">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full border-4 border-cowry-blue border-t-transparent animate-spin" />
          <p className="text-sm text-cowry-muted animate-pulse">
            {walletLoading ? "Connecting wallet…" : "Checking registration…"}
          </p>
        </div>
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 bg-cowry-dark text-white">
        <div className="text-center space-y-2">
          <p className="text-5xl mb-4">🐚</p>
          <h1 className="text-2xl font-bold">Cowry</h1>
          <p className="text-sm text-cowry-muted">Send money as easily as sending a message</p>
        </div>
        {!inMiniPay && (
          <button
            onClick={connect}
            className="w-full max-w-xs bg-cowry-blue text-cowry-darker font-bold py-3.5 rounded-full text-sm hover:bg-cowry-mint transition-colors"
          >
            Connect Wallet
          </button>
        )}
        {inMiniPay && (
          <p className="text-xs text-cowry-muted animate-pulse">Connecting to MiniPay…</p>
        )}
      </div>
    );
  }

  // ── Registration gate ─────────────────────────────────────────────────────
  if (!isRegistered) {
    return <RegisterScreen address={address!} onRegistered={onRegistered} />;
  }

  // ── Main chat ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="bg-cowry-secondary text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐚</span>
          <div>
            <p className="text-sm font-semibold leading-tight">Cowry</p>
            <p className="text-[10px] text-green-300 leading-tight">
              {username ? `@${username}` : shortAddress}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowBridge(true)}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full font-medium transition-colors"
        >
          🌉 Cross-chain
        </button>
      </div>

      {/* Wrong-chain banner */}
      {wrongChain && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <p className="text-xs text-amber-400">⚠️ Switch to Celo to send payments</p>
          <button
            onClick={ensureCelo}
            className="text-xs font-semibold text-amber-300 hover:text-amber-100 transition-colors"
          >
            Switch →
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-cowry-surface">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 pt-10">
            <p className="text-4xl">🐚</p>
            <p className="text-sm text-gray-500 text-center">
              {username ? `Hi @${username}! ` : ""}Say hi or try a command below
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-xs bg-white border border-cowry-primary/20 text-cowry-secondary px-4 py-2.5 rounded-xl hover:bg-cowry-bubble transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirm={confirm}
            onCancel={cancel}
            onSign={(r) => handleSign(r as Extract<Message["response"], { type: "tx_ready" }>)}
            onApprove={(txs) => signAndSend(txs, "USDm")}
            txLoading={txLoading}
          />
        ))}

        {loading && (
          <div className="flex justify-start mb-2">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="inline-flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Send a message…"
          disabled={loading}
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-10 h-10 bg-cowry-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white translate-x-0.5">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Bridge panel */}
      {showBridge && address && (
        <BridgePanel
          walletAddress={address}
          onClose={() => setShowBridge(false)}
          onSuccess={(msg) => { setShowBridge(false); addBotMessage(msg); }}
        />
      )}
    </div>
  );
}
