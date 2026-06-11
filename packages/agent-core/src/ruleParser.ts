import type { ParsedIntent } from "./schemas.js";

function paymentToken(raw: string | undefined): "USDC" | "USDm" | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t === "usdc") return "USDC";
  if (t === "usdm") return "USDm";
  if (t === "usd" || t.startsWith("dollar")) return "USDC";
  return undefined;
}

function withPaymentToken<T extends ParsedIntent>(intent: T, tokenRaw: string | undefined): T {
  const token = paymentToken(tokenRaw);
  return token ? ({ ...intent, token } as T) : intent;
}

/** Captures optional token after amount: "1 USDC", "20 usdm", "$5", etc. */
const AMT_TOKEN = String.raw`([\d,]+(?:\.\d+)?)\s*\$?\s*(usdc|usdm|usd|dollars?)?`;

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

  // ── LI.FI Earn rules ──────────────────────────────────────────────────────

  // VIEW_POSITIONS: "show my yield positions", "what am I earning", "my positions"
  if (
    /\b(my|show)\b.*\b(position|earning|yield|deposit)\b/i.test(lower) ||
    /\b(what|how much)\b.*(earn|yield|position|morpho)\b/i.test(lower) ||
    /^(my\s+)?positions?\s*$/i.test(lower)
  ) {
    return { kind: "earn", action: "VIEW_POSITIONS" };
  }

  // DEPOSIT_YIELD: "deposit 0.1 usdc into vault 1", "put $50 into morpho", "deposit 0.1 into 1"
  const depositVault = lower.match(
    /(?:deposit|put|invest)\s+\$?\s*([\d.]+)\s*(?:usdc|usd|dollars?)?\s+(?:into|in|to)\s+(?:vault\s+)?(\d+|morpho|top)/i,
  );
  if (depositVault) {
    const amount = parseMoneyAmount(depositVault[1]!);
    const raw2 = depositVault[2]!.trim().toLowerCase();
    const vaultIndex = raw2 === "morpho" || raw2 === "top" ? 1 : parseInt(raw2, 10);
    if (amount != null) {
      return {
        kind: "earn",
        action: "DEPOSIT_YIELD",
        amount,
        vaultIndex: Number.isFinite(vaultIndex) ? vaultIndex : 1,
      };
    }
  }

  // DEPOSIT_YIELD (no vault specified): "deposit 0.1 usdc", "earn with 0.05 usdc"
  const depositSimple = lower.match(
    /^(?:deposit|invest|earn\s+with)\s+\$?\s*([\d.]+)\s*(?:usdc|usd|dollars?)?\s*\.?$/i,
  );
  if (depositSimple) {
    const amount = parseMoneyAmount(depositSimple[1]!);
    if (amount != null) {
      return { kind: "earn", action: "DEPOSIT_YIELD", amount, vaultIndex: 1 };
    }
  }

  // LIST_OPPORTUNITIES: "earn yield", "show vaults", "morpho", "best apy", "yield options"
  if (
    /\b(earn|yield|vault|invest|apy|morpho|usdc.*vault|best.*rate)\b/i.test(lower) &&
    !/\b(send|pay|split|register|approve|group)\b/i.test(lower)
  ) {
    return { kind: "earn", action: "LIST_OPPORTUNITIES" };
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

  const register = raw.match(
    /^(?:i\s+want\s+to\s+)?(?:register|claim)(?:\s+username)?(?:\s+as)?\s+@?([a-z0-9]{3,32})\s*\.?$/i,
  );
  if (register) {
    return {
      kind: "admin",
      action: "REGISTER_USERNAME",
      username: register[1]!.toLowerCase(),
    };
  }

  return null;
}
