export const TOKENS = {
    USDm: {
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        symbol: "USDm",
        decimals: 18
    },
    USDC: {
        address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        symbol: "USDC",
        decimals: 6
    },
    USDT: {
        address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        symbol: "USDT",
        decimals: 6
    }
};
export const DEFAULT_TOKEN = TOKENS.USDC;
export function getTokenByAddress(addr) {
    const lower = addr.toLowerCase();
    return Object.values(TOKENS).find((t)=>t.address.toLowerCase() === lower) ?? DEFAULT_TOKEN;
}
export function getTokenBySymbol(sym) {
    const upper = sym.toUpperCase();
    if (upper === "USDM" || upper === "MENTO" || upper === "CELO_DOLLAR") return TOKENS.USDm;
    if (upper === "USDC") return TOKENS.USDC;
    if (upper === "USDT" || upper === "TETHER") return TOKENS.USDT;
    return DEFAULT_TOKEN;
}
export function toBaseUnits(amount, decimals) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Amount must be a positive finite number");
    }
    return BigInt(Math.round(amount * 10 ** decimals));
}
export function fromBaseUnits(units, decimals) {
    const divisor = BigInt(10 ** decimals);
    const whole = units / divisor;
    const frac = units % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/tokenConfig.ts