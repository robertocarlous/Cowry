import { encodeFunctionData, erc20Abi } from "viem";
import { getPublicClient, requireProvider } from "./wallet";

export const MAX_UINT256 = 2n ** 256n - 1n;

function decodeUint256(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

/** Prefer wallet RPC (same node MiniPay uses for gas estimation). */
async function ethCall(to: `0x${string}`, data: `0x${string}`): Promise<bigint> {
  try {
    const provider = requireProvider();
    const result = await provider.request({
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }) as string;
    return decodeUint256(result);
  } catch {
    const client = getPublicClient();
    const result = await client.call({ to, data });
    return decodeUint256(result.data ?? "0x0");
  }
}

export function encodeErc20Approve(
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

export async function readErc20Allowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return ethCall(token, data);
}

export async function readErc20Balance(
  token: `0x${string}`,
  owner: `0x${string}`,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  return ethCall(token, data);
}

export async function readNativeBalance(owner: `0x${string}`): Promise<bigint> {
  try {
    const provider = requireProvider();
    const result = await provider.request({
      method: "eth_getBalance",
      params: [owner, "latest"],
    }) as string;
    return decodeUint256(result);
  } catch {
    const client = getPublicClient();
    return client.getBalance({ address: owner });
  }
}
