"use client";
import { useState, useRef } from "react";
import Image from "next/image";
import Link  from "next/link";
import { useWallet }     from "@/hooks/useWallet";
import { useChat }       from "@/hooks/useChat";
import { MessageBubble } from "./MessageBubble";
import { BridgePanel }   from "./BridgePanel";
import { RegisterScreen } from "./RegisterScreen";
import { CommandMenu }   from "./CommandMenu";
import type { Message }  from "@/lib/types";

const SUGGESTIONS = [
  "Send 5 USDm to @alice",
  "Split $10 among @bob, @carol",
  "Create group Friends with @bob, @carol",
  "My balance",
];

export function ChatInterface() {
  const {
    address, username, shortAddress, inMiniPay,
    loading: walletLoading, walletError, connect, onRegistered,
    ensureCelo, wrongChain, isConnected, isRegistered, isChecking,
  } = useWallet();

  const { messages, loading, txLoading, send, confirm, cancel, signAndSend, addBotMessage, bottomRef } =
    useChat(address ?? null);

  const [input,       setInput]       = useState("");
  const [showBridge,  setShowBridge]  = useState(false);
  const [showCommands, setShowCommands] = useState(false);
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (walletLoading || isChecking) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cowry-dark">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-2xl blur-xl bg-cowry-blue/30" />
            <Image src="/cowry.png" alt="Cowry" width={64} height={64} className="relative rounded-2xl" />
          </div>
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
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 bg-cowry-dark text-white">
        <div className="text-center space-y-3">
          <div className="relative mx-auto w-24 h-24 animate-float">
            <div className="absolute inset-0 rounded-2xl blur-2xl bg-cowry-blue/20 scale-125" />
            <Image src="/cowry.png" alt="Cowry" width={96} height={96} className="relative rounded-2xl shadow-2xl" />
          </div>
          <h1 className="text-2xl font-black mt-2">Cowry</h1>
          <p className="text-sm text-cowry-muted">Talk. Send. Automate.</p>
        </div>
        {!inMiniPay && (
          <button
            onClick={connect}
            className="w-full max-w-xs bg-cowry-blue text-cowry-darker font-bold py-3.5 rounded-full text-sm hover:bg-cowry-mint transition-colors animate-glow"
          >
            Connect Wallet
          </button>
        )}
        {inMiniPay && (
          <p className="text-xs text-cowry-muted animate-pulse">Connecting to MiniPay…</p>
        )}
        {walletError && (
          <p className="text-xs text-red-400 text-center max-w-xs">{walletError}</p>
        )}
        <Link href="/" className="text-xs text-cowry-muted hover:text-white transition-colors underline underline-offset-2">
          ← Back to homepage
        </Link>
      </div>
    );
  }

  // ── Registration gate ─────────────────────────────────────────────────────
  if (!isRegistered) {
    return <RegisterScreen address={address!} onRegistered={onRegistered} />;
  }

  // ── Main chat ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-cowry-dark">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-cowry-dark border-b border-cowry-border flex-shrink-0">
        {/* Left — home */}
        <Link
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-cowry-card border border-cowry-border hover:border-cowry-blue/40 transition-colors"
          title="Back to homepage"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-cowry-muted">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </Link>

        {/* Centre — logo + identity */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-lg blur-md bg-cowry-blue/20" />
            <Image src="/cowry.png" alt="Cowry" width={32} height={32} className="relative rounded-lg" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">Cowry</p>
            <p className="text-[10px] text-cowry-blue font-medium">
              {username ? `@${username}` : shortAddress}
            </p>
          </div>
        </div>

        {/* Right — cross-chain */}
        <button
          onClick={() => setShowBridge(true)}
          className="flex items-center gap-1.5 text-xs bg-cowry-card border border-cowry-border hover:border-cowry-blue/40 text-cowry-muted hover:text-white px-3 py-2 rounded-full font-medium transition-all"
        >
          <span>🌉</span>
          <span className="hidden sm:inline">Bridge</span>
        </button>
      </div>

      {/* Wrong-chain banner */}
      {wrongChain && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <p className="text-xs text-amber-400">⚠️ Switch to Celo to send payments</p>
          <button onClick={ensureCelo} className="text-xs font-semibold text-amber-300 hover:text-amber-100 transition-colors">
            Switch →
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-cowry-darker">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-5 pt-8">
            <div className="text-center">
              <p className="text-cowry-muted text-sm">
                {username ? `Hi @${username}! What would you like to do?` : "What would you like to do?"}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-xs bg-cowry-card border border-cowry-border hover:border-cowry-blue/40 text-cowry-muted hover:text-white px-4 py-3 rounded-xl transition-all"
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
          <div className="flex justify-start">
            <div className="bg-cowry-card border border-cowry-border rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="inline-flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-cowry-blue rounded-full animate-bounce"
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
      <div className="bg-cowry-dark border-t border-cowry-border px-3 py-3 flex items-center gap-2 flex-shrink-0">
        {/* Commands button */}
        <button
          onClick={() => setShowCommands(true)}
          className="w-10 h-10 bg-cowry-card border border-cowry-border rounded-full flex items-center justify-center flex-shrink-0 hover:border-cowry-blue/40 hover:text-cowry-blue text-cowry-muted transition-all"
          title="Browse commands"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
          </svg>
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a command or message…"
          disabled={loading}
          className="flex-1 bg-cowry-card border border-cowry-border rounded-full px-4 py-2.5 text-sm text-white placeholder-cowry-muted outline-none focus:border-cowry-blue/50 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-10 h-10 bg-cowry-blue rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-all hover:bg-cowry-mint"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-cowry-darker translate-x-0.5">
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

      {/* Command menu */}
      {showCommands && (
        <CommandMenu
          onSelect={(template) => {
            setInput(template);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onClose={() => setShowCommands(false)}
        />
      )}
    </div>
  );
}
