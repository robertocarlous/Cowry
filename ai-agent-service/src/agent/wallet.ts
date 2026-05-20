import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Account,
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

export function getAgentWallet(): AgentWallet {
  if (_wallet) return _wallet;

  const raw = process.env.AGENT_PRIVATE_KEY;
  if (!raw || !raw.startsWith("0x")) {
    throw new Error("AGENT_PRIVATE_KEY must be set in .env (0x-prefixed hex private key)");
  }

  const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  const account = privateKeyToAccount(raw as `0x${string}`);

  _wallet = {
    account,
    address: account.address,
    walletClient: createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl),
    }),
    publicClient: createPublicClient({
      chain: celo,
      transport: http(rpcUrl),
    }),
  };

  return _wallet;
}

/** Send a transaction from the agent wallet. Returns the tx hash. */
export async function agentSendTx(
  to: `0x${string}`,
  data: `0x${string}`,
  value = 0n,
): Promise<`0x${string}`> {
  const { walletClient, account } = getAgentWallet();
  return walletClient.sendTransaction({ account, to, data, value });
}
