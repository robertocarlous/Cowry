"use client";
import { useState } from "react";
import Image from "next/image";
import { encodeErc20Approve, MAX_UINT256 } from "@/lib/erc20";
import { sendTransaction, switchToCelo } from "@/lib/wallet";

// CowryPay v2 contract — the spender that needs approval
const COWRYPAY = "0xf253dde47ca717737be3aefb76326180c2239e04" as const;
const USDM     = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const USDC     = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;

interface Props {
  address:     `0x${string}`;
  username:    string;
  onGranted:   () => void;
}

type Step = "idle" | "signing_usdm" | "signing_usdc" | "done" | "error";

export function GrantAccessScreen({ address, username, onGranted }: Props) {
  const [step,  setStep]  = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    setError(null);
    try {
      await switchToCelo();

      // Sign USDm approve
      setStep("signing_usdm");
      await sendTransaction({
        to:    USDM,
        data:  encodeErc20Approve(USDM, COWRYPAY, MAX_UINT256),
        value: "0x0",
      });

      // Sign USDC approve
      setStep("signing_usdc");
      await sendTransaction({
        to:    USDC,
        data:  encodeErc20Approve(USDC, COWRYPAY, MAX_UINT256),
        value: "0x0",
      });

      setStep("done");
      setTimeout(() => onGranted(), 1400);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setError("You cancelled. Tap Authorize to try again.");
      } else {
        setError(msg);
      }
      setStep("idle");
    }
  }

  const isSigning = step === "signing_usdm" || step === "signing_usdc";

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 bg-cowry-dark text-white">

      {/* Icon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-2xl blur-2xl bg-cowry-blue/25 scale-125" />
        <Image src="/cowry.png" alt="Cowry" width={80} height={80} className="relative rounded-2xl shadow-2xl" />
      </div>

      <h1 className="text-2xl font-black mb-1 text-center">Authorize Cowry AI</h1>
      <p className="text-cowry-muted text-sm text-center mb-7 max-w-xs leading-relaxed">
        Hi <span className="text-white font-semibold">@{username}</span>! Grant Cowry AI permission to
        execute payments on your behalf — you'll never need to sign a payment transaction again.
      </p>

      {/* Permission card */}
      <div className="w-full max-w-sm bg-cowry-card border border-cowry-border rounded-2xl overflow-hidden mb-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-cowry-blue/10 to-cowry-purple/10 border-b border-cowry-border px-4 py-3 flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-xs font-semibold text-cowry-blue uppercase tracking-widest">
            Cowry AI Permissions
          </span>
        </div>

        {/* Allowed */}
        <div className="px-4 py-4 space-y-2.5">
          {[
            "Send USDm & USDC from your wallet",
            "Execute group payments in one tap",
            "Pay on your behalf after you confirm",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm">
              <span className="text-cowry-blue mt-0.5 flex-shrink-0">✓</span>
              <span className="text-cowry-muted">{item}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-cowry-border" />

        {/* Never */}
        <div className="px-4 py-4 space-y-2.5">
          {[
            "Move funds without your confirmation",
            "Access funds beyond your approved limit",
            "Share or store your private key",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm">
              <span className="text-red-400/70 mt-0.5 flex-shrink-0">✗</span>
              <span className="text-cowry-muted/70">{item}</span>
            </div>
          ))}
        </div>

        {/* One-time notice */}
        <div className="mx-4 mb-4 px-3 py-2 bg-cowry-blue/5 border border-cowry-blue/15 rounded-xl">
          <p className="text-[11px] text-cowry-blue/80 text-center leading-relaxed">
            This is a <strong>one-time</strong> authorization.
            You only sign twice now — never again for payments.
          </p>
        </div>
      </div>

      {/* Step indicators */}
      {isSigning && (
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex items-center gap-1.5 text-xs ${step === "signing_usdm" ? "text-cowry-blue" : "text-green-400"}`}>
            {step === "signing_usdm"
              ? <><Spinner /><span>Approving USDm…</span></>
              : <><span>✓</span><span>USDm approved</span></>
            }
          </div>
          <span className="text-cowry-border">·</span>
          <div className={`flex items-center gap-1.5 text-xs ${step === "signing_usdc" ? "text-cowry-blue" : "text-cowry-muted"}`}>
            {step === "signing_usdc"
              ? <><Spinner /><span>Approving USDC…</span></>
              : <span>Approve USDC</span>
            }
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-2xl">
            ✅
          </div>
          <p className="text-green-400 text-sm font-semibold">Access granted! Opening Cowry…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs text-center mb-4 max-w-xs">{error}</p>
      )}

      {/* CTA */}
      {step !== "done" && (
        <button
          onClick={handleGrant}
          disabled={isSigning}
          className="w-full max-w-sm bg-cowry-blue text-cowry-darker font-bold py-3.5 rounded-2xl text-sm hover:bg-cowry-mint active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSigning ? (
            <><Spinner /><span>Sign in MiniPay ({step === "signing_usdm" ? "1" : "2"}/2)…</span></>
          ) : (
            <>🔓 Authorize — Sign Twice</>
          )}
        </button>
      )}

      <p className="mt-4 text-[10px] text-cowry-border text-center max-w-xs leading-relaxed">
        This approves the{" "}
        <a
          href="https://celoscan.io/address/0xf253dde47ca717737be3aefb76326180c2239e04"
          target="_blank" rel="noopener noreferrer"
          className="text-cowry-blue hover:underline font-mono"
        >
          CowryPay
        </a>
        {" "}contract to move tokens from your wallet on your behalf.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
