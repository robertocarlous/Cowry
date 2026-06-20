function paymentToken(raw) {
    if (!raw) return undefined;
    const t = raw.toLowerCase();
    if (t === "usdc") return "USDC";
    if (t === "usdm") return "USDm";
    if (t === "usdt" || t === "tether") return "USDT";
    if (t === "usd" || t.startsWith("dollar")) return "USDC";
    return undefined;
}
function withPaymentToken(intent, tokenRaw) {
    const token = paymentToken(tokenRaw);
    return token ? {
        ...intent,
        token
    } : intent;
}
const AMT_TOKEN = String.raw`([\d,]+(?:\.\d+)?)\s*\$?\s*(usdc|usdm|usdt|tether|usd|dollars?)?`;
function parseMoneyAmount(raw) {
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
}
export function ruleParse(message) {
    const raw = message.trim();
    const lower = raw.toLowerCase();
    if (/^(my\s+)?balance\s*\.?$/i.test(lower) || /\bcheck\s+(my\s+)?balance\b/i.test(lower) || /\bhow\s+much\s+(do\s+i\s+have|usdc|usdm)\b/i.test(lower)) {
        return {
            kind: "admin",
            action: "BALANCE"
        };
    }
    if (/^(hi|hello|hey|start|good\s+morning|good\s+evening|what.s\s+up|sup)\b/i.test(lower)) {
        return {
            kind: "admin",
            action: "CHAT"
        };
    }
    if (lower.includes("help") && lower.split(/\s+/).length <= 3) {
        return {
            kind: "admin",
            action: "HELP"
        };
    }
    const approveFor = raw.match(new RegExp(`^approve\\s+\\$?\\s*${AMT_TOKEN}\\s+for\\s+cowry(?:pay)?\\s*\\.?$`, "i"));
    if (approveFor) {
        const amount = parseMoneyAmount(approveFor[1]);
        if (amount != null) {
            return withPaymentToken({
                kind: "admin",
                action: "APPROVE_USDC",
                amount
            }, approveFor[2]);
        }
    }
    const approveSpend = raw.match(new RegExp(`^(?:approve|allow)\\s+cowry(?:pay)?\\s+to\\s+spend\\s+\\$?\\s*${AMT_TOKEN}\\s*\\.?$`, "i"));
    if (approveSpend) {
        const amount = parseMoneyAmount(approveSpend[1]);
        if (amount != null) {
            return withPaymentToken({
                kind: "admin",
                action: "APPROVE_USDC",
                amount
            }, approveSpend[2]);
        }
    }
    return null;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/ruleParser.ts