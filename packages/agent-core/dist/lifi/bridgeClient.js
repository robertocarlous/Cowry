import { CELO_USDM_ADDRESS, CELO_USDC_ADDRESS } from "./celoTokens.js";
const LIFI_BASE = "https://li.quest/v1";
const INTEGRATOR = process.env.LIFI_INTEGRATOR?.trim() || "cowry";
const BASE_PLATFORM_FEE = 0.003;
export const CELO_CHAIN_ID = 42220;
export const SUPPORTED_CHAINS = {
    1: {
        chainId: 1,
        name: "Ethereum",
        usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        usdcDecimals: 6
    },
    10: {
        chainId: 10,
        name: "Optimism",
        usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        usdcDecimals: 6
    },
    56: {
        chainId: 56,
        name: "BNB Chain",
        usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        usdcDecimals: 18
    },
    137: {
        chainId: 137,
        name: "Polygon",
        usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        usdcDecimals: 6
    },
    8453: {
        chainId: 8453,
        name: "Base",
        usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        usdcDecimals: 6
    },
    43114: {
        chainId: 43114,
        name: "Avalanche",
        usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        usdcDecimals: 6
    },
    59144: {
        chainId: 59144,
        name: "Linea",
        usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
        usdcDecimals: 6
    },
    42220: {
        chainId: 42220,
        name: "Celo",
        usdc: CELO_USDC_ADDRESS,
        usdm: CELO_USDM_ADDRESS,
        usdcDecimals: 6,
        usdmDecimals: 18
    }
};
export function getCeloOutboundDestinations() {
    return Object.values(SUPPORTED_CHAINS).filter((c)=>c.chainId !== CELO_CHAIN_ID && c.usdc);
}
export function getCeloBridgeSource() {
    return SUPPORTED_CHAINS[CELO_CHAIN_ID];
}
export function validateCeloOutboundBridge(params) {
    const celo = SUPPORTED_CHAINS[CELO_CHAIN_ID];
    if (params.fromChainId !== CELO_CHAIN_ID) {
        throw new Error("Cross-chain send must start from Celo.");
    }
    const from = params.fromTokenAddress.toLowerCase();
    const allowedFrom = [
        celo.usdc,
        celo.usdm
    ].filter(Boolean).map((a)=>a.toLowerCase());
    if (!allowedFrom.includes(from)) {
        throw new Error("Source token must be USDC or USDm on Celo.");
    }
    if (params.toChainId === CELO_CHAIN_ID) {
        throw new Error("Destination must be a chain other than Celo.");
    }
    const dest = SUPPORTED_CHAINS[params.toChainId];
    if (!dest?.usdc) {
        throw new Error("Destination chain is not supported.");
    }
    if (params.toTokenAddress.toLowerCase() !== dest.usdc.toLowerCase()) {
        throw new Error("Destination token must be USDC.");
    }
}
function lifiHeaders() {
    const h = {
        Accept: "application/json"
    };
    const key = process.env.LIFI_API_KEY?.trim();
    if (key) h["x-lifi-api-key"] = key;
    else console.warn("[LI.FI] No LIFI_API_KEY set — rate limits may apply.");
    return h;
}
async function lifiGet(path, params) {
    const url = new URL(`${LIFI_BASE}${path}`);
    for (const [k, v] of Object.entries(params))url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
        headers: lifiHeaders()
    });
    if (!res.ok) {
        let detail = "";
        try {
            const body = await res.json();
            detail = body.message ?? "";
            if (res.status === 404 && body.code === 1002) {
                throw new Error("No route available for this send. Try a different amount, token (USDC vs USDm), or destination chain.");
            }
        } catch (e) {
            if (e instanceof Error && e.message.startsWith("No route")) throw e;
        }
        throw new Error(detail || `LI.FI ${path} failed (${res.status})`);
    }
    return res.json();
}
function chainName(id) {
    return SUPPORTED_CHAINS[id]?.name ?? `chain-${id}`;
}
async function rawBridgeQuote(params, feeRatio) {
    const base = {
        fromChain: String(params.fromChainId),
        toChain: String(params.toChainId),
        fromToken: params.fromTokenAddress,
        toToken: params.toTokenAddress,
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        integrator: INTEGRATOR,
        fee: feeRatio.toFixed(6)
    };
    const CELO_VALUE_LIMIT = 10_000_000_000_000_000n;
    for (const preferBridges of [
        "cctp",
        "across",
        ""
    ]){
        try {
            const q = await lifiGet("/quote", preferBridges ? {
                ...base,
                preferBridges
            } : base);
            const nativeValue = BigInt(q.transactionRequest.value || "0");
            if (nativeValue <= CELO_VALUE_LIMIT) {
                return q;
            }
            if (preferBridges !== "") {
                continue;
            }
            throw new Error(`Cross-chain send to ${chainName(params.toChainId)} is not available without CELO. ` + `Please choose Ethereum, Base, Arbitrum, Optimism, Polygon, or Avalanche instead.`);
        } catch (e) {
            if (e instanceof Error && e.message.startsWith("Cross-chain send")) throw e;
            if (e instanceof Error && e.message.startsWith("No route available")) throw e;
            if (preferBridges === "") throw e;
        }
    }
    throw new Error("No bridge route available.");
}
export async function getBridgeQuote(params, relayCostUSD = 0) {
    validateCeloOutboundBridge(params);
    const fromDecimals = params.fromTokenAddress.toLowerCase() === CELO_USDM_ADDRESS.toLowerCase() ? 18 : 6;
    const fromAmountUSD = Number(params.fromAmount) / 10 ** fromDecimals;
    const executionFeeRatio = fromAmountUSD > 0 ? Math.min(relayCostUSD / fromAmountUSD, 0.02) : 0;
    const totalFeeRatio = BASE_PLATFORM_FEE + executionFeeRatio;
    const quote = await rawBridgeQuote(params, totalFeeRatio);
    return {
        ...quote,
        platformFeeUSD: fromAmountUSD * totalFeeRatio
    };
}
export async function getBridgeStatus(txHash, fromChainId, toChainId) {
    let raw;
    try {
        raw = await lifiGet("/status", {
            txHash,
            fromChain: String(fromChainId),
            toChain: String(toChainId)
        });
    } catch  {
        return {
            status: "NOT_FOUND"
        };
    }
    if (raw.status === "DONE") {
        return {
            status: "DONE",
            toTxHash: raw.receiving?.txHash ?? "0x",
            receivedAmount: raw.receiving?.amount ?? "0"
        };
    }
    if (raw.status === "FAILED") return {
        status: "FAILED"
    };
    return {
        status: "PENDING"
    };
}
export function formatBridgeSummary(quote) {
    const from = quote.action.fromToken;
    const to = quote.action.toToken;
    const sentHuman = (Number(quote.estimate.fromAmount) / 10 ** from.decimals).toFixed(4);
    const receivedMin = (Number(quote.estimate.toAmountMin) / 10 ** to.decimals).toFixed(4);
    const durationMin = Math.ceil(quote.estimate.executionDuration / 60);
    const platformFee = (quote.platformFeeUSD ?? 0).toFixed(3);
    return [
        `Cross-chain send via ${quote.tool}`,
        `• You send:       ${sentHuman} ${from.symbol} on Celo`,
        `• Recipient gets: ≥${receivedMin} USDC on ${chainName(quote.action.toChainId)}`,
        `• Platform fee:   $${platformFee}`,
        `• Est. time:      ~${durationMin} min`,
        `  (No CELO needed — Cowry covers the relay cost)`
    ].join("\n");
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/lifi/bridgeClient.ts