/**
 * Agent-executed cross-chain bridge.
 *
 * Flow:
 *  1. Verify user balance and CowryPay allowance.
 *  2. Pre-discover relay cost (preview quote) and verify route exists.
 *  3. Pull USDC from user → agent via CowryPay.payOnBehalf (wait for receipt).
 *  4. Agent pre-approves LI.FI Diamond for MAX USDC (wait for receipt).
 *  5. Get a FRESH final quote — immediately before execution to avoid Squid
 *     permit expiry (Squid includes a time-sensitive payload in calldata).
 *  6. Execute the fresh bridge tx.
 *
 * Pull+approve happen first so the fresh quote age is ~2s at execution time.
 * If any step after the pull fails, we attempt to refund the user's USDC.
 */

import {
  createPublicClient,
  erc20Abi,
  encodeFunctionData,
  formatEther,
  http,
  type PublicClient,
} from "viem";
import { celo } from "viem/chains";
import { agentSendTx, getAgentWallet } from "../agent/wallet.js";
import { getBridgeQuote, type BridgeQuoteParams } from "./bridgeClient.js";
import { cowrypayContract } from "../abi/index.js";

/** Canonical LI.FI Diamond Router — same address on all EVM chains. */
export const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as const;

function rpcUrl() {
  return process.env.CELO_RPC_URL?.trim() ?? "https://forno.celo.org";
}

export type ExecuteBridgeResult = {
  txHash: `0x${string}`;
  approvalAddress: string;
  platformFeeUSD: number;
};

async function refundUser(
  client: PublicClient,
  token: `0x${string}`,
  userWallet: `0x${string}`,
  amount: bigint,
): Promise<void> {
  const agentBal = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [getAgentWallet().address],
  });
  const refundAmount = agentBal < amount ? agentBal : amount;
  if (refundAmount === 0n) return;

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [userWallet, refundAmount],
  });

  try {
    const h = await agentSendTx(token, transferData, 0n);
    console.info("[agentBridge] user refunded after bridge failure", { txHash: h, refundAmount: refundAmount.toString() });
  } catch (e) {
    console.error(
      "[agentBridge] REFUND FAILED — manual intervention required",
      { userWallet, token, refundAmount: refundAmount.toString(), error: e instanceof Error ? e.message : String(e) },
    );
  }
}

