import type { ParsedIntent } from "./schemas.js";

function paymentToken(raw: string | undefined): "USDC" | "USDm" | "USDT" | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t === "usdc") return "USDC";
  if (t === "usdm") return "USDm";
  if (t === "usdt" || t === "tether") return "USDT";
  if (t === "usd" || t.startsWith("dollar")) return "USDC";
  return undefined;
}

function withPaymentToken<T extends ParsedIntent>(intent: T, tokenRaw: string | undefined): T {
  const token = paymentToken(tokenRaw);
  return token ? ({ ...intent, token } as T) : intent;
}

/** Captures optional token after amount: "1 USDC", "20 usdm", "$5", etc. */
const AMT_TOKEN = String.raw`([\d,]+(?:\.\d+)?)\s*\$?\s*(usdc|usdm|usdt|tether|usd|dollars?)?`;

function parseMoneyAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Deterministic parser for tests and offline use.
 * Returns null if no rule matches (caller may try LLM).
 */
export function ruleParse(message: string): ParsedIntent | null {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  // BALANCE: "my balance", "balance", "how much do I have", "check balance"
  if (/^(my\s+)?balance\s*\.?$/i.test(lower) || /\bcheck\s+(my\s+)?balance\b/i.test(lower) || /\bhow\s+much\s+(do\s+i\s+have|usdc|usdm)\b/i.test(lower)) {
    return { kind: "admin", action: "BALANCE" };
  }

  // Greetings → welcome message
  if (/^(hi|hello|hey|start|good\s+morning|good\s+evening|what.s\s+up|sup)\b/i.test(lower)) {
    return { kind: "admin", action: "CHAT" };
  }

  if (lower.includes("help") && lower.split(/\s+/).length <= 3) {
    return { kind: "admin", action: "HELP" };
  }

  const approveFor = raw.match(
    new RegExp(`^approve\\s+\\$?\\s*${AMT_TOKEN}\\s+for\\s+cowry(?:pay)?\\s*\\.?$`, "i"),
  );
  if (approveFor) {
    const amount = parseMoneyAmount(approveFor[1]!);
    if (amount != null) {
      return withPaymentToken(
        { kind: "admin", action: "APPROVE_USDC", amount },
        approveFor[2],
      );
    }
  }

  const approveSpend = raw.match(
    new RegExp(
      `^(?:approve|allow)\\s+cowry(?:pay)?\\s+to\\s+spend\\s+\\$?\\s*${AMT_TOKEN}\\s*\\.?$`,
      "i",
    ),
  );
  if (approveSpend) {
    const amount = parseMoneyAmount(approveSpend[1]!);
    if (amount != null) {
      return withPaymentToken(
        { kind: "admin", action: "APPROVE_USDC", amount },
        approveSpend[2],
      );
    }
  }

  return null;
}
