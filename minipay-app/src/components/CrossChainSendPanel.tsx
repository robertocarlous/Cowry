"use client";
import { useState, useEffect } from "react";
import { isAddress } from "viem";
import { getBridgeChains, getBridgeQuote, getBridgeStatus } from "@/lib/agent";
import { formatBridgeSignError } from "@/lib/bridgeErrors";
import { encodeErc20Approve, MAX_UINT256, readErc20Allowance, readErc20Balance } from "@/lib/erc20";
import { sendTransaction, shortAddress, waitForTransaction } from "@/lib/wallet";
import type { ChainInfo, BridgeQuoteResult } from "@/lib/types";

const CELO_CHAIN_ID = 42220;

const fieldClass =
  "w-full bg-cowry-card border border-cowry-border rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cowry-blue/50 transition-colors appearance-none";

const labelClass = "block text-[10px] font-semibold text-cowry-blue uppercase tracking-widest mb-1.5";

interface Props {
  walletAddress: string;
  onClose:       () => void;
  onSuccess:     (msg: string) => void;
}

type Step = "form" | "quote" | "approving" | "signing" | "polling" | "done" | "error";

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
      setError(e instanceof Error ? e.message : "Could not get send quote");
      setStep("form");
    }
  };

  const handleSign = async () => {
    if (!quote || !amount || !fromToken || !toChain?.usdc || !recipientValid) return;
    setError("");
    try {
      const decimals = selectedSource?.decimals ?? 6;
      const fromAmount = String(Math.round(Number(amount) * 10 ** decimals));

      // Fresh quote — stale calldata often reverts with TransferFromFailed.
      const fresh = await getBridgeQuote({
        fromChainId:      CELO_CHAIN_ID,
        fromTokenAddress: fromToken,
        fromAmount,
        fromAddress:      walletAddress,
        toChainId,
        toTokenAddress:   toChain.usdc,
        toAddress:        recipient as `0x${string}`,
      });
      setQuote(fresh);

      const token = fresh.fromTokenAddress as `0x${string}`;
      const spender = (fresh.approvalAddress || fresh.transactionRequest.to) as `0x${string}`;
      const needed = BigInt(fresh.fromAmount);
      const owner = walletAddress as `0x${string}`;

      const balance = await readErc20Balance(token, owner);
      if (balance < needed) {
        throw new Error(
          `Insufficient ${selectedSource?.label ?? "token"} balance on Celo for this send.`,
        );
      }

      let needsApproval = fresh.preflight?.needsApproval ?? true;
      if (!fresh.preflight) {
        const allowance = await readErc20Allowance(token, owner, spender);
        needsApproval = allowance < needed;
      }

      if (needsApproval) {
        setStep("approving");
        const approveHash = await sendTransaction({
          to:    token,
          data:  encodeErc20Approve(token, spender, MAX_UINT256),
          value: "0x0",
        });
        await waitForTransaction(approveHash);

        const allowanceAfter = await readErc20Allowance(token, owner, spender);
        if (allowanceAfter < needed) {
          throw new Error(
            "Token approval did not complete. Confirm the approval in MiniPay, then try again.",
          );
        }
      }

      setStep("signing");
      const hash = await sendTransaction({
        to:    fresh.transactionRequest.to,
        data:  fresh.transactionRequest.data,
        value: fresh.transactionRequest.value,
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
              <span className="text-lg">↗️</span>
              <div>
                <h2 className="text-sm font-bold text-white">Cross-chain send</h2>
                <p className="text-[10px] text-cowry-muted">Celo USDC / USDm → USDC on another chain</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-cowry-muted hover:text-white text-xs px-2 py-1 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4">
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {step === "form" || step === "quote" ? (
            <div className="space-y-4">
              {chainsLoading ? (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="w-10 h-10 rounded-full border-4 border-cowry-blue border-t-transparent animate-spin" />
                  <p className="text-xs text-cowry-muted">Loading destinations…</p>
                </div>
              ) : (
                <>
                  <div className="bg-cowry-card border border-cowry-border rounded-2xl p-4 space-y-3">
                    <p className={labelClass}>You send · Celo</p>
                    <div>
                      <label className="text-[10px] text-cowry-muted mb-1 block">Token</label>
                      <select
                        className={fieldClass}
                        value={fromToken}
                        onChange={(e) => { setFromToken(e.target.value); resetQuote(); }}
                      >
                        {sourceTokens.map((t) => (
                          <option key={t.value} value={t.value} className="bg-cowry-card">
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-cowry-muted mb-1 block">Amount</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => { setAmount(e.target.value); resetQuote(); }}
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  <div className="flex justify-center -my-1 text-cowry-muted">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current opacity-50">
                      <path d="M12 16l-6-6h12l-6 6z" />
                    </svg>
                  </div>

                  <div className="bg-cowry-darker border border-cowry-border rounded-2xl p-4 space-y-3">
                    <p className={labelClass}>Recipient receives</p>
                    <div>
                      <label className="text-[10px] text-cowry-muted mb-1 block">Chain</label>
                      <select
                        className={fieldClass}
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
                        className="text-[10px] text-cowry-blue hover:text-cowry-mint transition-colors"
                      >
                        Send to myself ({shortAddress(walletAddress)})
                      </button>
                    )}
                    {sendingToSelf && (
                      <p className="text-[10px] text-amber-400">⚠️ Sending to your own wallet</p>
                    )}
                    <div>
                      <label className="text-[10px] text-cowry-muted mb-1 block">Token</label>
                      <div className={fieldClass + " opacity-80 cursor-default"}>
                        USDC
                      </div>
                    </div>
                    <p className="text-[10px] text-cowry-muted">
                      USDC on {toChain?.name ?? "destination"} at the address above
                    </p>
                  </div>

                  {quote && (
                    <div className="bg-cowry-card border border-cowry-blue/30 rounded-2xl p-4 space-y-2">
                      <p className="text-[10px] font-semibold text-cowry-blue uppercase tracking-widest">
                        Route · {quote.tool}
                      </p>
                      <p className="text-xs text-cowry-muted whitespace-pre-wrap leading-relaxed">
                        {quote.summary}
                      </p>
                      <p className="text-[10px] text-cowry-muted border-t border-cowry-border/50 pt-2">
                        {quote.preflight?.needsApproval !== false
                          ? "You will sign twice: token approval, then the cross-chain send."
                          : "Confirm the send in MiniPay when prompted."}
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
                Confirm the approval in MiniPay so LI.FI can move your {selectedSource?.label ?? "tokens"} for this send.
              </p>
            </div>
          ) : step === "signing" ? (
            <div className="flex flex-col items-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-cowry-purple border-t-transparent animate-spin" />
              <h3 className="text-base font-bold text-white">Check your wallet</h3>
              <p className="text-sm text-cowry-muted max-w-xs">
                Confirm the cross-chain send in MiniPay (transaction on Celo)
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
                className="mt-2 text-sm text-cowry-blue hover:text-cowry-mint font-medium transition-colors"
              >
                Back to chat
              </button>
            </div>
          )}
        </div>

        {(step === "form" || step === "quote") && !chainsLoading && (
          <div className="flex-shrink-0 px-4 pb-6 pt-2 border-t border-cowry-border">
            <button
              onClick={quote ? handleSign : handleGetQuote}
              disabled={(step === "quote" && !quote) || !amount || !fromToken || !toChain?.usdc || !recipientValid}
              className="w-full py-3.5 rounded-full font-bold text-sm transition-all
                disabled:opacity-40 disabled:cursor-not-allowed
                enabled:bg-cowry-blue enabled:text-cowry-darker enabled:hover:bg-cowry-mint"
            >
              {step === "quote" && !quote
                ? "Getting quote…"
                : quote
                  ? "Continue in wallet"
                  : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
