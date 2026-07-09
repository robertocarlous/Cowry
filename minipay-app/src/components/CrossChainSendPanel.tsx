"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { isAddress } from "viem";
import { getBridgeChains, getBridgeQuote, getBridgeStatus } from "@/lib/agent";
import { formatBridgeSignError } from "@/lib/bridgeErrors";
import { encodeErc20Approve, MAX_UINT256, readErc20Allowance, readErc20Balance } from "@/lib/erc20";
import { sendTransaction, shortAddress, waitForTransaction } from "@/lib/wallet";

import type { ChainInfo, BridgeQuoteResult } from "@/lib/types";

const CELO_CHAIN_ID = 42220;
const LIFI_DIAMOND  = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as const;

const fieldClass =
  "w-full bg-cowry-card border border-cowry-border rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cowry-green/50 transition-colors appearance-none";

const labelClass = "block text-[10px] font-semibold text-cowry-green uppercase tracking-widest mb-1.5";

const CHAIN_LOGOS: Record<string, string> = {
  Ethereum:    "/Ethereum.svg",
  Optimism:    "/Optimism.svg",
  "BNB Chain": "/BNBChain.svg",
  Polygon:     "/Polygon.svg",
  Base:        "/Base.svg",
  Arbitrum:    "/Arbitrum.svg",
  Linea:       "/Linea.svg",
  Scroll:      "/Scroll.svg",
  Celo:        "/celo.png",
};

function TokenLogo({ label }: { label: string }) {
  if (label === "USDC") {
    return (
      <svg viewBox="0 0 32 32" className="flex-shrink-0 w-6 h-6">
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path
          fill="#fff"
          d="M16 26c-5.5 0-10-4.5-10-10S10.5 6 16 6s10 4.5 10 10-4.5 10-10 10z"
        />
        <path
          fill="#2775CA"
          d="M20.5 18.5c0-2.3-1.4-3.1-4.2-3.4-2-.3-2.4-.7-2.4-1.6 0-.9.6-1.4 1.9-1.4 1.2 0 1.8.4 2.1 1.4a.6.6 0 00.6.4h1c.3 0 .5-.2.5-.5v-.1c-.3-1.6-1.6-2.8-3.2-2.9v-1.4c0-.3-.2-.5-.6-.5h-.9c-.3 0-.5.2-.5.5v1.4c-2 .3-3.3 1.6-3.3 3.3 0 2.1 1.3 3 4.1 3.3 1.9.3 2.5.6 2.5 1.7s-.9 1.7-2.2 1.7c-1.7 0-2.3-.7-2.5-1.6a.6.6 0 00-.6-.4h-1.1c-.3 0-.5.2-.5.5v.1c.3 1.8 1.5 3 3.5 3.3v1.4c0 .3.2.5.6.5h.9c.3 0 .5-.2.5-.5v-1.4c2-.4 3.4-1.7 3.4-3.5z"
        />
        <path
          fill="#fff"
          d="M12.9 23.4c-4.1-1.5-6.2-6-4.7-10 .8-2.2 2.5-3.9 4.7-4.7.2-.1.3-.3.3-.5v-.9c0-.2-.1-.4-.3-.4h-.2c-5.1 1.6-7.9 7-6.3 12.1 1 3.1 3.4 5.5 6.3 6.3h.2c.2 0 .3-.2.3-.4v-.9c0-.2-.1-.5-.3-.6zM19.3 6.9c-.2.1-.3.3-.3.5v.9c0 .2.1.5.3.6 4.1 1.5 6.2 6 4.7 10-.8 2.2-2.5 3.9-4.7 4.7-.2.1-.3.3-.3.5v.9c0 .2.1.4.3.4h.2c5.1-1.6 7.9-7 6.3-12.1-1-3.1-3.4-5.5-6.3-6.3h-.2z"
        />
      </svg>
    );
  }
  if (label === "USDT") {
    return (
      <svg viewBox="0 0 32 32" className="flex-shrink-0 w-6 h-6">
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path
          fill="#fff"
          d="M17.9 17.4v-.01c-.1 0-.62.04-1.77.04-.92 0-1.57-.03-1.8-.04v.01c-3.6-.16-6.28-.79-6.28-1.55s2.68-1.39 6.28-1.55v2.47c.23.02.9.06 1.81.06 1.1 0 1.65-.04 1.76-.06V14.3c3.59.16 6.26.79 6.26 1.55s-2.67 1.39-6.26 1.55zm0-3.35v-2.21h5v-3.32H9.17v3.32h5v2.21c-4.07.19-7.13 1-7.13 1.96s3.06 1.77 7.13 1.96v7h3.73v-7c4.06-.19 7.11-1 7.11-1.96s-3.05-1.77-7.11-1.96z"
        />
      </svg>
    );
  }
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cowry-green flex items-center justify-center text-[10px] font-bold text-black">
      {label.slice(0, 1)}
    </span>
  );
}

