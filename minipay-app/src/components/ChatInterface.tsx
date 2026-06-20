"use client";
import { useState, useRef } from "react";
import Image from "next/image";
import Link  from "next/link";
import { useWallet }          from "@/hooks/useWallet";
import { useChat }            from "@/hooks/useChat";
import { MessageBubble }      from "./MessageBubble";
import { CrossChainSendPanel } from "./CrossChainSendPanel";
import { GrantAccessScreen }  from "./GrantAccessScreen";
import { CommandMenu }        from "./CommandMenu";
import type { Message }       from "@/lib/types";

const SUGGESTIONS = [
  { text: "Send $20 to mobile money in Kenya", icon: "/Vector.png" },
  { text: "What's my balance", icon: "/Vector%201.png" },
  { text: "Send $50 to a bank account in Nigeria", icon: "/Vector.png" },
  { text: "Show my recent transactions", icon: "/Group%209.png" },
];

export function ChatInterface() {
  const {
    address, shortAddress,
    isConnecting, walletError, onAccessGranted,
    ensureCelo, wrongChain, isConnected,
    hasGrantedAccess, isCheckingAccess,
  } = useWallet();

  const { messages, loading, txLoading, send, stop, confirm, cancel, signAndSend, addBotMessage, bottomRef } =
    useChat(address ?? null);

  const [input,       setInput]       = useState("");
  const [showCrossChainSend, setShowCrossChainSend] = useState(false);
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

  // Not in MiniPay or auto-connect failed
  if (!isConnecting && !isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 bg-cowry-dark text-white">
        <div className="text-center space-y-3">
          <div className="relative mx-auto w-24 h-24 animate-float">
            <div className="absolute inset-0 rounded-2xl blur-2xl bg-cowry-blue/20 scale-125" />
            <Image src="/cowry.png" alt="Cowry" width={96} height={96} className="relative rounded-2xl shadow-2xl" />
          </div>
          <h1 className="text-2xl font-black mt-2">Cowry</h1>
          <p className="text-sm text-cowry-muted max-w-xs">
            {walletError ?? "Please open this app inside MiniPay."}
          </p>
        </div>
        <Link href="/" className="text-xs text-cowry-muted hover:text-white transition-colors underline underline-offset-2">
          Back to homepage
        </Link>
      </div>
    );
  }

  // Wallet provider / account — full splash only until we have an address
  if (isConnecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-cowry-dark">
        <div className="animate-pulse">
          <Image src="/Group%203.png" alt="CowryPay" width={160} height={48} className="object-contain" priority />
        </div>
        <p className="text-xs text-cowry-muted">Connecting wallet…</p>
      </div>
    );
  }

  // Access gate — wallets that haven't authorized Cowry AI yet
  // Show spinner while checking allowance, then grant screen if not yet granted
  if (isConnected && (isCheckingAccess || !hasGrantedAccess)) {
    if (isCheckingAccess) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-cowry-dark">
          <div className="w-8 h-8 rounded-full border-2 border-cowry-blue border-t-transparent animate-spin" />
          <p className="text-xs text-cowry-muted">Checking access…</p>
        </div>
      );
    }
    return (
      <GrantAccessScreen
        address={address!}
        onGranted={onAccessGranted}
      />
    );
  }

  // Main chat — wallets that have authorized Cowry AI
  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-cowry-dark">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-cowry-dark border-b border-cowry-border flex-shrink-0">
        <Link
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-cowry-card border border-cowry-border hover:border-cowry-green/40 transition-colors"
          title="Back to homepage"
        >
          <Image src="/logo.png" alt="Cowry" width={18} height={18} />
        </Link>

        <button
          className="flex items-center gap-1.5 text-xs font-medium text-white border border-cowry-green/60 rounded-full px-4 py-1.5 hover:border-cowry-green transition-colors"
          title={address ?? undefined}
        >
          <span>{shortAddress ?? "MiniPay"}</span>
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-cowry-green">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCrossChainSend(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cowry-card transition-colors"
            title="Send USDC from Celo to another chain"
          >
            <Image src="/Vector%202.png" alt="Send" width={18} height={18} />
          </button>
        </div>
      </div>

      {wrongChain && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <p className="text-xs text-amber-400">Switch to Celo to send payments</p>
          <button onClick={ensureCelo} className="text-xs font-semibold text-amber-300 hover:text-amber-100 transition-colors">
            Switch
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-cowry-darker">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-16 sm:pt-24">
            <div className="flex flex-col gap-3 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                  className="flex items-center gap-3 text-left text-sm bg-cowry-card border border-cowry-green/30 hover:border-cowry-green/70 text-gray-300 hover:text-white pl-2 pr-4 py-2 rounded-full transition-all"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full border border-cowry-green/40 flex-shrink-0">
                    <Image src={s.icon} alt="" width={16} height={16} />
                  </span>
                  {s.text}
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
            onApprove={(txs, symbol) =>
              signAndSend(txs, symbol ?? "USDC", { continuePendingDraft: true })
            }
            txLoading={txLoading}
          />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#141C16] border border-cowry-green/10 rounded-[22px] px-4 py-3">
              <span className="inline-flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-cowry-green rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="bg-cowry-dark border-t border-cowry-border px-3 py-3 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setShowCommands((v) => !v)}
          className="w-11 h-11 bg-cowry-card border border-cowry-border rounded-full flex items-center justify-center flex-shrink-0 hover:border-cowry-green/40 hover:text-cowry-green text-cowry-muted transition-all"
          title={showCommands ? "Close commands" : "Browse commands"}
        >
          {showCommands ? (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.42 1.42 6.3 6.3-6.3 6.3 1.42 1.42 6.3-6.3 6.3 6.3 1.42-1.42-6.3-6.3 6.3-6.3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current">
              <rect x="4" y="6" width="16" height="2" rx="1" />
              <rect x="4" y="11" width="16" height="2" rx="1" />
              <rect x="4" y="16" width="10" height="2" rx="1" />
            </svg>
          )}
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type or record a command"
          disabled={loading}
          className="flex-1 bg-cowry-card border border-cowry-border rounded-full px-4 py-3 text-sm text-white placeholder-cowry-muted outline-none focus:border-cowry-green/50 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={loading ? stop : handleSend}
          disabled={!loading && !input.trim()}
          className="w-11 h-11 bg-cowry-green rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-all hover:brightness-110"
        >
          {loading ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-cowry-darker">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : input.trim() ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-cowry-darker translate-x-0.5">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z" />
            </svg>
          )}
        </button>
      </div>

      {showCrossChainSend && address && (
        <CrossChainSendPanel
          walletAddress={address}
          onClose={() => setShowCrossChainSend(false)}
          onSuccess={(msg) => { setShowCrossChainSend(false); addBotMessage(msg); }}
        />
      )}

      {showCommands && (
        <CommandMenu
          onSelect={(template) => {
            setInput(template);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onOpenCrossChain={() => { setShowCommands(false); setShowCrossChainSend(true); }}
          onClose={() => setShowCommands(false)}
        />
      )}
    </div>
  );
}
