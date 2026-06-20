import { groupRegistryContract, cowrypayContract, userRegistryContract } from "../abi/index.js";
import { normalizeUsernameForRegistry } from "./normalizeUsername.js";
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NAME_REGISTERED_EVENT = {
    type: "event",
    name: "NameRegistered",
    inputs: [
        {
            type: "address",
            name: "owner",
            indexed: true
        },
        {
            type: "bytes32",
            name: "nameHash",
            indexed: true
        },
        {
            type: "string",
            name: "name",
            indexed: false
        }
    ]
};
export async function getRegisteredUsernameForAddress(client, wallet) {
    let nameHash;
    try {
        nameHash = await client.readContract({
            address: userRegistryContract.address,
            abi: userRegistryContract.abi,
            functionName: "getNameHashByAddress",
            args: [
                wallet
            ]
        });
    } catch (err) {
        console.warn("getNameHashByAddress failed:", err.message);
        return null;
    }
    if (nameHash === ZERO_HASH) return null;
    let currentBlock;
    try {
        currentBlock = await client.getBlockNumber();
    } catch  {
        currentBlock = 99_999_999n;
    }
    const windows = [
        currentBlock,
        50_000n,
        10_000n,
        2_000n
    ];
    for (const window of windows){
        const fromBlock = window >= currentBlock ? 0n : currentBlock - window;
        try {
            const logs = await client.getLogs({
                address: userRegistryContract.address,
                event: NAME_REGISTERED_EVENT,
                args: {
                    owner: wallet
                },
                fromBlock,
                toBlock: "latest"
            });
            if (logs.length > 0) {
                return logs.at(-1).args.name ?? null;
            }
        } catch (err) {
            console.warn(`getLogs fromBlock=${fromBlock} failed:`, err.message);
        }
    }
    console.warn(`Wallet ${wallet} is registered on-chain but name string not retrievable from events.`);
    return "REGISTERED_UNKNOWN";
}
export async function isWalletRegisteredOnChain(client, wallet) {
    const hash = await client.readContract({
        address: userRegistryContract.address,
        abi: userRegistryContract.abi,
        functionName: "getNameHashByAddress",
        args: [
            wallet
        ]
    });
    return hash !== ZERO_HASH;
}
export async function readUsdmAddress(client) {
    const addr = await client.readContract({
        address: cowrypayContract.address,
        abi: cowrypayContract.abi,
        functionName: "usdm"
    });
    return addr;
}
export const readUsdcAddress = readUsdmAddress;
export async function resolveUsernameOnChain(client, handle) {
    const norm = normalizeUsernameForRegistry(handle);
    if (!norm.ok) {
        return {
            ok: false,
            username: handle.replace(/^@/, "").toLowerCase(),
            reason: norm.reason
        };
    }
    const addr = await client.readContract({
        address: userRegistryContract.address,
        abi: userRegistryContract.abi,
        functionName: "getAddressByName",
        args: [
            norm.name
        ]
    });
    if (addr !== ZERO) {
        return {
            ok: true,
            username: norm.name,
            address: addr
        };
    }
    return {
        ok: false,
        username: norm.name,
        reason: "Name is not registered on Cowry. Ask them to open the app and register first."
    };
}
async function batchResolveAddresses(client, addresses) {
    const result = new Map();
    if (addresses.length === 0) return result;
    try {
        const latest = await client.getBlockNumber().catch(()=>0n);
        const fromBlock = latest > 100_000n ? latest - 100_000n : 0n;
        const logs = await client.getLogs({
            address: userRegistryContract.address,
            event: NAME_REGISTERED_EVENT,
            fromBlock,
            toBlock: "latest"
        }).catch(()=>[]);
        const addrSet = new Set(addresses.map((a)=>a.toLowerCase()));
        for (const log of logs){
            const args = log.args;
            const owner = typeof args["owner"] === "string" ? args["owner"].toLowerCase() : null;
            const name = typeof args["name"] === "string" ? args["name"] : null;
            if (owner && name && addrSet.has(owner)) {
                result.set(owner, name);
            }
        }
    } catch  {}
    return result;
}
function getAgentAddress() {
    try {
        const pk = process.env.AGENT_PRIVATE_KEY;
        if (!pk?.startsWith("0x")) return null;
        const { privateKeyToAccount } = require("viem/accounts");
        return privateKeyToAccount(pk).address;
    } catch  {
        return null;
    }
}
export async function resolveGroupByNameOnChain(client, wallet, searchName) {
    const target = searchName.trim().toLowerCase().replace(/\bgroup\b/gi, "").trim();
    const owned = await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsOwnedBy",
        args: [
            wallet
        ]
    });
    const agentAddr = getAgentAddress();
    const agentOwned = agentAddr ? await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsOwnedBy",
        args: [
            agentAddr
        ]
    }) : [];
    const memberOf = await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsForMember",
        args: [
            wallet
        ]
    });
    const seen = new Set();
    const ids = [];
    for (const id of [
        ...owned,
        ...agentOwned,
        ...memberOf
    ]){
        const k = id.toString();
        if (seen.has(k)) continue;
        seen.add(k);
        ids.push(id);
    }
    for (const id of ids){
        const g = await client.readContract({
            address: groupRegistryContract.address,
            abi: groupRegistryContract.abi,
            functionName: "getGroup",
            args: [
                id
            ]
        });
        const [, name, active] = g;
        if (!active) continue;
        if (name.toLowerCase() !== target) continue;
        const members = await client.readContract({
            address: groupRegistryContract.address,
            abi: groupRegistryContract.abi,
            functionName: "getMembers",
            args: [
                id
            ]
        });
        if (members.length === 0) {
            return {
                ok: false,
                reason: `Group "${name}" has no members yet. Add members before paying.`
            };
        }
        return {
            ok: true,
            kind: "onchain",
            groupId: id,
            displayName: name,
            members: [
                ...members
            ]
        };
    }
    return {
        ok: false,
        reason: `No active group named "${searchName}" for your wallet. Create one or join it first.`
    };
}
export async function formatGroupsLinesForWallet(client, wallet) {
    const owned = await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsOwnedBy",
        args: [
            wallet
        ]
    });
    const agentAddr = getAgentAddress();
    const agentOwned = agentAddr ? await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsOwnedBy",
        args: [
            agentAddr
        ]
    }) : [];
    const memberOf = await client.readContract({
        address: groupRegistryContract.address,
        abi: groupRegistryContract.abi,
        functionName: "getGroupsForMember",
        args: [
            wallet
        ]
    });
    const seen = new Set();
    const ids = [];
    for (const id of [
        ...owned,
        ...agentOwned,
        ...memberOf
    ]){
        const k = id.toString();
        if (seen.has(k)) continue;
        seen.add(k);
        ids.push(id);
    }
    if (ids.length === 0) {
        return "You don't have any groups yet.\n\nTry: **create a group called Friends with @alice, @bob**";
    }
    const groupData = [];
    for (const id of ids){
        const g = await client.readContract({
            address: groupRegistryContract.address,
            abi: groupRegistryContract.abi,
            functionName: "getGroup",
            args: [
                id
            ]
        });
        const [, name, active] = g;
        if (!active) continue;
        const members = await client.readContract({
            address: groupRegistryContract.address,
            abi: groupRegistryContract.abi,
            functionName: "getMembers",
            args: [
                id
            ]
        });
        groupData.push({
            id,
            name,
            members
        });
    }
    if (groupData.length === 0) {
        return "You don't have any active groups yet.\n\nTry: **create a group called Friends with @alice, @bob**";
    }
    const allAddresses = [
        ...new Set(groupData.flatMap((g)=>[
                ...g.members
            ]))
    ];
    const usernameMap = await batchResolveAddresses(client, allAddresses);
    const lines = groupData.map(({ id, name, members })=>{
        const labels = members.map((addr)=>{
            const u = usernameMap.get(addr.toLowerCase());
            return u ? `@${u}` : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
        });
        const memberText = labels.length > 0 ? labels.join(", ") : "no members yet";
        return `👥 **${name}** (ID: ${id})\n   ${memberText}`;
    });
    return `Here are your groups:\n\n${lines.join("\n\n")}\n\nTo pay: **send 10 USDC to everyone in Friends**`;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/reads.ts