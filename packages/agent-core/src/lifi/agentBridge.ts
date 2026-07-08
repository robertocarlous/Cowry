/**
 * Agent-executed cross-chain bridge.
 *
 * The agent wallet (AGENT_PRIVATE_KEY) broadcasts the LI.FI bridge tx and pays
 * the native CELO relay fee — the user never needs CELO. The user's USDC is
 * pulled by the bridge via their one-time max-approval of the LI.FI Diamond.
 */

import { createPublicClient, erc20Abi, formatEther, http } from "viem";
import { celo } from "viem/chains";
import { agentSendTx, getAgentWallet } from "../agent/wallet.js";
import { getBridgeQuote, type BridgeQuoteParams } from "./bridgeClient.js";

/** Canonical LI.FI Diamond Router — same address on all EVM chains. */
export const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as const;

function rpcUrl() {
  return process.env.CELO_RPC_URL?.trim() ?? "https://forno.celo.org";
}

/**
 * Check whether the user has approved `spender` to spend at least `needed`
 * units of `token`. Defaults to LIFI_DIAMOND if no spender is provided.
 */
export async function checkLifiApproval(
  token: `0x${string}`,
  owner: `0x${string}`,
  needed: bigint,
  spender: `0x${string}` = LIFI_DIAMOND,
): Promise<boolean> {
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl()) });
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return allowance >= needed;
}

export type ExecuteBridgeResult = {
  txHash: `0x${string}`;
  approvalAddress: string;
  platformFeeUSD: number;
};

/**
 * Execute a cross-chain bridge send on behalf of a user.
 *
 * Two-quote flow:
 *  1. Preview quote (base 0.3% fee) → discover the relay CELO cost in USD.
 *  2. Final quote with adjusted fee = 0.3% + (relayCostUSD / sendAmountUSD).
 *     This converts the CELO cost into USDC deducted from the send amount, so
 *     Cowry's integrator wallet receives enough to replenish the agent's CELO.
 *  3. Agent broadcasts the final quote's tx, paying CELO from its own wallet.
 */
export async function executeBridgeForUser(
  params: BridgeQuoteParams,
): Promise<ExecuteBridgeResult> {
  // Step 1 — preview to discover relay cost
  const preview = await getBridgeQuote(params, 0);
  const relayCostUSD = preview.estimate.gasCosts.reduce(
    (sum, g) => sum + Number(g.amountUSD),
    0,
  );

  // Step 2 — final quote with adjusted fee (relay cost baked in)
  const final = await getBridgeQuote(params, relayCostUSD);
  const tx = final.transactionRequest;
  const value = BigInt(tx.value || "0");
  const approvalAddress = (final.estimate.approvalAddress ?? LIFI_DIAMOND) as `0x${string}`;

  // Read allowance and agent balance in parallel for speed
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl()) });
  const { publicClient: agentClient, address: agentAddress } = getAgentWallet();
  const [currentAllowance, agentCelo] = await Promise.all([
    client.readContract({
      address: params.fromTokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [params.fromAddress, approvalAddress],
    }),
    value > 0n ? agentClient.getBalance({ address: agentAddress }) : Promise.resolve(value + 1n),
  ]);

  console.info("[agentBridge] execute pre-flight", {
    tool:            final.tool,
    fromAddress:     params.fromAddress,
    fromAmount:      params.fromAmount,
    approvalAddress,
    currentAllowance: currentAllowance.toString(),
    neededAllowance:  params.fromAmount,
    approvalOk:      currentAllowance >= BigInt(params.fromAmount),
    relayValue:      formatEther(value),
    agentCelo:       formatEther(agentCelo),
    celoOk:          agentCelo >= value,
  });

  if (currentAllowance < BigInt(params.fromAmount)) {
    throw new Error(
      `USDC not approved. The user must approve ${approvalAddress} to spend at least ` +
      `${params.fromAmount} units of ${params.fromTokenAddress}. ` +
      `Current allowance: ${currentAllowance.toString()}.`,
    );
  }

  if (value > 0n && agentCelo < value) {
    throw new Error(
      `Agent wallet has insufficient CELO to cover the relay fee. ` +
      `Needs ${formatEther(value)} CELO, has ${formatEther(agentCelo)} CELO. ` +
      `Please top up the agent wallet at ${agentAddress}.`,
    );
  }

  // Simulate the tx first so we can surface the actual revert reason before submitting
  try {
    await agentClient.call({
      account:  agentAddress,
      to:       tx.to,
      data:     tx.data,
      value,
    });
  } catch (simErr: unknown) {
    const e = simErr as Record<string, unknown>;
    const simMsg = e instanceof Error ? e.message : String(simErr);
    const revertData = (e?.data as string) || (e?.cause as Record<string, unknown>)?.data as string || "";
    console.error("[agentBridge] simulation reverted", {
      tool:       final.tool,
      to:         tx.to,
      value:      formatEther(value),
      dataPrefix: tx.data.slice(0, 66),
      error:      simMsg,
      revertData,
      cause:      String((e?.cause as Error)?.message ?? ""),
    });
    throw new Error(`Bridge simulation failed (${final.tool}): ${simMsg}${revertData ? ` [data: ${revertData.slice(0, 20)}...]` : ""}`);
  }

  let txHash: `0x${string}`;
  try {
    txHash = await agentSendTx(tx.to, tx.data, value);
  } catch (err) {
    console.error("[agentBridge] agentSendTx failed", {
      tool:       final.tool,
      to:         tx.to,
      value:      formatEther(value),
      dataPrefix: tx.data.slice(0, 66),
      error:      err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return {
    txHash,
    approvalAddress,
    platformFeeUSD: final.platformFeeUSD,
  };
}
