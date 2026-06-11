"use client";
import { useState, useCallback, useRef } from "react";
import { chat } from "@/lib/agent";
import { sendTransaction, waitForTransaction } from "@/lib/wallet";
import type { Message, ChatResponse, EncodedTxJson } from "@/lib/types";

let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) _sessionId = `session_${Date.now()}`;
  return _sessionId;
}

export function useChat(walletAddress: string | null) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(false);
  /**
   * txLoading is now only used for the USDC approval step (user still signs that).
   * Payment transactions are executed by the agent — no user signing required.
   */
  const [txLoading, setTxLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    const full: Message = { ...msg, id: crypto.randomUUID(), timestamp: new Date() };
    setMessages((prev) => [...prev, full]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    return full;
  }, []);

  const appendBotResponse = useCallback((response: ChatResponse) => {
    const botText = responseToText(response);
    addMessage({ role: "bot", text: botText, response });
  }, [addMessage]);

  const fetchAgentResponse = useCallback(async (text: string, signal?: AbortSignal) => {
    if (!walletAddress) throw new Error("Wallet not connected");
    return chat(text, walletAddress, getSessionId(), signal);
  }, [walletAddress]);

  const send = useCallback(
    async (text: string) => {
      if (!walletAddress || loading) return;

      addMessage({ role: "user", text });
      setLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetchAgentResponse(text, controller.signal);

        // ── Agent already sent the tx on-chain ─────────────────────────────
        // No signing needed — just show the success message with the explorer link.
        if (response.type === "tx_sent") {
          addMessage({
            role: "bot",
            text: "✅ Payment sent by Cowry AI agent!",
            response,
          });
          return;
        }

        appendBotResponse(response);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          addMessage({ role: "bot", text: "Stopped." });
          return;
        }
        addMessage({
          role: "bot",
          text: `⚠️ ${e instanceof Error ? e.message : "Something went wrong"}`,
        });
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [walletAddress, loading, addMessage, fetchAgentResponse, appendBotResponse],
  );

  /** Abort the in-flight chat request triggered by send(). */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /** Called when user taps Confirm on a draft card */
  const confirm = useCallback(async () => {
    addMessage({ role: "bot", text: "⏳ Cowry AI is executing your payment on-chain…" });
    await send("confirm");
  }, [send, addMessage]);

  /** Called when user taps Cancel on a draft card */
  const cancel = useCallback(async () => {
    await send("cancel");
  }, [send]);

  /**
   * After user approves USDC (user-signed), re-confirm so the agent can execute.
   * The approval is the ONLY tx the user ever signs.
   */
  async function continuePendingDraftAfterApproval() {
    addMessage({
      role: "bot",
      text: "✅ Approval confirmed. Cowry AI is executing your payment now…",
    });

    try {
      const response = await fetchAgentResponse("confirm");

      if (response.type === "tx_sent") {
        addMessage({
          role: "bot",
          text: `✅ Payment sent by Cowry AI agent!\n\n[View on CeloScan](${response.explorerUrl})`,
          response,
        });
        return;
      }

      // Fallback: agent not configured, user must sign manually
      if (response.type === "tx_ready") {
        await executeUserTransactions(response.tx.transactions, response.tx.token.symbol);
        return;
      }

      appendBotResponse(response);
    } catch (e) {
      addMessage({
        role: "bot",
        text:
          `⚠️ Approval succeeded, but the payment couldn't execute automatically: ` +
          `${e instanceof Error ? e.message : String(e)}.\n\nTap Confirm again to retry.`,
      });
    }
  }

  /**
   * Fallback: execute transactions from the USER's wallet.
   * Only used when AGENT_PRIVATE_KEY is not set on the server
   * or agent execution fails. Normal path is agent-executed.
   */
  async function executeUserTransactions(
    transactions: EncodedTxJson[],
    tokenSymbol: string,
    options?: { continuePendingDraft?: boolean },
  ) {
    const hashes: string[] = [];
    for (const tx of transactions) {
      const hash = await sendTransaction(tx);
      hashes.push(hash);
      if (options?.continuePendingDraft) {
        await waitForTransaction(hash);
      }
    }

    if (options?.continuePendingDraft) {
      await continuePendingDraftAfterApproval();
      return;
    }

    const links = hashes
      .map((h) => `[View tx](https://celoscan.io/tx/${h})`)
      .join("\n");
    addMessage({
      role: "bot",
      text: `✅ Payment sent in ${tokenSymbol}.\n\n${links}`,
    });
  }

  /**
   * Used only for USDC approval transactions (still signed by user's wallet).
   * Payment transactions are now handled by the agent — this is not called for those.
   */
  const signAndSend = useCallback(
    async (
      transactions: EncodedTxJson[],
      tokenSymbol: string,
      options?: { continuePendingDraft?: boolean },
    ) => {
      setTxLoading(true);
      try {
        await executeUserTransactions(transactions, tokenSymbol, options);
      } catch (e) {
        addMessage({
          role: "bot",
          text: `❌ Transaction failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setTxLoading(false);
      }
    },
    [addMessage, executeUserTransactions],
  );

  const addBotMessage = useCallback((text: string) => {
    addMessage({ role: "bot", text });
  }, [addMessage]);

  return { messages, loading, txLoading, send, stop, confirm, cancel, signAndSend, addBotMessage, bottomRef };
}

function responseToText(r: ChatResponse): string {
  switch (r.type) {
    case "clarify":    return r.question;
    case "info":       return r.message;
    case "cancelled":  return r.message;
    case "draft":      return r.preview;
    case "tx_ready":   return r.preview;
    case "tx_sent":    return "✅ Payment sent by Cowry AI agent!";
    case "tx_history": return `Here are your last ${r.items.length} transaction${r.items.length === 1 ? "" : "s"}:`;
    case "remittance_quote": return r.preview;
    default:           return "...";
  }
}
