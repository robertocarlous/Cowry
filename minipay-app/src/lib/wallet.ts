import { createWalletClient, createPublicClient, custom, http } from "viem";
import { celo } from "viem/chains";

/** USDm address on Celo — required as feeCurrency in MiniPay */
export const CELO_USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMiniPay?: boolean;
};

function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

/** Returns true when the app is running inside the MiniPay wallet */
export function isMiniPay(): boolean {
  return !!(getProvider()?.isMiniPay);
}

export function getWalletClient() {
  const provider = getProvider();
  if (!provider) return null;
  return createWalletClient({ chain: celo, transport: custom(provider) });
}

export function getPublicClient() {
  const rpc = process.env.NEXT_PUBLIC_CELO_RPC_URL ?? "https://forno.celo.org";
  return createPublicClient({ chain: celo, transport: http(rpc) });
}

export async function getConnectedAddress(): Promise<`0x${string}` | null> {
  const client = getWalletClient();
  if (!client) return null;
  try {
    const [addr] = await client.getAddresses();
    return addr ?? null;
  } catch {
    return null;
  }
}

export async function requestAccounts(): Promise<`0x${string}` | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
    return (accounts[0] ?? null) as `0x${string}` | null;
  } catch {
    return null;
  }
}

/** Returns the current chain ID from the injected provider. */
export async function getCurrentChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const hex = await provider.request({ method: "eth_chainId" }) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

const CELO_CHAIN_PARAMS = {
  chainId:           "0xA4EC",        // 42220
  chainName:         "Celo Mainnet",
  nativeCurrency:    { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls:           ["https://forno.celo.org"],
  blockExplorerUrls: ["https://celoscan.io"],
};

/**
 * Switch the injected wallet to Celo mainnet (chain 42220).
 * Adds the network if it isn't in the wallet yet.
 * No-op if already on Celo or inside MiniPay (always Celo).
 */
export async function switchToCelo(): Promise<void> {
  if (isMiniPay()) return;              // MiniPay is always on Celo
  const provider = getProvider();
  if (!provider) return;

  const current = await getCurrentChainId();
  if (current === 42220) return;        // already on Celo

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xA4EC" }],
    });
  } catch (err: unknown) {
    // Error 4902 = chain not added yet — add it first
    const code = (err as { code?: number }).code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [CELO_CHAIN_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Sign and broadcast a transaction using MiniPay / injected wallet.
 * Uses legacy transaction type (MiniPay requirement — no EIP-1559).
 * Sets feeCurrency = USDm when running inside MiniPay.
 */
export async function sendTransaction(tx: {
  to: string;
  data: string;
  value: string;
}): Promise<`0x${string}`> {
  const client = getWalletClient();
  if (!client) throw new Error("Wallet not connected");
  const [account] = await client.getAddresses();
  if (!account) throw new Error("No account found");

  return client.sendTransaction({
    account,
    to:    tx.to    as `0x${string}`,
    data:  tx.data  as `0x${string}`,
    value: BigInt(tx.value || "0x0"),
    // MiniPay only accepts legacy txs; feeCurrency pays gas in USDm
    ...(isMiniPay() ? { feeCurrency: CELO_USDM } : {}),
  });
}

export function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
