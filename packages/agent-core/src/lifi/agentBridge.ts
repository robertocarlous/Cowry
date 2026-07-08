/**
 * Agent-executed cross-chain bridge.
 *
 * The agent wallet (AGENT_PRIVATE_KEY) broadcasts the LI.FI bridge tx and pays
 * the native CELO relay fee — the user never needs CELO. The user's USDC is
 * pulled by the bridge via their one-time max-approval of the LI.FI Diamond.
 */

import { createPublicClient, erc20Abi, http } from "viem";
import { celo } from "viem/chains";
import { agentSendTx } from "../agent/wallet.js";
import { getBridgeQuote, type BridgeQuoteParams } from "./bridgeClient.js";

/** Canonical LI.FI Diamond Router — same address on all EVM chains. */
export const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as const;

function rpcUrl() {
  return process.env.CELO_RPC_URL?.trim() ?? "https://forno.celo.org";
}

/**
 * Check whether the user has approved the LI.FI Diamond to spend at least
 * `needed` units of `token`. Used as a pre-flight check before execution.
 */
export async function checkLifiApproval(
  token: `0x${string}`,
  owner: `0x${string}`,
  needed: bigint,
): Promise<boolean> {
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl()) });
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, LIFI_DIAMOND],
  });
  return allowance >= needed;
}

export type ExecuteBridgeResult = {
  txHash: `0x${string}`;
  approvalAddress: string;
  platformFeeUSD: number;
  executionFeeUSD: number;
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

  const approved = await checkLifiApproval(
    params.fromTokenAddress as `0x${string}`,
    params.fromAddress,
    BigInt(params.fromAmount),
  );
  if (!approved) {
    throw new Error(
      "Token not approved. The user must approve the LI.FI Diamond before the agent can execute.",
    );
  }

  // Step 3 — agent pays CELO relay fee, user pays via USDC deduction
  const txHash = await agentSendTx(tx.to, tx.data, value);
  return {
    txHash,
    approvalAddress: final.estimate.approvalAddress ?? LIFI_DIAMOND,
    platformFeeUSD: final.platformFeeUSD,
    executionFeeUSD: final.executionFeeUSD,
  };
}