function ChainLogo({ name }: { name: string }) {
  const src = CHAIN_LOGOS[name];
  if (src) {
    return (
      <Image src={src} alt={name} width={24} height={24} className="flex-shrink-0 w-6 h-6 rounded-full object-contain" />
    );
  }
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cowry-green/20 border border-cowry-green/40 flex items-center justify-center text-[10px] font-bold text-cowry-green">
      {name.slice(0, 1)}
    </span>
  );
}

interface Props {
  walletAddress: string;
  onClose:       () => void;
  onSuccess:     (msg: string) => void;
}

type Step = "form" | "quote" | "approving" | "executing" | "polling" | "done" | "error";

function celoSourceTokens(celo: ChainInfo): { label: string; value: string; decimals: number }[] {
  const opts: { label: string; value: string; decimals: number }[] = [];
  if (celo.usdc) opts.push({ label: "USDC", value: celo.usdc, decimals: celo.usdcDecimals });
  if (celo.usdm) opts.push({ label: "USDm", value: celo.usdm, decimals: celo.usdmDecimals ?? 18 });
  return opts;
}

/** Send USDC from Celo (USDC or USDm) to USDC on another chain. */
export function CrossChainSendPanel({ walletAddress, onClose, onSuccess }: Props) {
  const [celo,         setCelo]         = useState<ChainInfo | null>(null);
  const [destinations, setDestinations] = useState<ChainInfo[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);
  const [step,       setStep]       = useState<Step>("form");
  const [error,      setError]      = useState("");

  const [fromToken,        setFromToken]        = useState("");
  const [toChainId,        setToChainId]        = useState<number>(1);
  const [amount,           setAmount]           = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");

  const [quote,       setQuote]       = useState<BridgeQuoteResult | null>(null);
  const [txHash,      setTxHash]      = useState("");
  const [pollCount,   setPollCount]   = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    getBridgeChains()
      .then(({ source, destinations: dests }) => {
        setCelo(source);
        setDestinations(dests);
        const tokens = celoSourceTokens(source);
        if (tokens[0]) setFromToken(tokens[0].value);
        const firstDest = dests[0];
        if (firstDest) setToChainId(firstDest.chainId);
      })
      .catch(() => setError("Failed to load destination chains"))
      .finally(() => setChainsLoading(false));
  }, []);

  // Intentionally not pre-filling recipient — user must explicitly enter
  // the destination address to avoid accidental self-sends.

  const toChain = destinations.find((c) => c.chainId === toChainId);
  const sourceTokens = celo ? celoSourceTokens(celo) : [];
  const selectedSource = sourceTokens.find((t) => t.value === fromToken);

  const recipient = recipientAddress.trim();
  const recipientValid = recipient.length > 0 && isAddress(recipient);
  const sendingToSelf =
    recipientValid &&
    recipient.toLowerCase() === walletAddress.toLowerCase();

  const handleGetQuote = async () => {
    if (!amount || !fromToken || !toChain?.usdc || !celo) return;
    if (!recipientValid) {
      setError("Enter a valid recipient address (0x…).");
      return;
    }
    setError("");
    setStep("quote");
    try {
      const decimals = selectedSource?.decimals ?? 6;
      const fromAmount = String(Math.round(Number(amount) * 10 ** decimals));
      const q = await getBridgeQuote({
        fromChainId:      CELO_CHAIN_ID,
        fromTokenAddress: fromToken,
        fromAmount,
        fromAddress:      walletAddress,
        toChainId,
        toTokenAddress:   toChain.usdc,
        toAddress:        recipient as `0x${string}`,
      });
      setQuote(q);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Could not get quote";
      // "No route available…" and "No zero-fee route…" are already user-facing from bridgeClient
      setError(raw);
      setStep("form");
    }
  };

  const handleExecute = async () => {
    if (!quote || !amount || !fromToken || !toChain?.usdc || !recipientValid) return;
    setError("");
    try {
      const decimals  = selectedSource?.decimals ?? 6;
      const fromAmount = String(Math.round(Number(amount) * 10 ** decimals));
      const token  = fromToken as `0x${string}`;
      const owner  = walletAddress as `0x${string}`;
      const needed = BigInt(fromAmount);

      // 1. Balance check
      const balance = await readErc20Balance(token, owner);
      if (balance < needed) {
        throw new Error(`Insufficient ${selectedSource?.label ?? "token"} balance on Celo.`);
      }

      // 2. One-time approval of the LI.FI bridge spender
      // The spender comes from the quote (usually LI.FI Diamond). This is a one-time
      // MAX_UINT256 approval — subsequent sends skip this step automatically.
      const spender = (quote.approvalAddress || LIFI_DIAMOND) as `0x${string}`;
      const allowance = await readErc20Allowance(token, owner, spender);
      if (allowance < needed) {
        setStep("approving");
        const approveHash = await sendTransaction({
          to:    token,
          data:  encodeErc20Approve(token, spender, MAX_UINT256),
          value: "0x0",
        });
        await waitForTransaction(approveHash);
        const allowanceAfter = await readErc20Allowance(token, owner, spender);
        if (allowanceAfter < needed) {
          throw new Error("Approval did not complete. Confirm in MiniPay and try again.");
        }
      }

      // 3. Fetch a fresh quote right before signing — avoids bridge calldata expiry
      // (some bridges like Squid embed time-sensitive payloads in the calldata).
      setStep("executing");
      const freshQuote = await getBridgeQuote({
        fromChainId:      CELO_CHAIN_ID,
        fromTokenAddress: fromToken,
        fromAmount,
        fromAddress:      walletAddress,
        toChainId,
        toTokenAddress:   toChain.usdc,
        toAddress:        recipient as `0x${string}`,
      });

      // 4. User signs the bridge tx directly from their wallet — no agent, no risk of
      // funds getting stuck. LI.FI pulls USDC from user via the approval above.
      const hash = await sendTransaction({
        to:    freshQuote.transactionRequest.to    as `0x${string}`,
        data:  freshQuote.transactionRequest.data  as `0x${string}`,
        value: freshQuote.transactionRequest.value || "0x0",
      });
      setTxHash(hash);
      setStep("polling");
      pollStatus(hash);
    } catch (e) {
      setError(formatBridgeSignError(e));
      setStep("quote");
    }
  };

  const pollStatus = async (hash: string) => {
    let tries = 0;
    const interval = setInterval(async () => {
      tries++;
      setPollCount(tries);
      try {
        const s = await getBridgeStatus(hash, CELO_CHAIN_ID, toChainId);
        if (s.status === "DONE") {
          clearInterval(interval);
          setStep("done");
          onSuccess(
            `Sent! USDC delivered to ${shortAddress(recipient)} on ${toChain?.name ?? "destination chain"}.`,
          );
        } else if (s.status === "FAILED") {
          clearInterval(interval);
          setError("Send failed — no funds were moved.");
          setStep("error");
        } else if (tries >= 40) {
          clearInterval(interval);
          setStep("done");
          onSuccess(`Send in progress. Track on CeloScan: celoscan.io/tx/${hash}`);
        }
      } catch { /* keep polling */ }
    }, 15_000);
  };

  const resetQuote = () => {
    setQuote(null);
    setStep("form");
  };

  return (
    <div className="absolute inset-0 z-50 bg-cowry-darker flex flex-col">
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 py-4 border-b border-cowry-border flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Back"
            className="text-white hover:text-cowry-green transition-colors -ml-1 p-1"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-white">Cross-chain send</h2>
            <p className="text-[10px] text-cowry-muted">Celo USDC / USDm → USDC on another chain</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-5">
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {step === "form" || step === "quote" ? (
            <div className="space-y-5">
              {chainsLoading ? (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="w-10 h-10 rounded-full border-4 border-cowry-green border-t-transparent animate-spin" />
                  <p className="text-xs text-cowry-muted">Loading destinations…</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-semibold text-cowry-muted uppercase tracking-widest mb-2">
                      You send · Celo
                    </p>
                    <div className="bg-cowry-card border border-cowry-border rounded-2xl p-4 space-y-4">
                      <div>
                        <label className="text-xs text-cowry-muted mb-1 block">Amount</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => { setAmount(e.target.value); resetQuote(); }}
                          className="w-full bg-transparent border-none outline-none text-4xl font-bold text-white placeholder-cowry-muted/30"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-cowry-muted mb-1 block">Token</label>
                        <div className="relative">
                          <select
                            className={fieldClass + " pl-9"}
                            value={fromToken}
                            onChange={(e) => { setFromToken(e.target.value); resetQuote(); }}
                          >
                            {sourceTokens.map((t) => (
                              <option key={t.value} value={t.value} className="bg-cowry-card">
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2">
                            <TokenLogo label={selectedSource?.label ?? "?"} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center -my-1 text-cowry-muted">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current opacity-50">
                      <path d="M12 16l-6-6h12l-6 6z" />
                    </svg>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-cowry-muted uppercase tracking-widest mb-2">
                      Recipient receives
                    </p>
                    <div className="bg-cowry-darker border border-cowry-border rounded-2xl p-4 space-y-3">
                      <div>
                        <label className="text-[10px] text-cowry-muted mb-1 block">Chain</label>
                        <div className="relative">
                          <select
                            className={fieldClass + " pl-9"}
                            value={toChainId}
                            onChange={(e) => {
                              setToChainId(Number(e.target.value));
                              resetQuote();
                            }}
                          >
                            {destinations.map((c) => (
                              <option key={c.chainId} value={c.chainId} className="bg-cowry-card">
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2">
                            <ChainLogo name={toChain?.name ?? "?"} />
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-cowry-muted mb-1 block">Recipient address</label>
                        <input
                          type="text"
                          value={recipientAddress}
                          onChange={(e) => {
                            setRecipientAddress(e.target.value);
                            resetQuote();
                          }}
                          placeholder="0x…"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          className={fieldClass + (recipient && !recipientValid ? " border-red-500/50" : "")}
                        />
                      </div>
                      {/* Quick-fill: only shown when field is empty or user hasn't typed their own address */}
                      {!sendingToSelf && (
                        <button
                          type="button"
                          onClick={() => { setRecipientAddress(walletAddress); resetQuote(); }}
                          className="text-[10px] text-cowry-green hover:text-cowry-mint transition-colors"
                        >
                          Send to myself ({shortAddress(walletAddress)})
                        </button>
                      )}
                      {sendingToSelf && (
                        <p className="text-[10px] text-amber-400">⚠️ Sending to your own wallet</p>
                      )}
                      <div>
                        <label className="text-[10px] text-cowry-muted mb-1 block">Token</label>
                        <div className={fieldClass + " opacity-80 cursor-default flex items-center gap-2"}>
                          <TokenLogo label="USDC" /> USDC
                        </div>
                      </div>
                      <p className="text-[10px] text-cowry-muted">
                        USDC on {toChain?.name ?? "destination"} at the address above
                      </p>
                    </div>
                  </div>

                  {quote && (
                    <div className="bg-cowry-card border border-cowry-green/30 rounded-2xl p-4 space-y-2">
                      <p className="text-[10px] font-semibold text-cowry-green uppercase tracking-widest">
                        Route · {quote.tool}
                      </p>
                      <p className="text-xs text-cowry-muted whitespace-pre-wrap leading-relaxed">
                        {quote.summary}
                      </p>
                      <p className="text-[10px] text-cowry-muted border-t border-cowry-border/50 pt-2">
                        You sign two transactions in MiniPay: a one-time approval (first time only), then the bridge send. Your funds stay in your wallet until you confirm.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : step === "approving" ? (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-cowry-mint border-t-transparent animate-spin" />
              <h3 className="text-base font-bold text-white">Approve token access</h3>
              <p className="text-sm text-cowry-muted max-w-xs">
                Confirm the one-time approval in MiniPay so the bridge can move your {selectedSource?.label ?? "tokens"}. You will not need to do this again.
              </p>
            </div>
          ) : step === "executing" ? (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-cowry-green border-t-transparent animate-spin" />
              <h3 className="text-base font-bold text-white">Confirm in MiniPay…</h3>
              <p className="text-sm text-cowry-muted max-w-xs">
                Confirm the bridge transaction in your MiniPay wallet to send.
              </p>
            </div>
          ) : step === "polling" ? (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-cowry-blue border-t-transparent animate-spin" />
              <h3 className="text-base font-bold text-white">Sending cross-chain…</h3>
              <p className="text-xs text-cowry-muted">
                Waiting for delivery… ({pollCount} {pollCount === 1 ? "check" : "checks"})
              </p>
              {txHash && (
                <a
                  href={`https://celoscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cowry-blue underline underline-offset-2 hover:text-cowry-mint transition-colors"
                >
                  View on CeloScan
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <span className="text-4xl">{step === "done" ? "✅" : "❌"}</span>
              <h3 className="text-base font-bold text-white">
                {step === "done" ? "Send complete" : "Send failed"}
              </h3>
              <p className="text-sm text-cowry-muted max-w-xs">
                {step === "done"
                  ? `USDC is on the way to ${shortAddress(recipient)} on ${toChain?.name ?? "the destination chain"}.`
                  : error}
              </p>
              <button
                onClick={onClose}
                className="mt-2 text-sm text-cowry-green hover:text-cowry-mint font-medium transition-colors"
              >
                Back to chat
              </button>
            </div>
          )}
        </div>

        {(step === "form" || step === "quote") && !chainsLoading && (
          <div className="flex-shrink-0 px-4 pb-6 pt-2 border-t border-cowry-border">
            <button
              onClick={quote ? handleExecute : handleGetQuote}
              disabled={(step === "quote" && !quote) || !amount || !fromToken || !toChain?.usdc || !recipientValid}
              className="w-full py-3.5 rounded-full font-bold text-sm transition-all flex items-center justify-center gap-2
                bg-cowry-green text-black active:scale-95
                disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {step === "quote" && !quote
                ? "Getting quote…"
                : quote
                  ? "Confirm send"
                  : "Get quote"}
              {!(step === "quote" && !quote) && (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
