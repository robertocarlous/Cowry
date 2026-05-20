"use client";
import { useState } from "react";
import Image from "next/image";
import {
  validateUsername,
  registerUsername,
  setCachedUsername,
  getUsernameFromChain,
  isRegisteredOnChain,
} from "@/lib/registry";
import { getPublicClient, switchToCelo } from "@/lib/wallet";

interface Props {
  address: `0x${string}`;
  onRegistered: (username: string) => void;
}

type Step = "input" | "signing" | "confirming" | "done" | "error";

export function RegisterScreen({ address, onRegistered }: Props) {
  const [name,    setName]    = useState("");
  const [step,    setStep]    = useState<Step>("input");
  const [error,   setError]   = useState<string | null>(null);
  const [txHash,  setTxHash]  = useState<string | null>(null);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const nameErr = name ? validateUsername(name) : null;
  const ready   = name.length >= 3 && !nameErr;

  async function handleRegister() {
    const err = validateUsername(name);
    if (err) { setError(err); return; }

    setError(null);
    setStep("signing");

    try {
      // Ensure the wallet is on Celo before signing
      await switchToCelo();
      const hash = await registerUsername(name.toLowerCase().trim());
      setTxHash(hash);
      setStep("confirming");

      // Wait for receipt
      const client = getPublicClient();
      await client.waitForTransactionReceipt({ hash });

      // Verify on-chain and cache
      const confirmed = await isRegisteredOnChain(address);
      if (!confirmed) throw new Error("Transaction confirmed but username not found on-chain yet. Please wait a moment and refresh.");

      setCachedUsername(address, name.toLowerCase().trim());
      setStep("done");

      setTimeout(() => onRegistered(name.toLowerCase().trim()), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStep("input");
    }
  }

  // ── Already registered on another device ───────────────────────────────────
  const [recovering, setRecovering] = useState(false);

  async function handleRecover() {
    setRecovering(true);
    setError(null);
    try {
      const username = await getUsernameFromChain(address);
      if (username) {
        setCachedUsername(address, username);
        onRegistered(username);
      } else {
        setError("No username found for this wallet on-chain.");
      }
    } catch {
      setError("Could not fetch username from chain. Try again.");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-cowry-dark text-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-cowry-border">
        <Image src="/cowry.png" alt="Cowry" width={32} height={32} className="rounded-lg" />
        <div>
          <p className="text-sm font-bold leading-tight">Cowry</p>
          <p className="text-[10px] text-cowry-muted">{short}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">

        {step === "done" ? (
          <>
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold mb-2">Welcome, @{name.toLowerCase()}!</h2>
            <p className="text-cowry-muted text-sm">Your username is now on-chain. Loading your wallet…</p>
          </>
        ) : step === "confirming" ? (
          <>
            <div className="w-12 h-12 rounded-full border-4 border-cowry-blue border-t-transparent animate-spin mb-4" />
            <h2 className="text-lg font-bold mb-2">Confirming on Celo…</h2>
            <p className="text-cowry-muted text-xs mb-3">Waiting for your transaction to be included in a block.</p>
            {txHash && (
              <a
                href={`https://celoscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cowry-blue text-xs underline underline-offset-2"
              >
                View on CeloScan →
              </a>
            )}
          </>
        ) : step === "signing" ? (
          <>
            <div className="w-12 h-12 rounded-full border-4 border-cowry-purple border-t-transparent animate-spin mb-4" />
            <h2 className="text-lg font-bold mb-2">Check your wallet</h2>
            <p className="text-cowry-muted text-sm">Approve the transaction in MiniPay to claim @{name.toLowerCase()}</p>
          </>
        ) : (
          <>
            {/* Logo */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full blur-2xl bg-cowry-blue/20 scale-150" />
              <Image src="/cowry.png" alt="Cowry" width={80} height={80} className="relative rounded-2xl" />
            </div>

            <h2 className="text-2xl font-black mb-2">Claim your @username</h2>
            <p className="text-cowry-muted text-sm mb-8 max-w-xs leading-relaxed">
              Your username is stored on-chain and permanently linked to your wallet.
              Others use it to pay you — no addresses needed.
            </p>

            {/* Input */}
            <div className="w-full max-w-xs mb-2">
              <div className="flex items-center gap-2 bg-cowry-card border border-cowry-border rounded-xl px-4 py-3 focus-within:border-cowry-blue transition-colors">
                <span className="text-cowry-muted font-medium">@</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                    setError(null);
                  }}
                  placeholder="yourname"
                  maxLength={32}
                  className="flex-1 bg-transparent outline-none text-white placeholder-cowry-muted text-sm"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                {ready && <span className="text-green-400 text-xs">✓</span>}
              </div>
            </div>

            {/* Validation hint */}
            <p className={`text-xs mb-6 h-4 ${nameErr ? "text-red-400" : "text-cowry-muted"}`}>
              {nameErr ?? (name ? `@${name} looks good` : "3–32 characters · a–z and 0–9 only")}
            </p>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs mb-4 max-w-xs">{error}</p>
            )}

            <button
              onClick={handleRegister}
              disabled={!ready}
              className="w-full max-w-xs py-3.5 rounded-full font-bold text-sm transition-all
                disabled:opacity-40 disabled:cursor-not-allowed
                enabled:bg-cowry-blue enabled:text-cowry-darker enabled:hover:bg-cowry-mint"
            >
              Claim @{name || "username"} →
            </button>

            {/* Already registered on another device */}
            <button
              onClick={handleRecover}
              disabled={recovering}
              className="mt-6 text-xs text-cowry-muted hover:text-white transition-colors underline underline-offset-2"
            >
              {recovering ? "Looking up your username…" : "Already registered? Recover your username →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