export async function executeBridgeForUser(
  params: BridgeQuoteParams,
): Promise<ExecuteBridgeResult> {
  const { publicClient: agentClient, address: agentAddress } = getAgentWallet();
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl()) });
  const userWallet = params.fromAddress;
  const tokenAddress = params.fromTokenAddress as `0x${string}`;
  const fromAmount = BigInt(params.fromAmount);

  // ── Step 1: verify user readiness ───────────────────────────────────────────
  const [userBalance, cowrypayAllowance] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [userWallet] }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "allowance", args: [userWallet, cowrypayContract.address] }),
  ]);

  console.info("[agentBridge] user pre-flight", {
    userWallet,
    fromAmount:        fromAmount.toString(),
    userBalance:       userBalance.toString(),
    cowrypayAllowance: cowrypayAllowance.toString(),
  });

  if (userBalance < fromAmount) {
    throw new Error(`Insufficient balance. User has ${userBalance} base units, needs ${fromAmount}.`);
  }
  if (cowrypayAllowance < fromAmount) {
    throw new Error(
      `Token not approved. The user must approve CowryPay (${cowrypayContract.address}) ` +
      `to spend at least ${fromAmount} base units. Current allowance: ${cowrypayAllowance}. ` +
      `This is done once in the Authorize Cowry AI screen.`,
    );
  }

  // ── Step 2: pre-discover relay cost (also verifies a route exists) ───────────
  // Use agentAddress as fromAddress from the start — the quote calldata is for
  // the agent wallet, and only the agent wallet will send the tx.
  const agentParams: BridgeQuoteParams = { ...params, fromAddress: agentAddress };
  let relayCostUSD = 0;
  try {
    const preview = await getBridgeQuote(agentParams, 0);
    relayCostUSD = preview.estimate.gasCosts.reduce((s, g) => s + Number(g.amountUSD), 0);
    console.info("[agentBridge] route preview", { tool: preview.tool, relayCostUSD });
  } catch (routeErr) {
    throw routeErr; // No pull yet — just propagate
  }

  // ── Step 3: pull USDC from user to agent via CowryPay.payOnBehalf ────────────
  const pullData = encodeFunctionData({
    abi: cowrypayContract.abi,
    functionName: "payOnBehalf",
    args: [userWallet, tokenAddress, agentAddress, fromAmount],
  });

  console.info("[agentBridge] pulling USDC from user to agent");
  const pullHash = await agentSendTx(cowrypayContract.address, pullData, 0n);
  console.info("[agentBridge] pull tx sent", { pullHash });
  await agentClient.waitForTransactionReceipt({ hash: pullHash, timeout: 60_000 });
  console.info("[agentBridge] pull confirmed");

  // ── Step 4: agent pre-approves LI.FI Diamond for its USDC ───────────────────
  // Approve unconditionally to guarantee state is set; Celo USDC never decrements
  // MAX_UINT256 allowances, so subsequent runs cost only gas but not state change.
  // We approve the canonical Diamond address here; if the fresh quote returns a
  // different approvalAddress we'll approve that too after the quote.
  const preApproveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [LIFI_DIAMOND, 2n ** 256n - 1n],
  });
  console.info("[agentBridge] agent pre-approving LI.FI Diamond");
  const preApproveTxHash = await agentSendTx(tokenAddress, preApproveData, 0n);
  const preApproveReceipt = await agentClient.waitForTransactionReceipt({ hash: preApproveTxHash, timeout: 60_000 });
  if (preApproveReceipt.status !== "success") {
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw new Error(`Agent USDC approval failed (status: ${preApproveReceipt.status}). Hash: ${preApproveTxHash}`);
  }
  console.info("[agentBridge] pre-approve confirmed", { preApproveTxHash });

  // ── Step 5: get a FRESH final quote — right before execution ─────────────────
  // Pull + approve are done. The fresh quote is at most ~3s old when we execute,
  // so Squid's time-sensitive permit in the calldata won't expire.
  let final: Awaited<ReturnType<typeof getBridgeQuote>>;
  try {
    final = await getBridgeQuote(agentParams, relayCostUSD);
  } catch (quoteErr) {
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw quoteErr;
  }

  const tx = final.transactionRequest;
  const value = BigInt(tx.value || "0");
  const approvalAddress = (final.estimate.approvalAddress ?? LIFI_DIAMOND) as `0x${string}`;

  // If the fresh quote uses a different spender than LIFI_DIAMOND, approve that too
  if (approvalAddress.toLowerCase() !== LIFI_DIAMOND.toLowerCase()) {
    console.info("[agentBridge] fresh quote uses non-Diamond spender — approving", { approvalAddress });
    const extraApproveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [approvalAddress, 2n ** 256n - 1n],
    });
    const extraHash = await agentSendTx(tokenAddress, extraApproveData, 0n);
    await agentClient.waitForTransactionReceipt({ hash: extraHash, timeout: 60_000 });
    console.info("[agentBridge] extra approval confirmed", { extraHash });
  }

  // ── Step 6: CELO balance check ───────────────────────────────────────────────
  if (value > 0n) {
    const agentCelo = await agentClient.getBalance({ address: agentAddress });
    console.info("[agentBridge] relay CELO check", { need: formatEther(value), have: formatEther(agentCelo) });
    if (agentCelo < value) {
      await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
      throw new Error(
        `Agent wallet has insufficient CELO for relay fee. ` +
        `Needs ${formatEther(value)} CELO, has ${formatEther(agentCelo)} CELO. Top up ${agentAddress}.`,
      );
    }
  }

  // ── Step 7: execute ──────────────────────────────────────────────────────────
  console.info("[agentBridge] submitting bridge tx", { tool: final.tool, to: tx.to, value: formatEther(value) });
  let txHash: `0x${string}`;
  try {
    txHash = await agentSendTx(tx.to, tx.data, value);
  } catch (err) {
    console.error("[agentBridge] bridge tx submission failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw err;
  }

  console.info("[agentBridge] bridge tx submitted", { txHash });
  return { txHash, approvalAddress, platformFeeUSD: final.platformFeeUSD };
}
