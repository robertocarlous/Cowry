/**
 * Agent-executed cross-chain bridge.
 *
 * Flow:
 *  1. Verify user has enough USDC and CowryPay allowance.
 *  2. Pull USDC from user → agent wallet via CowryPay.payOnBehalf.
 *     (User already approved CowryPay in the GrantAccessScreen onboarding step.)
 *  3. Get LI.FI quote with fromAddress = agentWallet so msg.sender == fromAddress.
 *  4. Agent self-approves the LI.FI spender for its own USDC if needed.
 *  5. Agent broadcasts the bridge tx and pays any CELO relay fee from its balance.
 *
 * If steps 3-5 fail after the USDC pull, we attempt to refund the user.
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
    args: [(getAgentWallet().address)],
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

/**
 * Execute a cross-chain bridge send on behalf of a user.
 *
 * `params.fromAddress` must be the user's wallet (token owner / CowryPay approver).
 * The agent wallet acts as the LI.FI `fromAddress` so msg.sender == fromAddress.
 */
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
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf",  args: [userWallet] }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "allowance", args: [userWallet, cowrypayContract.address] }),
  ]);

  console.info("[agentBridge] user pre-flight", {
    userWallet,
    fromAmount:         fromAmount.toString(),
    userBalance:        userBalance.toString(),
    cowrypayAllowance:  cowrypayAllowance.toString(),
  });

  if (userBalance < fromAmount) {
    throw new Error(
      `Insufficient balance. User has ${userBalance} base units of ${tokenAddress}, needs ${fromAmount}.`,
    );
  }
  if (cowrypayAllowance < fromAmount) {
    throw new Error(
      `Token not approved. The user must approve CowryPay (${cowrypayContract.address}) to spend ` +
      `at least ${fromAmount} base units. Current allowance: ${cowrypayAllowance}. ` +
      `This is normally done once in the Authorize Cowry AI screen.`,
    );
  }

  // ── Step 2: pull USDC from user to agent via CowryPay.payOnBehalf ───────────
  const pullData = encodeFunctionData({
    abi: cowrypayContract.abi,
    functionName: "payOnBehalf",
    args: [userWallet, tokenAddress, agentAddress, fromAmount],
  });

  console.info("[agentBridge] pulling USDC from user to agent");
  const pullHash = await agentSendTx(cowrypayContract.address, pullData, 0n);
  console.info("[agentBridge] pull tx sent", { pullHash });

  // Wait for confirmation before proceeding to bridge
  await agentClient.waitForTransactionReceipt({ hash: pullHash, timeout: 60_000 });
  console.info("[agentBridge] pull confirmed");

  // ── Step 3: get LI.FI quotes with agentAddress as fromAddress ───────────────
  const agentParams: BridgeQuoteParams = { ...params, fromAddress: agentAddress };

  let final: Awaited<ReturnType<typeof getBridgeQuote>>;
  try {
    const preview = await getBridgeQuote(agentParams, 0);
    const relayCostUSD = preview.estimate.gasCosts.reduce(
      (sum, g) => sum + Number(g.amountUSD),
      0,
    );
    final = await getBridgeQuote(agentParams, relayCostUSD);
  } catch (quoteErr) {
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw quoteErr;
  }

  const tx = final.transactionRequest;
  const value = BigInt(tx.value || "0");
  const approvalAddress = (final.estimate.approvalAddress ?? LIFI_DIAMOND) as `0x${string}`;

  // ── Step 4: agent self-approves the LI.FI spender ──────────────────────────
  // Always approve unconditionally — avoids RPC stale-state race conditions.
  // Celo USDC keeps MAX_UINT256 as-is after each transferFrom, so this is nearly
  // a no-op on subsequent sends, but the first run always needs it.
  console.info("[agentBridge] agent self-approving LI.FI spender", {
    tool: final.tool,
    approvalAddress,
    fromAmount: fromAmount.toString(),
    relayValue: formatEther(value),
  });
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [approvalAddress, 2n ** 256n - 1n],
  });
  const approveTxHash = await agentSendTx(tokenAddress, approveData, 0n);
  const approveReceipt = await agentClient.waitForTransactionReceipt({ hash: approveTxHash, timeout: 60_000 });
  if (approveReceipt.status !== "success") {
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw new Error(`Agent USDC approval failed on-chain (status: ${approveReceipt.status}). Hash: ${approveTxHash}`);
  }
  console.info("[agentBridge] agent approval confirmed", { approveTxHash, block: approveReceipt.blockNumber.toString() });

  // ── Step 5: CELO balance check ───────────────────────────────────────────────
  if (value > 0n) {
    const agentCelo = await agentClient.getBalance({ address: agentAddress });
    if (agentCelo < value) {
      await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
      throw new Error(
        `Agent wallet has insufficient CELO for relay fee. ` +
        `Needs ${formatEther(value)} CELO, has ${formatEther(agentCelo)} CELO. ` +
        `Top up the agent wallet at ${agentAddress}.`,
      );
    }
  }

  // ── Step 6: execute ─────────────────────────────────────────────────────────
  // All prerequisites confirmed: agent owns USDC, LI.FI spender approved.
  // Skip simulation — forno.celo.org is not an archive node and rejects eth_call
  // at historical block numbers. On-chain revert is handled by the catch below.
  let txHash: `0x${string}`;
  try {
    txHash = await agentSendTx(tx.to, tx.data, value);
  } catch (err) {
    console.error("[agentBridge] bridge tx failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await refundUser(agentClient, tokenAddress, userWallet, fromAmount);
    throw err;
  }

  console.info("[agentBridge] bridge tx submitted", { txHash });
  return { txHash, approvalAddress, platformFeeUSD: final.platformFeeUSD };
}
