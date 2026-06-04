import { cowrypayContract, groupRegistryContract } from "../abi/index.js";
import { encodeCreateGroup, encodeAddMember } from "../chain/encodeGroupRegistry.js";
import { encodedCallToJson } from "../chain/encodeCowryPay.js";
import { makePublicClient } from "../chain/client.js";
import { encodeRegisterUsername } from "../chain/encodeUserRegistry.js";
import { tryGetAgentWallet, agentSendTx } from "../agent/wallet.js";
import {
  formatGroupsLinesForWallet,
  isWalletRegisteredOnChain,
  resolveGroupByNameOnChain,
  resolveUsernameOnChain,
} from "../chain/reads.js";
import { normalizeUsernameForRegistry } from "../chain/normalizeUsername.js";
import type { ResolutionDeps, TxMeta } from "./types.js";

export function createChainResolutionDeps(rpcUrl: string): ResolutionDeps {
  const chainId = Number(process.env.CHAIN_ID || 42220); // Celo mainnet
  const client = makePublicClient(rpcUrl, chainId);

  return {
    mode: "chain",
    publicClient: client,
    async isWalletRegistered(wallet) {
      if (!wallet) return false;
      return isWalletRegisteredOnChain(client, wallet);
    },
    resolveUsername: (handle) => resolveUsernameOnChain(client, handle),
    resolveGroupByName: (name, wallet) => {
      if (!wallet) {
        return Promise.resolve({
          ok: false,
          reason:
            "Pass walletAddress in the request body so we can find groups you own or belong to.",
        });
      }
      return resolveGroupByNameOnChain(client, wallet, name);
    },
    listGroups: (wallet) => {
      if (!wallet) {
        return Promise.resolve(
          "Pass walletAddress to list groups from GroupRegistry.",
        );
      }
      return formatGroupsLinesForWallet(client, wallet);
    },
    getMeta: async (): Promise<TxMeta> => ({
      chainId,
      cowryPay: cowrypayContract.address,
    }),
    adminCreateGroup: async (displayName: string, memberHandles: string[], payerWallet?: `0x${string}`) => {
      const trimmed = displayName.trim();
      if (!trimmed) {
        return { ok: false, reason: "Group name cannot be empty." };
      }

      // Resolve all member addresses first before touching the chain
      const resolvedMembers: { username: string; address: `0x${string}` }[] = [];
      for (const h of memberHandles) {
        const r = await resolveUsernameOnChain(client, h);
        if (!r.ok) {
          return { ok: false, reason: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}` };
        }
        resolvedMembers.push({ username: r.username, address: r.address });
      }

      // ── Agent-executed path ───────────────────────────────────────────────
      // Agent creates the group and adds all members in one atomic sequence.
      // Agent becomes the group owner (needed to call addMember).
      const agentWallet = tryGetAgentWallet();
      if (agentWallet) {
        try {
          // Step 1: createGroup → get receipt → extract groupId from GroupCreated event
          const createTx = encodeCreateGroup(trimmed);
          const createHash = await agentSendTx(createTx.to as `0x${string}`, createTx.data as `0x${string}`, 0n);
          const receipt = await client.waitForTransactionReceipt({ hash: createHash });

          // GroupCreated(uint256 indexed groupId, address indexed owner, string name)
          // topics[0] = event sig, topics[1] = groupId (indexed)
          let groupId: bigint | null = null;
          const registryAddr = groupRegistryContract.address.toLowerCase();
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() === registryAddr && log.topics[1]) {
              groupId = BigInt(log.topics[1]);
              break;
            }
          }
          if (groupId === null) {
            return { ok: false, reason: "Group was created but could not determine its ID from the receipt." };
          }

          // Step 2: addMember for each resolved member
          for (const member of resolvedMembers) {
            const addTx = encodeAddMember(groupId, member.address);
            await agentSendTx(addTx.to as `0x${string}`, addTx.data as `0x${string}`, 0n);
          }

          // Step 3: add the payer's wallet as a member so getGroupsForMember(payer)
          // returns this group — allows group name resolution when paying later.
          const payerIsAlreadyMember = resolvedMembers.some(
            m => m.address.toLowerCase() === payerWallet?.toLowerCase(),
          );
          if (payerWallet && !payerIsAlreadyMember) {
            const payerTx = encodeAddMember(groupId, payerWallet);
            await agentSendTx(payerTx.to as `0x${string}`, payerTx.data as `0x${string}`, 0n);
          }

          const memberList = resolvedMembers.map(m => `@${m.username}`).join(", ");
          const memberText = resolvedMembers.length > 0 ? ` with ${memberList}` : "";
          return {
            ok: true,
            message:
              `✅ Group **${trimmed}** created on-chain (ID: **${groupId}**)${memberText}.\n\n` +
              `[View on CeloScan](https://celoscan.io/tx/${createHash})`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, reason: `Agent could not create group: ${msg}` };
        }
      }

      // ── Fallback: no agent wallet — return calldata for user to sign ────────
      const tx = encodeCreateGroup(trimmed);
      const memberNote = resolvedMembers.length > 0
        ? ` Resolved members (add manually after tx confirms): ${resolvedMembers.map(m => `@${m.username} → ${m.address}`).join("; ")}.`
        : "";
      return {
        ok: true,
        message: `Sign **createGroup("${trimmed}")** below. Members must be added separately.${memberNote}`,
        transactions: [encodedCallToJson(tx)],
      };
    },
    async adminRegisterUsername(rawName: string, wallet) {
      const norm = normalizeUsernameForRegistry(rawName);
      if (!norm.ok) {
        return { ok: false, reason: norm.reason };
      }
      if (wallet) {
        const already = await isWalletRegisteredOnChain(client, wallet);
        if (already) {
          return {
            ok: false,
            reason:
              "This wallet already has a Cowry username on-chain (one name per address).",
          };
        }
      }
      const tx = encodeRegisterUsername(norm.name);
      return {
        ok: true,
        message: `Sign **register** with the wallet that should own @${norm.name}. After it confirms, others can pay you by name.`,
        transactions: [encodedCallToJson(tx)],
      };
    },
  };
}
