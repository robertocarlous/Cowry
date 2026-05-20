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
