import {
  createWalletClient,
  createPublicClient,
  http,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

export type AgentWallet = {
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
  address: `0x${string}`;
};

let _wallet: AgentWallet | null = null;

/** Agent EOA without throwing when AGENT_PRIVATE_KEY is unset. */
export function tryGetAgentWallet(): AgentWallet | null {
  try {
    return getAgentWallet();
  } catch {
    return null;
  }
}

export function getAgentWallet(): AgentWallet {
  if (_wallet) return _wallet;

  const raw = process.env.AGENT_PRIVATE_KEY;
  if (!raw || !raw.startsWith("0x")) {
    throw new Error("AGENT_PRIVATE_KEY must be set in .env (0x-prefixed hex private key)");
  }

  const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  const account = privateKeyToAccount(raw as `0x${string}`);

  const wallet: AgentWallet = {
    account,
    address: account.address,
    walletClient: createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl),
    }) as WalletClient,
    publicClient: createPublicClient({
      chain: celo,
      transport: http(rpcUrl),
    }) as PublicClient,
  };
  _wallet = wallet;
  return wallet;
}

/**
 * In-process nonce counter for the agent wallet.
 * Prevents "replacement transaction underpriced" when sending sequential txs
 * without waiting for each to confirm first.
 */
let _nonce: number | null = null;
const _nonceLock = { busy: false };

async function getNextNonce(publicClient: PublicClient, address: `0x${string}`): Promise<number> {
  // Seed from pending count on first call or after a reset
  if (_nonce === null) {
    _nonce = await publicClient.getTransactionCount({ address, blockTag: "pending" });
  }
  const n = _nonce;
  _nonce += 1;
  return n;
}

/** Reset the local nonce counter (call after a tx error so it re-syncs with chain). */
export function resetAgentNonce(): void {
  _nonce = null;
}

/**
 * Send a transaction from the agent wallet.
 * Uses an in-process nonce counter so rapid sequential calls never collide.
 * Retries once with a fresh nonce if the RPC rejects with a nonce error.
 */
export async function agentSendTx(
  to: `0x${string}`,
  data: `0x${string}`,
  value = 0n,
): Promise<`0x${string}`> {
  // Serialize concurrent calls through a simple spin-lock so nonces are assigned sequentially
  while (_nonceLock.busy) {
    await new Promise(r => setTimeout(r, 50));
  }
  _nonceLock.busy = true;

  try {
    const { walletClient, account, publicClient } = getAgentWallet();
    const nonce = await getNextNonce(publicClient, account.address);

    try {
      return await walletClient.sendTransaction({ account, chain: celo, to, data, value, nonce });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNonceError =
        msg.includes("nonce") ||
        msg.includes("replacement transaction") ||
        msg.includes("already known");

      if (isNonceError) {
        // Re-sync nonce from chain and retry once
        _nonce = null;
        const freshNonce = await getNextNonce(publicClient, account.address);
        return await walletClient.sendTransaction({ account, chain: celo, to, data, value, nonce: freshNonce });
      }
      throw err;
    }
  } finally {
    _nonceLock.busy = false;
  }
}
