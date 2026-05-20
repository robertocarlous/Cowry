"use client";
import { useState, useCallback, useRef } from "react";
import { chat } from "@/lib/agent";
import { sendTransaction } from "@/lib/wallet";
import type { Message, ChatResponse, EncodedTxJson } from "@/lib/types";

let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) _sessionId = `session_${Date.now()}`;
  return _sessionId;
}

export function useChat(walletAddress: string | null) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const addMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    const full: Message = { ...msg, id: crypto.randomUUID(), timestamp: new Date() };
    setMessages((prev) => [...prev, full]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    return full;
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!walletAddress || loading) return;

      addMessage({ role: "user", text });
      setLoading(true);

      try {
        const response = await chat(text, walletAddress, getSessionId());
        const botText = responseToText(response);
        addMessage({ role: "bot", text: botText, response });
      } catch (e) {
        addMessage({
          role: "bot",
          text: `⚠️ ${e instanceof Error ? e.message : "Something went wrong"}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, loading, addMessage],
  );

  /** Called when user taps Confirm on a draft card */
  const confirm = useCallback(async () => {
    await send("confirm");
  }, [send]);

  /** Called when user taps Cancel on a draft card */
  const cancel = useCallback(async () => {
    await send("cancel");
  }, [send]);

  /** Sign and broadcast all transactions from a tx_ready response */
  const signAndSend = useCallback(
    async (transactions: EncodedTxJson[], tokenSymbol: string) => {
      setTxLoading(true);
      const hashes: string[] = [];
      try {
        for (const tx of transactions) {
          const hash = await sendTransaction(tx);
          hashes.push(hash);
        }
        const links = hashes
          .map((h) => `[View tx](https://celoscan.io/tx/${h})`)
          .join("\n");
        addMessage({
          role: "bot",
          text: `✅ Payment sent in ${tokenSymbol}!\n\n${links}`,
        });
      } catch (e) {
        addMessage({
          role: "bot",
          text: `❌ Transaction failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setTxLoading(false);
      }
    },
    [addMessage],
  );

  return { messages, loading, txLoading, send, confirm, cancel, signAndSend, bottomRef };
}

function responseToText(r: ChatResponse): string {
  switch (r.type) {
    case "clarify":  return r.question;
    case "info":     return r.message;
    case "cancelled":return r.message;
    case "draft":    return r.preview;
    case "tx_ready": return r.preview;
    default:         return "...";
  }
}
