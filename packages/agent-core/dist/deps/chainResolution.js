import { cowrypayContract, groupRegistryContract } from "../abi/index.js";
import { encodeCreateGroup, encodeAddMember } from "../chain/encodeGroupRegistry.js";
import { encodedCallToJson } from "../chain/encodeCowryPay.js";
import { makePublicClient } from "../chain/client.js";
import { encodeRegisterUsername } from "../chain/encodeUserRegistry.js";
import { tryGetAgentWallet, agentSendTx } from "../agent/wallet.js";
import { formatGroupsLinesForWallet, isWalletRegisteredOnChain, resolveGroupByNameOnChain, resolveUsernameOnChain } from "../chain/reads.js";
import { normalizeUsernameForRegistry } from "../chain/normalizeUsername.js";
export function createChainResolutionDeps(rpcUrl) {
    const chainId = Number(process.env.CHAIN_ID || 42220);
    const client = makePublicClient(rpcUrl, chainId);
    return {
        mode: "chain",
        publicClient: client,
        async isWalletRegistered (wallet) {
            if (!wallet) return false;
            return isWalletRegisteredOnChain(client, wallet);
        },
        resolveUsername: (handle)=>resolveUsernameOnChain(client, handle),
        resolveGroupByName: (name, wallet)=>{
            if (!wallet) {
                return Promise.resolve({
                    ok: false,
                    reason: "Pass walletAddress in the request body so we can find groups you own or belong to."
                });
            }
            return resolveGroupByNameOnChain(client, wallet, name);
        },
        listGroups: (wallet)=>{
            if (!wallet) {
                return Promise.resolve("Pass walletAddress to list groups from GroupRegistry.");
            }
            return formatGroupsLinesForWallet(client, wallet);
        },
        getMeta: async ()=>({
                chainId,
                cowryPay: cowrypayContract.address
            }),
        adminCreateGroup: async (displayName, memberHandles, _payerWallet)=>{
            const trimmed = displayName.trim();
            if (!trimmed) {
                return {
                    ok: false,
                    reason: "Group name cannot be empty."
                };
            }
            const resolvedMembers = [];
            for (const h of memberHandles){
                const r = await resolveUsernameOnChain(client, h);
                if (!r.ok) {
                    return {
                        ok: false,
                        reason: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}`
                    };
                }
                resolvedMembers.push({
                    username: r.username,
                    address: r.address
                });
            }
            const agentWallet = tryGetAgentWallet();
            if (agentWallet) {
                try {
                    const createTx = encodeCreateGroup(trimmed);
                    const createHash = await agentSendTx(createTx.to, createTx.data, 0n);
                    const receipt = await client.waitForTransactionReceipt({
                        hash: createHash
                    });
                    let groupId = null;
                    const registryAddr = groupRegistryContract.address.toLowerCase();
                    for (const log of receipt.logs){
                        if (log.address.toLowerCase() === registryAddr && log.topics[1]) {
                            groupId = BigInt(log.topics[1]);
                            break;
                        }
                    }
                    if (groupId === null) {
                        return {
                            ok: false,
                            reason: "Group was created but could not determine its ID from the receipt."
                        };
                    }
                    for (const member of resolvedMembers){
                        const addTx = encodeAddMember(groupId, member.address);
                        await agentSendTx(addTx.to, addTx.data, 0n);
                    }
                    const memberList = resolvedMembers.map((m)=>`@${m.username}`).join(", ");
                    const memberText = resolvedMembers.length > 0 ? ` with ${memberList}` : "";
                    return {
                        ok: true,
                        message: `✅ Group **${trimmed}** created on-chain (ID: **${groupId}**)${memberText}.\n\n` + `[View on CeloScan](https://celoscan.io/tx/${createHash})`
                    };
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return {
                        ok: false,
                        reason: `Agent could not create group: ${msg}`
                    };
                }
            }
            const tx = encodeCreateGroup(trimmed);
            const memberNote = resolvedMembers.length > 0 ? ` Resolved members (add manually after tx confirms): ${resolvedMembers.map((m)=>`@${m.username} → ${m.address}`).join("; ")}.` : "";
            return {
                ok: true,
                message: `Sign **createGroup("${trimmed}")** below. Members must be added separately.${memberNote}`,
                transactions: [
                    encodedCallToJson(tx)
                ]
            };
        },
        async adminRegisterUsername (rawName, wallet) {
            const norm = normalizeUsernameForRegistry(rawName);
            if (!norm.ok) {
                return {
                    ok: false,
                    reason: norm.reason
                };
            }
            if (wallet) {
                const already = await isWalletRegisteredOnChain(client, wallet);
                if (already) {
                    return {
                        ok: false,
                        reason: "This wallet already has a Cowry username on-chain (one name per address)."
                    };
                }
            }
            const tx = encodeRegisterUsername(norm.name);
            return {
                ok: true,
                message: `Sign **register** with the wallet that should own @${norm.name}. After it confirms, others can pay you by name.`,
                transactions: [
                    encodedCallToJson(tx)
                ]
            };
        }
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/deps/chainResolution.ts