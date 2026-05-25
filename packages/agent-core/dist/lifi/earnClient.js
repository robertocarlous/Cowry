const EARN_BASE = "https://earn.li.fi";
export const MORPHO_GAUNTLET_VAULT_ID = "8453:0x050cE30b927Da55177A4914EC73480238BAD56f0";
export const MORPHO_GAUNTLET_CHAIN_ID = 8453;
export const MORPHO_GAUNTLET_VAULT_ADDRESS = "0x050cE30b927Da55177A4914EC73480238BAD56f0";
export const MORPHO_GAUNTLET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_ADDRESSES = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    59144: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    534352: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"
};
export function formatApy(apy) {
    return `${apy.toFixed(2)}%`;
}
export function formatTvl(usd) {
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${usd.toFixed(0)}`;
}
export async function getOpportunities(filter = {}) {
    const { tokenSymbol = "USDC", chainName, minApy, limit = 5 } = filter;
    const url = new URL(`${EARN_BASE}/v1/earn/vaults`);
    url.searchParams.set("asset", tokenSymbol);
    url.searchParams.set("limit", "50");
    const res = await fetch(url.toString(), {
        headers: {
            Accept: "application/json"
        }
    });
    if (!res.ok) {
        throw new Error(`LI.FI Earn API error: ${res.status} ${res.statusText}`);
    }
    const body = await res.json();
    let vaults = body.data ?? [];
    if (chainName) {
        const lower = chainName.toLowerCase();
        vaults = vaults.filter((v)=>v.network.toLowerCase().includes(lower));
    }
    if (minApy != null) {
        vaults = vaults.filter((v)=>(v.analytics.apy.total ?? 0) >= minApy);
    }
    vaults = vaults.filter((v)=>v.address.toLowerCase() !== MORPHO_GAUNTLET_VAULT_ADDRESS.toLowerCase());
    vaults.sort((a, b)=>(b.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0));
    const top = vaults.slice(0, Math.max(0, limit - 1)).map((v)=>toCachedRaw(v));
    const morphoFromApi = (await fetch(`${EARN_BASE}/v1/earn/vaults?asset=${tokenSymbol}&limit=100`, {
        headers: {
            Accept: "application/json"
        }
    }).then((r)=>r.json()).catch(()=>({
            data: []
        }))).data?.find((v)=>v.address.toLowerCase() === MORPHO_GAUNTLET_VAULT_ADDRESS.toLowerCase());
    const morphoApy = morphoFromApi?.analytics?.apy?.total ?? 3.85;
    const morphoTvlRaw = morphoFromApi?.analytics?.tvl?.usd ?? "0";
    const pinnedMorpho = {
        id: MORPHO_GAUNTLET_VAULT_ID,
        label: `Morpho Gauntlet USDC Prime — ${formatApy(morphoApy)} APY on Base`,
        protocol: "Morpho",
        chainId: MORPHO_GAUNTLET_CHAIN_ID,
        chainName: "Base",
        apy: morphoApy,
        tvlUsd: parseFloat(morphoTvlRaw),
        tokenSymbol: "USDC",
        tokenAddress: MORPHO_GAUNTLET_USDC,
        tokenDecimals: 6,
        vaultAddress: MORPHO_GAUNTLET_VAULT_ADDRESS
    };
    return [
        pinnedMorpho,
        ...top
    ];
}
function toCachedRaw(v) {
    const token = v.underlyingTokens[0];
    const tvlUsd = parseFloat(v.analytics.tvl.usd ?? "0");
    const apy = v.analytics.apy.total ?? 0;
    return {
        id: v.slug,
        label: `${v.protocol.name} — ${formatApy(apy)} APY on ${v.network}`,
        protocol: v.protocol.name,
        chainId: v.chainId,
        chainName: v.network,
        apy,
        tvlUsd,
        tokenSymbol: token?.symbol ?? "USDC",
        tokenAddress: USDC_ADDRESSES[v.chainId] ?? token?.address ?? "",
        tokenDecimals: token?.decimals ?? 6,
        vaultAddress: v.address
    };
}
export function formatOpportunitiesList(opps) {
    const NUMS = [
        "1️⃣",
        "2️⃣",
        "3️⃣",
        "4️⃣",
        "5️⃣",
        "6️⃣",
        "7️⃣",
        "8️⃣",
        "9️⃣",
        "🔟"
    ];
    return opps.map((op, i)=>{
        const num = NUMS[i] ?? `${i + 1}.`;
        return `${num} *${op.protocol}* — *${formatApy(op.apy)} APY*\n` + `   📍 ${op.chainName} | TVL: ${formatTvl(op.tvlUsd)}`;
    }).join("\n\n");
}
export async function getUserPositions(walletAddress) {
    const url = `${EARN_BASE}/v1/earn/portfolio/${walletAddress}/positions`;
    const res = await fetch(url, {
        headers: {
            Accept: "application/json"
        }
    });
    if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`LI.FI Earn portfolio error: ${res.status} ${res.statusText}`);
    }
    const body = await res.json();
    let raw;
    if (Array.isArray(body)) {
        raw = body;
    } else if (body.data) {
        raw = body.data;
    } else {
        raw = body.positions ?? [];
    }
    return raw.map((p)=>({
            opportunityId: p.vault?.slug,
            protocol: p.vault?.protocol?.name,
            chainId: p.vault?.chainId,
            chainName: p.vault?.network,
            tokenSymbol: p.vault?.underlyingTokens?.[0]?.symbol,
            apy: p.vault?.analytics?.apy?.total,
            balanceUsd: p.balanceUsd ?? 0
        }));
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/lifi/earnClient.ts