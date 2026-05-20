"use client";
import { useState, useEffect } from "react";
import { getChains, getBridgeQuote, getBridgeStatus } from "@/lib/agent";
import { sendTransaction } from "@/lib/wallet";
import type { ChainInfo, BridgeQuoteResult } from "@/lib/types";

const CELO_CHAIN_ID = 42220;

interface Props {
  walletAddress: string;
  onClose:       () => void;
  onSuccess:     (msg: string) => void;
}

type Step = "form" | "quote" | "signing" | "polling" | "done" | "error";

export function BridgePanel({ walletAddress, onClose, onSuccess }: Props) {
  const [chains,     setChains]     = useState<ChainInfo[]>([]);
  const [step,       setStep]       = useState<Step>("form");
  const [error,      setError]      = useState("");

  // Form state
  const [fromChainId, setFromChainId] = useState<number>(1);        // Ethereum
  const [toChainId,   setToChainId]   = useState<number>(CELO_CHAIN_ID);
  const [fromToken,   setFromToken]   = useState("");
  const [toToken,     setToToken]     = useState("");
  const [amount,      setAmount]      = useState("");

  // Quote + bridge state
  const [quote,       setQuote]       = useState<BridgeQuoteResult | null>(null);
  const [txHash,      setTxHash]      = useState("");
  const [pollCount,   setPollCount]   = useState(0);

  useEffect(() => {
    getChains()
      .then((c) => {
        setChains(c);
        // Default fromToken = USDC on Ethereum, toToken = USDm on Celo
        const eth  = c.find((x) => x.chainId === 1);
        const celo = c.find((x) => x.chainId === CELO_CHAIN_ID);
        if (eth?.usdc)  setFromToken(eth.usdc);
        if (celo?.usdm) setToToken(celo.usdm);
      })
      .catch(() => setError("Failed to load chains"));
  }, []);

  const fromChain = chains.find((c) => c.chainId === fromChainId);
  const toChain   = chains.find((c) => c.chainId === toChainId);

  const tokenOptions = (chain: ChainInfo | undefined) => {
    if (!chain) return [];
    const opts: { label: string; value: string }[] = [];
    if (chain.usdc) opts.push({ label: "USDC", value: chain.usdc });
    if (chain.usdm) opts.push({ label: "USDm", value: chain.usdm });
    return opts;
  };

  const handleGetQuote = async () => {
    if (!amount || !fromToken || !toToken) return;
    setError("");
    setStep("quote");
    try {
      const decimals = fromChain?.usdcDecimals ?? 6;
      const fromAmount = String(Math.round(Number(amount) * 10 ** decimals));
      const q = await getBridgeQuote({
        fromChainId,
        fromTokenAddress: fromToken,
        fromAmount,
        fromAddress:      walletAddress,
        toChainId,
        toTokenAddress:   toToken,
        toAddress:        walletAddress,
      });
      setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote failed");
      setStep("form");
    }
  };

  const handleSign = async () => {
    if (!quote) return;
    setStep("signing");
    setError("");
    try {
      const hash = await sendTransaction({
        to:    quote.transactionRequest.to,
        data:  quote.transactionRequest.data,
        value: quote.transactionRequest.value,
      });
      setTxHash(hash);
      setStep("polling");
      pollStatus(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed");
      setStep("quote");
    }
  };

  const pollStatus = async (hash: string) => {
    let tries = 0;
    const interval = setInterval(async () => {
      tries++;
      setPollCount(tries);
      try {
        const s = await getBridgeStatus(hash, fromChainId, toChainId);
        if (s.status === "DONE") {
          clearInterval(interval);
          setStep("done");
          onSuccess(`✅ Bridge complete! Funds arrived on ${toChain?.name ?? "Celo"}.`);
        } else if (s.status === "FAILED") {
          clearInterval(interval);
          setError("Bridge failed — no funds were moved.");
          setStep("error");
        } else if (tries >= 40) {
          clearInterval(interval);
          setStep("done");
          onSuccess(`⏳ Bridge in progress. Track it at celoscan.io/tx/${hash}`);
        }
      } catch { /* keep polling */ }
    }, 15_000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full bg-white rounded-t-3xl px-5 pt-4 pb-8 max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-cowry-secondary">Cross-Chain Send</h2>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        {step === "form" || step === "quote" ? (
          <div className="space-y-4">
            {/* From chain */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From chain</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
                value={fromChainId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setFromChainId(id);
                  const c = chains.find((x) => x.chainId === id);
                  setFromToken(c?.usdc ?? c?.usdm ?? "");
                }}
              >
                {chains.filter((c) => c.chainId !== CELO_CHAIN_ID).map((c) => (
                  <option key={c.chainId} value={c.chainId}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* From token */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Token to send</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
              >
                {tokenOptions(fromChain).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* To chain */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To chain</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
                value={toChainId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setToChainId(id);
                  const c = chains.find((x) => x.chainId === id);
                  setToToken(c?.usdm ?? c?.usdc ?? "");
                }}
              >
                {chains.map((c) => (
                  <option key={c.chainId} value={c.chainId}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* To token */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Token to receive</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
              >
                {tokenOptions(toChain).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800"
              />
            </div>

            {/* Quote summary (shown after fetch) */}
            {quote && (
              <div className="bg-cowry-bubble rounded-xl p-3 text-sm space-y-1">
                <p className="font-medium text-cowry-secondary text-xs">Route: {quote.tool}</p>
                <p className="text-gray-600 whitespace-pre-wrap text-xs">{quote.summary}</p>
              </div>
            )}

            <button
              onClick={quote ? handleSign : handleGetQuote}
              disabled={step === "quote" && !quote}
              className="w-full bg-cowry-primary text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
            >
              {step === "quote" && !quote
                ? "Getting quote…"
                : quote
                  ? "Sign & Bridge"
                  : "Get Quote"}
            </button>
          </div>
        ) : step === "signing" ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-2xl animate-spin inline-block">⏳</p>
            <p className="text-sm text-gray-600">Signing transaction…</p>
          </div>
        ) : step === "polling" ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-2xl">🔗</p>
            <p className="text-sm font-medium text-cowry-secondary">Bridge in progress</p>
            <p className="text-xs text-gray-500">
              Checking status… ({pollCount} checks)
            </p>
            <a
              href={`https://celoscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cowry-primary underline"
            >
              View source tx
            </a>
          </div>
        ) : (
          <div className="text-center py-8 space-y-3">
            <p className="text-3xl">{step === "done" ? "✅" : "❌"}</p>
            <p className="text-sm text-gray-600">
              {step === "done" ? "Bridge complete!" : error}
            </p>
            <button
              onClick={onClose}
              className="mt-2 text-sm text-cowry-primary font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
