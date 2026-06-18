import { randomUUID } from "node:crypto";
import type { DraftRecord, DraftTxPlan, ParsedIntent } from "./schemas.js";
import { createGroqClient, generateChatReply } from "./llm.js";
import { encodeErc20Approve } from "./chain/encodeErc20.js";
import {
  encodeAddMember,
  encodeCancelGroup,
  encodeRemoveMember,
} from "./chain/encodeGroupRegistry.js";
import { readErc20Balance } from "./chain/erc20Reads.js";
import {
  encodePay,
  encodePayGroupEqual,
  encodePayGroupSplit,
  encodePayOnBehalf,
  encodePayGroupEqualOnBehalf,
  encodePayGroupSplitOnBehalf,
  encodedCallToJson,
} from "./chain/encodeCowryPay.js";
import { agentSendTx, tryGetAgentWallet } from "./agent/wallet.js";
import {
  checkUsdcReadiness,
  totalBaseUnitsFromTxPlan,
} from "./chain/usdcReadiness.js";
import {
  DEFAULT_TOKEN,
  getTokenBySymbol,
  getTokenByAddress,
  toBaseUnits,
  fromBaseUnits,
} from "./chain/tokenConfig.js";
import { resolvePaymentToken } from "./chain/paymentToken.js";
import type { PaymentTokenInfo } from "./chain/paymentToken.js";
import { getAgentIdentity } from "./agent/identity.js";
import {
  clearDraft,
  getPendingDraft,
  saveDraft,
  setPendingDraft,
  setEarnOpportunities,
  getEarnOpportunity,
  setPendingYieldDeposit,
  getPendingYieldDeposit,
  setPendingGroupMembers,
  getPendingGroupMembers,
  setPendingRemittance,
  getPendingRemittance,
  setPendingRemittanceQuote,
  getPendingRemittanceQuote,
  setPendingOnRamp,
  getPendingOnRamp,
  setPendingOnRampOrder,
  getPendingOnRampOrder,
  setOnRampOrderSession,
  getOnRampOrderSettled,
} from "./state.js";
import type { ChatResponse, EncodedTxJson, TxHistoryItem } from "./types.js";
import type { ResolutionDeps } from "./deps/types.js";
import {
  getOpportunities,
  getUserPositions,
  formatOpportunitiesList,
  formatApy,
} from "./lifi/earnClient.js";
import { getDepositQuote, estimateDailyEarnings } from "./lifi/composerClient.js";
import type { PendingYieldDeposit } from "./lifi/types.js";
import { resolveCountry, getCurrencySymbol, SUPPORTED_COUNTRIES } from "./remittance/countries.js";
import {
  getInstitutions,
  verifyAccount,
  createOffRampOrder,
  createOnRampOrder,
  type Institution,
} from "./remittance/paycrestClient.js";
import { findInstitutionMatches } from "./remittance/institutionMatch.js";
import { findRecipientByNickname, decryptAccountIdentifier } from "./remittance/recipients.js";
import type { PendingOnRamp, PendingRemittance, PendingRemittanceQuote } from "./remittance/types.js";

function parseGroupId(
  raw: string | number | undefined | null,
): bigint | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    const n = BigInt(s);
    return n > 0n ? n : null; // groupIds start at 1; 0 means the LLM didn't know it
  } catch {
    return null;
  }
}

/** Resolve groupId from either a numeric intent.groupId or a intent.groupName lookup. */
async function resolveGroupId(
  deps: ResolutionDeps,
  intent: { groupId?: string | number | null; groupName?: string | null },
  wallet: `0x${string}` | undefined,
): Promise<{ gid: bigint } | { error: string }> {
  const fromId = parseGroupId(intent.groupId);
  if (fromId !== null) return { gid: fromId };

  const name = intent.groupName?.trim();
  if (!name) {
    return { error: "Please say which group — e.g. remove @alice from Friends" };
  }
  if (!wallet) {
    return { error: "Connect your wallet so I can look up the group." };
  }
  const r = await deps.resolveGroupByName(name, wallet);
  if (!r.ok) {
    return { error: r.reason };
  }
  return { gid: r.groupId };
}

function chainAdminGate(
  deps: ResolutionDeps,
  wallet: `0x${string}` | undefined,
): string | null {
  if (deps.mode !== "chain") {
    return "Group admin commands need chain mode. Set CELO_RPC_URL (or RPC_URL).";
  }
  if (!deps.publicClient) {
    return "No RPC client.";
  }
  if (!wallet) {
    return "Pass walletAddress (the wallet that will sign).";
  }
  return null;
}

function shortAddr(a: string): string {
  const x = a.toLowerCase();
  if (x.length < 12) return a;
  return `${x.slice(0, 6)}…${x.slice(-4)}`;
}

/** Split a total human amount into `count` equal shares (token-aware). Sums exactly. */
function splitEqualShares(
  totalHuman: number,
  count: number,
  decimals: number,
): { human: number; baseUnits: bigint }[] {
  const factor = 10 ** decimals;
  const totalBase = BigInt(Math.round(totalHuman * factor));
  const base = totalBase / BigInt(count);
  const rem = Number(totalBase - base * BigInt(count));
  return Array.from({ length: count }, (_, i) => {
    const units = base + BigInt(i < rem ? 1 : 0);
    return { human: Number(units) / factor, baseUnits: units };
  });
}

async function pickPaymentToken(
  intent: ParsedIntent & { kind: "payment" },
  deps: ResolutionDeps,
  wallet: `0x${string}` | undefined,
  amountHuman: number,
): Promise<
  | { ok: true; tokenInfo: PaymentTokenInfo; tokenAddress: `0x${string}`; tokenSymbol: string }
  | { ok: false; question: string }
> {
  const r = await resolvePaymentToken({
    explicitSymbol: intent.token,
    wallet,
    client: deps.publicClient,
    amountHuman,
  });
  if (r.clarify) return { ok: false, question: r.clarify };
  const tokenInfo = r.token!;
  return {
    ok: true,
    tokenInfo,
    tokenAddress: tokenInfo.address,
    tokenSymbol: tokenInfo.symbol,
  };
}

function buildPreviewLines(
  recipients: { username: string; amount: number }[],
  tokenSymbol: string,
): string {
  const lines = recipients.map(
    (r) => `• @${r.username}: ${r.amount.toLocaleString()} ${tokenSymbol}`,
  );
  const total = recipients.reduce((s, r) => s + r.amount, 0);
  return `${lines.join("\n")}\nTotal: ${total.toLocaleString()} ${tokenSymbol}`;
}

function policyCheck(
  recipients: { username: string; address: string; amount: number }[],
): string | null {
  const maxRecipients = 50;
  const maxPerTransfer = 1_000_000_000;
  if (recipients.length > maxRecipients) {
    return `Too many recipients (max ${maxRecipients})`;
  }
  for (const r of recipients) {
    if (r.amount <= 0) return "Amounts must be positive";
    if (r.amount > maxPerTransfer) {
      return `Amount exceeds maximum (${maxPerTransfer.toLocaleString()} per recipient)`;
    }
  }
  return null;
}


async function maybeTokenReadinessBlock(
  deps: ResolutionDeps,
  wallet: `0x${string}`,
  plan: DraftTxPlan,
): Promise<ChatResponse | null> {
  if (deps.mode !== "chain" || !deps.publicClient) return null;
  const meta = await deps.getMeta();
  const tokenAddr = plan.token as `0x${string}`;
  const tokenInfo = getTokenByAddress(tokenAddr);
  const required = totalBaseUnitsFromTxPlan(plan);
  const r = await checkUsdcReadiness(
    deps.publicClient,
    tokenAddr,
    wallet,
    meta.cowryPay,
    required,
  );
  if (r.ok) return null;

  const bal = fromBaseUnits(r.balance,  tokenInfo.decimals);
  const alw = fromBaseUnits(r.allowance, tokenInfo.decimals);
  const req = fromBaseUnits(r.required,  tokenInfo.decimals);
  const sym = tokenInfo.symbol;

  if (r.reason === "insufficient_balance") {
    return {
      type: "clarify",
      question: `Not enough ${sym}: this payment needs ${req} ${sym} but your balance is ${bal} ${sym}. Fund your wallet, then try again.`,
    };
  }

  const approveTx = encodedCallToJson(
    encodeErc20Approve(tokenAddr, meta.cowryPay, r.required),
  );
  return {
    type: "clarify",
    question: `CowryPay needs permission to pull ${req} ${sym}; your ${sym} allowance for CowryPay is only ${alw} ${sym}. Sign approve below, then send the same payment again and confirm.`,
    transactions: [approveTx],
    tokenSymbol: sym,
  };
}

/** Encode a plan for the USER to sign (fallback / no agent wallet). */
function encodeTxPlan(plan: DraftTxPlan) {
  const token = plan.token as `0x${string}`;
  switch (plan.mode) {
    case "pay":
      return [
        encodedCallToJson(encodePay(token, plan.to as `0x${string}`, BigInt(plan.amountBaseUnits))),
      ];
    case "payGroupEqual":
      return [
        encodedCallToJson(encodePayGroupEqual(token, BigInt(plan.groupId), BigInt(plan.amountPerMemberBaseUnits))),
      ];
    case "payMany":
      return plan.items.map((i) =>
        encodedCallToJson(encodePay(token, i.to as `0x${string}`, BigInt(i.amountBaseUnits))),
      );
    case "payGroupSplit":
      return [
        encodedCallToJson(encodePayGroupSplit(token, BigInt(plan.groupId), BigInt(plan.totalBaseUnits))),
      ];
    default:
      throw new Error(`Unhandled plan mode: ${(plan as { mode: string }).mode}`);
  }
}

/**
 * Encode a plan for the AGENT to sign on behalf of `payer`.
 * The agent is the on-chain actor — all tx volume flows through the agent wallet.
 */
function encodeTxPlanOnBehalf(
  plan: DraftTxPlan,
  payer: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}`; value: `0x${string}` }[] {
  const token = plan.token as `0x${string}`;
  switch (plan.mode) {
    case "pay": {
      const c = encodePayOnBehalf(payer, token, plan.to as `0x${string}`, BigInt(plan.amountBaseUnits));
      return [{ to: c.to, data: c.data, value: c.value as `0x${string}` }];
    }
    case "payGroupEqual": {
      const c = encodePayGroupEqualOnBehalf(payer, token, BigInt(plan.groupId), BigInt(plan.amountPerMemberBaseUnits));
      return [{ to: c.to, data: c.data, value: c.value as `0x${string}` }];
    }
    case "payGroupSplit": {
      const c = encodePayGroupSplitOnBehalf(payer, token, BigInt(plan.groupId), BigInt(plan.totalBaseUnits));
      return [{ to: c.to, data: c.data, value: c.value as `0x${string}` }];
    }
    case "payMany":
      return plan.items.map((i) => {
        const c = encodePayOnBehalf(payer, token, i.to as `0x${string}`, BigInt(i.amountBaseUnits));
        return { to: c.to, data: c.data, value: c.value as `0x${string}` };
      });
    default:
      throw new Error(`Unhandled plan mode: ${(plan as { mode: string }).mode}`);
  }
}

export async function paymentFromIntent(
  intent: ParsedIntent,
  deps: ResolutionDeps,
  wallet: `0x${string}` | undefined,
): Promise<
  | { ok: true; draft: Omit<DraftRecord, "draftId" | "sessionId" | "createdAt"> }
  | { ok: false; question: string }
> {
  if (intent.kind !== "payment") {
    return { ok: false, question: "Not a payment command." };
  }

  if (intent.action === "SEND_SINGLE") {
    const amount = intent.amount;
    const handle = intent.recipient;
    if (amount == null || !handle) {
      return { ok: false, question: "I need an amount and a recipient like @tolu." };
    }
    const picked = await pickPaymentToken(intent, deps, wallet, amount);
    if (!picked.ok) return picked;
    const { tokenInfo, tokenAddress, tokenSymbol } = picked;

    const r = await deps.resolveUsername(handle);
    if (!r.ok) {
      return {
        ok: false,
        question: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}`,
      };
    }
    const base = toBaseUnits(amount, tokenInfo.decimals);
    const recipients = [
      { username: r.username, address: r.address, amount },
    ];
    const policy = policyCheck(recipients);
    if (policy) return { ok: false, question: policy };
    const preview = buildPreviewLines(recipients, tokenSymbol);
    const txPlan: DraftTxPlan = {
      mode: "pay",
      token: tokenAddress,
      to: r.address,
      amountHuman: amount,
      amountBaseUnits: base.toString(),
    };
    return {
      ok: true,
      draft: {
        action: "SEND_SINGLE",
        recipients,
        totalAmount: amount,
        preview,
        txPlan,
      },
    };
  }

  if (intent.action === "SEND_TO_GROUP") {
    const per = intent.perRecipientAmount;
    const gname = intent.groupName;
    if (per == null || !gname) {
      return {
        ok: false,
        question: "I need an amount per person and a group name.",
      };
    }
    const groupLabel = gname
      .trim()
      .toLowerCase()
      .replace(/\b(the|a|my)\b/g, "")
      .replace(/\bgroup\b/g, "")
      .trim();
    if (!groupLabel) {
      return {
        ok: false,
        question:
          "Which group should get paid? Example: I want to send $100 to group Friends (use your group’s name).",
      };
    }
    if (deps.mode === "chain" && !wallet) {
      return {
        ok: false,
        question:
          "Pass walletAddress (your wallet) in the API body so we can find groups you own or belong to.",
      };
    }
    const g = await deps.resolveGroupByName(gname, wallet);
    if (!g.ok) {
      return { ok: false, question: g.reason };
    }
    const totalForToken = per * g.members.length;
    const picked = await pickPaymentToken(intent, deps, wallet, totalForToken);
    if (!picked.ok) return picked;
    const { tokenInfo, tokenAddress, tokenSymbol } = picked;

    const perBase = toBaseUnits(per, tokenInfo.decimals);

    if (g.kind === "onchain") {
      const recipients = g.members.map((addr) => ({
        username: shortAddr(addr),
        address: addr,
        amount: per,
      }));
      const policy = policyCheck(recipients);
      if (policy) return { ok: false, question: policy };
      const preview = buildPreviewLines(recipients, tokenSymbol);
      const totalAmount = per * g.members.length;
      const txPlan: DraftTxPlan = {
        mode: "payGroupEqual",
        token: tokenAddress,
        groupId: g.groupId.toString(),
        amountPerMemberHuman: per,
        amountPerMemberBaseUnits: perBase.toString(),
        memberCount: g.members.length,
      };
      return {
        ok: true,
        draft: {
          action: "SEND_TO_GROUP",
          recipients,
          totalAmount,
          preview,
          txPlan,
        },
      };
    }

    return {
      ok: false,
      question: "Group resolution returned an unsupported result.",
    };
  }

  if (intent.action === "GROUP_SPLIT_TOTAL") {
    const total = intent.amount;
    const gname = intent.groupName;
    if (total == null || !gname) {
      return {
        ok: false,
        question:
          "I need a total amount and a group, e.g. split 100 USDC across group Friends or split 50 USDm in Friends group.",
      };
    }
    const groupLabel = gname
      .trim()
      .toLowerCase()
      .replace(/\b(the|a|my)\b/g, "")
      .replace(/\bgroup\b/g, "")
      .trim();
    if (!groupLabel) {
      return {
        ok: false,
        question:
          "Which group? Example: split $90 across group Team (include the group name).",
      };
    }
    if (deps.mode === "chain" && !wallet) {
      return {
        ok: false,
        question:
          "Pass walletAddress so we can resolve the group on-chain.",
      };
    }
    const g = await deps.resolveGroupByName(gname, wallet);
    if (!g.ok) {
      return { ok: false, question: g.reason };
    }
    const picked = await pickPaymentToken(intent, deps, wallet, total);
    if (!picked.ok) return picked;
    const { tokenInfo, tokenAddress, tokenSymbol } = picked;

    const totalBase = toBaseUnits(total, tokenInfo.decimals);
    const n = g.members.length;
    const shares = splitEqualShares(total, n, tokenInfo.decimals);
    if (g.kind !== "onchain") {
      return {
        ok: false,
        question: "Group resolution returned an unsupported result.",
      };
    }
    const recipients = g.members.map((addr, i) => ({
      username: shortAddr(addr),
      address: addr,
      amount: shares[i]!.human,
    }));
    const policy = policyCheck(recipients);
    if (policy) return { ok: false, question: policy };
    const preview = `${buildPreviewLines(recipients, tokenSymbol)}\n(One payGroupSplit tx on-chain; preview shows an even micro-split for display.)`;

    if (g.kind === "onchain") {
      const txPlan: DraftTxPlan = {
        mode: "payGroupSplit",
        token: tokenAddress,
        groupId: g.groupId.toString(),
        totalHuman: total,
        totalBaseUnits: totalBase.toString(),
        memberCount: n,
      };
      return {
        ok: true,
        draft: {
          action: "GROUP_SPLIT_TOTAL",
          recipients,
          totalAmount: total,
          preview,
          txPlan,
        },
      };
    }

    const items = recipients.map((r, i) => ({
      to: r.address as `0x${string}`,
      amountHuman: shares[i]!.human,
      amountBaseUnits: shares[i]!.baseUnits.toString(),
    }));
    return {
      ok: true,
      draft: {
        action: "GROUP_SPLIT_TOTAL",
        recipients,
        totalAmount: total,
        preview,
        txPlan: { mode: "payMany", token: tokenAddress, items },
      },
    };
  }

  if (intent.action === "SPLIT_EQUAL") {
    const total = intent.amount;
    const members = intent.members;
    const splitCount = intent.splitCount;
    if (total == null) {
      return { ok: false, question: "I need a total amount to split." };
    }
    if (!members || members.length < 2) {
      if (splitCount != null && splitCount >= 2) {
        return {
          ok: false,
          question: `Split among ${splitCount} people — who should receive? Tag them: @ada @tolu …`,
        };
      }
      return {
        ok: false,
        question:
          "Name at least two recipients with @username, or say how many people and who they are.",
      };
    }
    const resolved: { username: string; address: `0x${string}` }[] = [];
    for (const h of members) {
      const r = await deps.resolveUsername(h);
      if (!r.ok) {
        return {
          ok: false,
          question: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}`,
        };
      }
      resolved.push({ username: r.username, address: r.address });
    }
    const picked = await pickPaymentToken(intent, deps, wallet, total);
    if (!picked.ok) return picked;
    const { tokenInfo, tokenAddress, tokenSymbol } = picked;

    const shares = splitEqualShares(total, resolved.length, tokenInfo.decimals);
    const recipients = resolved.map((r, i) => ({
      username: r.username,
      address: r.address,
      amount: shares[i]!.human,
    }));
    const policy = policyCheck(recipients);
    if (policy) return { ok: false, question: policy };
    const preview = buildPreviewLines(recipients, tokenSymbol);
    const items = resolved.map((r, i) => ({
      to: r.address,
      amountHuman: shares[i]!.human,
      amountBaseUnits: shares[i]!.baseUnits.toString(),
    }));
    const txPlan: DraftTxPlan = { mode: "payMany", token: tokenAddress, items };
    return {
      ok: true,
      draft: {
        action: "SPLIT_EQUAL",
        recipients,
        totalAmount: total,
        preview,
        txPlan,
      },
    };
  }

  return { ok: false, question: "Unsupported payment action." };
}

type AdminIntentResult =
  | { kind: "info"; message: string; transactions?: EncodedTxJson[] }
  | { kind: "clarify"; question: string }
  | { kind: "tx_history"; items: TxHistoryItem[] };

export async function adminFromIntent(
  intent: ParsedIntent,
  deps: ResolutionDeps,
  wallet: `0x${string}` | undefined,
  rawText?: string,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<AdminIntentResult> {
  if (intent.kind !== "admin") {
    return { kind: "clarify", question: "Not an admin command." };
  }
  if (intent.action === "REGISTER_USERNAME") {
    const name = intent.username?.trim();
    if (!name) {
      return {
        kind: "clarify",
        question:
          "Say register as yourname (3–32 characters: lowercase letters and numbers only).",
      };
    }
    const res = await deps.adminRegisterUsername(name, wallet);
    if (!res.ok) {
      return { kind: "clarify", question: res.reason };
    }
    return {
      kind: "info",
      message: res.message,
      transactions: res.transactions,
    };
  }
  if (intent.action === "APPROVE_USDC") {
    const amt = intent.amount;
    if (amt == null || !Number.isFinite(amt)) {
      return {
        kind: "clarify",
        question:
          "Say how much USDC to approve, e.g. approve 500 usdc for cowry or approve cowry to spend 50.",
      };
    }
    if (deps.mode !== "chain") {
      return {
        kind: "info",
        message:
          deps.reason ??
          "Celo RPC is not configured. Set CELO_RPC_URL (or RPC_URL) so Cowry can build on-chain approval transactions.",
      };
    }
    if (!wallet) {
      return {
        kind: "clarify",
        question:
          "Pass walletAddress (the wallet that will sign the approve transaction).",
      };
    }
    const meta = await deps.getMeta();
    const approveToken = intent.token ? getTokenBySymbol(intent.token) : DEFAULT_TOKEN;
    const base = toBaseUnits(amt, approveToken.decimals);
    const tx = encodeErc20Approve(approveToken.address, meta.cowryPay, base);
    return {
      kind: "info",
      message: `Sign ${approveToken.symbol}.approve so CowryPay can pull up to ${amt} ${approveToken.symbol} (approve more if you plan several payments).`,
      transactions: [encodedCallToJson(tx)],
    };
  }
  if (intent.action === "ADD_MEMBERS") {
    const gate = chainAdminGate(deps, wallet);
    if (gate) return { kind: "clarify", question: gate };
    const groupRes = await resolveGroupId(deps, intent, wallet);
    if ("error" in groupRes) return { kind: "clarify", question: groupRes.error };
    const gid = groupRes.gid;
    const handles = intent.members ?? [];
    if (handles.length === 0) {
      return {
        kind: "clarify",
        question: "Who do you want to add? e.g. add @mack to Friends",
      };
    }
    const resolved: { username: string; address: `0x${string}` }[] = [];
    for (const h of handles) {
      const r = await deps.resolveUsername(h);
      if (!r.ok) {
        return { kind: "clarify", question: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}` };
      }
      resolved.push({ username: r.username, address: r.address });
    }
    // Agent-executed path
    const addAgentWallet = tryGetAgentWallet();
    if (addAgentWallet && deps.mode === "chain") {
      try {
        for (const m of resolved) {
          const c = encodeAddMember(gid, m.address);
          await agentSendTx(c.to as `0x${string}`, c.data as `0x${string}`, 0n);
        }
        const names = resolved.map(m => `@${m.username}`).join(", ");
        return { kind: "info", message: `✅ Added ${names} to group ${gid}.` };
      } catch (err) {
        return { kind: "clarify", question: `Agent could not add member: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    const txs = resolved.map(m => encodedCallToJson(encodeAddMember(gid, m.address)));
    return {
      kind: "info",
      message: `Sign ${txs.length} addMember tx(s) for group ${gid}.`,
      transactions: txs,
    };
  }
  if (intent.action === "REMOVE_MEMBERS") {
    const gate = chainAdminGate(deps, wallet);
    if (gate) return { kind: "clarify", question: gate };
    const groupRes = await resolveGroupId(deps, intent, wallet);
    if ("error" in groupRes) return { kind: "clarify", question: groupRes.error };
    const gid = groupRes.gid;
    const handles = intent.members ?? [];
    if (handles.length === 0) {
      return { kind: "clarify", question: "Who do you want to remove? e.g. remove @mack from Friends" };
    }
    const resolvedRm: { username: string; address: `0x${string}` }[] = [];
    for (const h of handles) {
      const r = await deps.resolveUsername(h);
      if (!r.ok) {
        return { kind: "clarify", question: `Cannot resolve @${r.username}: ${r.reason ?? "unknown"}` };
      }
      resolvedRm.push({ username: r.username, address: r.address });
    }
    // Agent-executed path
    const rmAgentWallet = tryGetAgentWallet();
    if (rmAgentWallet && deps.mode === "chain") {
      try {
        for (const m of resolvedRm) {
          const c = encodeRemoveMember(gid, m.address);
          await agentSendTx(c.to as `0x${string}`, c.data as `0x${string}`, 0n);
        }
        const names = resolvedRm.map(m => `@${m.username}`).join(", ");
        return { kind: "info", message: `✅ Removed ${names} from group ${gid}.` };
      } catch (err) {
        return { kind: "clarify", question: `Agent could not remove member: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    const rmTxs = resolvedRm.map(m => encodedCallToJson(encodeRemoveMember(gid, m.address)));
    return {
      kind: "info",
      message: `Sign ${rmTxs.length} removeMember tx(s) for group ${gid}.`,
      transactions: rmTxs,
    };
  }
  if (intent.action === "CANCEL_GROUP") {
    const gate = chainAdminGate(deps, wallet);
    if (gate) return { kind: "clarify", question: gate };
    const gid = parseGroupId(intent.groupId);
    if (gid == null) {
      return {
        kind: "clarify",
        question: "Say which group id, e.g. cancel group 3.",
      };
    }
    const tx = encodeCancelGroup(gid);
    return {
      kind: "info",
      message: `Sign cancelGroup for id ${gid} (owner only). Future group pays will be blocked.`,
      transactions: [encodedCallToJson(tx)],
    };
  }
  if (intent.action === "LIST_GROUPS") {
    if (deps.mode === "chain" && !wallet) {
      return {
        kind: "clarify",
        question:
          "Pass walletAddress in the request body to list on-chain groups.",
      };
    }
    const message = await deps.listGroups(wallet);
    return { kind: "info", message };
  }
  if (intent.action === "HELP") {
    return {
      kind: "info",
      message: [
        "Cowry — send money abroad and bridge crypto on Celo:",
        "• Send $50 to a bank account in Nigeria — cross-border payout via Paycrest, recipient doesn't need Cowry",
        "• Send $20 to mobile money in Kenya, 0712345678 — same idea for mobile money",
        "• Send USDC or USDm from Celo to USDC on Ethereum, Base, Arbitrum and more",
        "• approve 500 USDC for cowry",
        "• my balance / my transactions",
        "• GET /tx/0x… — receipt status after you broadcast",
        "After a quote or draft: confirm or cancel.",
      ].join("\n"),
    };
  }
  if (intent.action === "CREATE_GROUP") {
    const name = intent.groupName?.trim();
    const mem = intent.members ?? [];
    if (!name && mem.length > 0) {
      await setPendingGroupMembers(sessionId ?? "", mem);
      return {
        kind: "clarify",
        question: `What do you want to name this group?`,
      };
    }
    if (!name || mem.length === 0) {
      return {
        kind: "clarify",
        question: "What do you want to name this group, and who should be in it?\n\nExample: create group Friends with @alice, @bob",
      };
    }
    const res = await deps.adminCreateGroup(name, mem, wallet);
    if (!res.ok) {
      return { kind: "clarify", question: res.reason };
    }
    return {
      kind: "info",
      message: res.message,
      transactions: res.transactions,
    };
  }
  if (intent.action === "BALANCE") {
    if (!wallet) {
      return {
        kind: "info",
        message: "Pass walletAddress in the request to check your balance.",
      };
    }
    if (deps.mode !== "chain" || !deps.publicClient) {
      return { kind: "info", message: "Balance check requires an RPC connection (mock mode)." };
    }
    try {
      const USDM  = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`;
      const USDC  = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`;
      const [usdmRaw, usdcRaw] = await Promise.all([
        readErc20Balance(deps.publicClient, USDM, wallet),
        readErc20Balance(deps.publicClient, USDC, wallet),
      ]);
      const usdm = (Number(usdmRaw) / 1e18).toFixed(4);
      const usdc = (Number(usdcRaw) / 1e6).toFixed(4);
      return {
        kind: "info",
        message:
          `💳 Balance for ${wallet.slice(0, 6)}…${wallet.slice(-4)}\n\n` +
          `• USDm: ${Number(usdm).toLocaleString()} USDm\n` +
          `• USDC: ${Number(usdc).toLocaleString()} USDC\n\n` +
          `Network: Celo Mainnet`,
      };
    } catch (e) {
      return {
        kind: "clarify",
        question: `Could not fetch balance: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (intent.action === "TX_HISTORY") {
    if (!wallet) {
      return { kind: "info", message: "Connect your wallet to view your transaction history." };
    }
    if (deps.mode !== "chain" || !deps.publicClient) {
      return { kind: "info", message: "Transaction history requires an RPC connection." };
    }
    try {
      const USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`;
      const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`;
      const TRANSFER_EVENT = {
        name: "Transfer",
        type: "event" as const,
        inputs: [
          { name: "from",  type: "address" as const, indexed: true  },
          { name: "to",    type: "address" as const, indexed: true  },
          { name: "value", type: "uint256" as const, indexed: false },
        ],
      };

      const latestBlock = await deps.publicClient.getBlockNumber().catch(() => 0n);
      const fromBlock   = latestBlock > 50_000n ? latestBlock - 50_000n : 0n;

      const [usdmSent, usdmReceived, usdcSent, usdcReceived] = await Promise.all([
        deps.publicClient.getLogs({ address: USDM, event: TRANSFER_EVENT, args: { from: wallet }, fromBlock, toBlock: "latest" }).catch(() => []),
        deps.publicClient.getLogs({ address: USDM, event: TRANSFER_EVENT, args: { to:   wallet }, fromBlock, toBlock: "latest" }).catch(() => []),
        deps.publicClient.getLogs({ address: USDC, event: TRANSFER_EVENT, args: { from: wallet }, fromBlock, toBlock: "latest" }).catch(() => []),
        deps.publicClient.getLogs({ address: USDC, event: TRANSFER_EVENT, args: { to:   wallet }, fromBlock, toBlock: "latest" }).catch(() => []),
      ]);

      type RawLog = { transactionHash?: string | null; args?: Record<string, unknown>; blockNumber?: bigint | null };

      const toItem = (log: RawLog, token: "USDC" | "USDm", direction: "sent" | "received") => {
        const hash = log.transactionHash ?? "";
        const args = log.args ?? {};
        const rawValue = typeof args["value"] === "bigint" ? args["value"] : 0n;
        const decimals  = token === "USDC" ? 6 : 18;
        const amount    = (Number(rawValue) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 4 });
        const other     = direction === "sent"
          ? (typeof args["to"]   === "string" ? args["to"]   : "")
          : (typeof args["from"] === "string" ? args["from"] : "");
        const short     = typeof other === "string" && other.length > 10
          ? `${other.slice(0, 6)}…${other.slice(-4)}`
          : String(other);
        return {
          hash,
          direction,
          amount: `${amount} ${token}`,
          token,
          counterparty: short,
          explorerUrl: `https://celoscan.io/tx/${hash}`,
          blockNumber: log.blockNumber ?? 0n,
        };
      };

      const all = [
        ...usdmSent.map(l => toItem(l as RawLog, "USDm", "sent")),
        ...usdmReceived.map(l => toItem(l as RawLog, "USDm", "received")),
        ...usdcSent.map(l => toItem(l as RawLog, "USDC", "sent")),
        ...usdcReceived.map(l => toItem(l as RawLog, "USDC", "received")),
      ]
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, 10)
        .map(({ blockNumber: _b, ...rest }) => rest);

      if (all.length === 0) {
        return { kind: "info", message: "No recent USDC or USDm transactions found for your wallet." };
      }

      return { kind: "tx_history", items: all };
    } catch (e) {
      return { kind: "info", message: `Could not load transactions: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (intent.action === "CHAT") {
    // General conversational message — use LLM to reply naturally
    const llm = createGroqClient();
    if (llm) {
      try {
        const reply = await generateChatReply(llm, rawText ?? "Hello", undefined, signal);
        return { kind: "info", message: reply };
      } catch {
        // fall through to default
      }
    }
    return {
      kind: "info",
      message:
        "Hi! I'm Cowry — your AI payment assistant on Celo.\n\nTry: send $50 to a bank account in Nigeria, send USDC to another chain, my balance, or say help for all commands.",
    };
  }

  return { kind: "clarify", question: "Unknown admin command." };
}

// ── LI.FI Earn handler ───────────────────────────────────────────────────────────────

export async function earnFromIntent(
  intent: ParsedIntent,
  sessionId: string,
  walletAddress: `0x${string}` | undefined,
): Promise<ChatResponse> {
  if (intent.kind !== "earn") {
    return { type: "clarify", question: "Not an earn command." };
  }

  // ── LIST_OPPORTUNITIES ────────────────────────────────────────────────────
  if (intent.action === "LIST_OPPORTUNITIES") {
    let opps;
    try {
      opps = await getOpportunities({
        tokenSymbol: "USDC",
        chainName: intent.chainName,
        minApy: intent.minApy,
        limit: 5,
      });
    } catch (e) {
      return {
        type: "info",
        message: `⚠️ Could not fetch yield vaults right now: ${
          e instanceof Error ? e.message : String(e)
        }. Try again in a moment.`,
      };
    }
    await setEarnOpportunities(sessionId, opps);
    const list = formatOpportunitiesList(opps);
    return {
      type: "info",
      message:
        `*🏦 Top USDC Yield Vaults (via LI.FI)*\n\n${list}\n\n` +
        `Reply with a number and amount to deposit, e.g.\n` +
        `*deposit 0.1 USDC into vault 1* or *1 with 0.05 USDC*`,
    };
  }

  // ── DEPOSIT_YIELD ───────────────────────────────────────────────────────────
  if (intent.action === "DEPOSIT_YIELD") {
    if (!walletAddress) {
      return {
        type: "clarify",
        question: "Pass walletAddress so we can build your deposit transaction.",
      };
    }
    if (intent.token && intent.token.toUpperCase() !== "USDC") {
      return {
        type: "clarify",
        question: `This vault only accepts USDC deposits — ${intent.token} isn't supported. Want to deposit USDC instead? e.g. *deposit 0.1 USDC into vault 1*`,
      };
    }
    const amount = intent.amount;
    if (!amount || amount <= 0) {
      return {
        type: "clarify",
        question: "How much USDC would you like to deposit? e.g. *deposit 0.1 USDC into vault 1*",
      };
    }
    if (amount < 0.02) {
      return {
        type: "clarify",
        question: `Minimum deposit is 0.02 USDC (balances visible from 0.02 USDC on Morpho). You entered ${amount} USDC.`,
      };
    }

    // Get the selected vault (or default to vault 1 = Morpho)
    const opp = await getEarnOpportunity(sessionId, intent.vaultIndex ?? 1);
    if (!opp) {
      // No opportunities list in session — fetch first
      try {
        const opps = await getOpportunities({ tokenSymbol: "USDC", limit: 5 });
        await setEarnOpportunities(sessionId, opps);
      } catch {
        return {
          type: "clarify",
          question: "Say *earn yield on my USDC* first to see the vault list, then pick one.",
        };
      }
    }
    const vault = await getEarnOpportunity(sessionId, intent.vaultIndex ?? 1);
    if (!vault) {
      return {
        type: "clarify",
        question: "Could not find that vault. Say *earn yield* to see the current list.",
      };
    }

    // Build deposit tx via LI.FI Composer
    let quote;
    try {
      quote = await getDepositQuote({
        opportunityId: vault.id,
        fromChainId: vault.chainId,
        fromTokenAddress: vault.tokenAddress,
        fromAmount: toBaseUnits(amount, vault.tokenDecimals).toString(),
        fromAddress:walletAddress,
        toTokenAddress: vault.vaultAddress,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        type: "clarify",
        question: `Could not build deposit quote: ${msg.slice(0, 200)}. Check that you have enough USDC on Base and try again.`,
      };
    }

    const tx = quote.transactionRequest;
    const daily = estimateDailyEarnings(amount, vault.apy);
    const yearly = estimateDailyEarnings(amount * 365, vault.apy);

    // Store pending for confirm
    const deposit: PendingYieldDeposit = {
      step: "AWAIT_YIELD_CONFIRM",
      opportunity: vault,
      amountHuman: amount,
      txTo:       tx.to,
      txData:     tx.data,
      txValue:    tx.value,
      txChainId:  tx.chainId,
      txGasLimit: tx.gasLimit,
      txGasPrice: tx.gasPrice,
      createdAt:  Date.now(),
    };
    await setPendingYieldDeposit(sessionId, deposit);

    return {
      type: "info",
      message:
        `*🏦 Yield Deposit Preview*\n\n` +
        `• Vault: *${vault.protocol} Gauntlet USDC Prime*\n` +
        `• Network: *${vault.chainName}* (Chain ID: ${vault.chainId})\n` +
        `• Amount: *${amount} USDC*\n` +
        `• APY: *${formatApy(vault.apy)}*\n` +
        `• Daily earnings: *${daily}*\n` +
        `• Yearly earnings: *${yearly.replace("~$", "~$")}*\n\n` +
        `Type *confirm* to sign and broadcast, or *cancel* to abort.`,
    };
  }

  // ── VIEW_POSITIONS ───────────────────────────────────────────────────────────
  if (intent.action === "VIEW_POSITIONS") {
    if (!walletAddress) {
      return {
        type: "clarify",
        question: "Pass walletAddress so I can check your yield positions.",
      };
    }
    let positions;
    try {
      positions = await getUserPositions(walletAddress);
    } catch (e) {
      return {
        type: "info",
        message: `⚠️ Could not fetch positions: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (positions.length === 0) {
      return {
        type: "info",
        message:
          `No active yield positions found for ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}.\n` +
          `Say *earn yield on my USDC* to see available vaults and make a deposit.`,
      };
    }
    const NUMS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
    const lines = positions.map((p, i) => {
      const num = NUMS[i] ?? `${i + 1}.`;
      return (
        `${num} *${p.protocol ?? "Unknown"}* on ${p.chainName ?? "??"}\n` +
        `   Balance: *$${p.balanceUsd.toFixed(4)} USDC*` +
        (p.apy ? ` | APY: *${formatApy(p.apy)}*` : "")
      );
    });
    const total = positions.reduce((s, p) => s + (p.balanceUsd ?? 0), 0);
    return {
      type: "info",
      message:
        `*📈 Your Yield Positions*\n\n${lines.join("\n\n")}\n\n` +
        `Total: *$${total.toFixed(4)} USDC*\n` +
        `View on Morpho: https://app.morpho.org/base/vault/0x050cE30b927Da55177A4914EC73480238BAD56f0/gauntlet-usdc-prime`,
    };
  }

  return { type: "clarify", question: "Unknown earn command." };
}

// ── Remittance / cross-border (Paycrest) handler ─────────────────────────────

type RemittanceSlots = {
  amount: number;
  /** Source token on Celo to send — "USDC" or "USDT". */
  token: "USDC" | "USDT";
  countryCode: string;
  currencyCode: string;
  institutionCode: string;
  institutionName: string;
  accountIdentifier: string;
  recipientNickname?: string;
};

/** Platform fee skimmed from every remittance, in basis points (100 = 1%). */
const REMITTANCE_FEE_BPS = 100;

/** Treasury wallet that receives the platform fee on each remittance. */
const REMITTANCE_TREASURY_ADDRESS = process.env.REMITTANCE_TREASURY_ADDRESS as `0x${string}` | undefined;

/** Split a send amount into the platform fee and the net amount Paycrest converts. */
function computeFeeSplit(amount: number): { feeAmount: number; netAmount: number } {
  const feeAmount = Math.round(amount * REMITTANCE_FEE_BPS) / 10_000;
  const netAmount = Math.round((amount - feeAmount) * 1_000_000) / 1_000_000;
  return { feeAmount, netAmount };
}

/**
 * Verify the account, lock a real rate by creating a Paycrest order, store
 * the quote (including the order's receiveAddress) in session state, and
 * return a `remittance_quote` response.
 *
 * Paycrest's public `/rates` estimate endpoint doesn't support the celo
 * network, so we lock the rate up front via `createOffRampOrder` instead —
 * its `rate`/`receiveAddress`/`validUntil` are reused directly on confirm
 * (re-created only if `validUntil` has passed by then).
 */
async function buildRemittanceQuote(
  sessionId: string,
  slots: RemittanceSlots,
  walletAddress: `0x${string}`,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let accountName: string;
  try {
    accountName = await verifyAccount(slots.institutionCode, slots.accountIdentifier, signal);
  } catch (e) {
    // Keep the rest of the slots but ask the user to re-check the account number.
    await setPendingRemittance(sessionId, {
      amount: slots.amount,
      token: slots.token,
      countryCode: slots.countryCode,
      currencyCode: slots.currencyCode,
      institutionCode: slots.institutionCode,
      institutionName: slots.institutionName,
    });
    return {
      type: "clarify",
      question: `I couldn't verify that account (${
        e instanceof Error ? e.message : String(e)
      }). Please double-check the account or phone number and send it again.`,
    };
  }

  const resolvedAccountName = accountName.toUpperCase() === "OK" ? "Recipient" : accountName;
  const { feeAmount, netAmount } = computeFeeSplit(slots.amount);

  let order;
  try {
    order = await createOffRampOrder({
      amount: netAmount,
      network: "celo",
      fromCurrency: slots.token,
      refundAddress: walletAddress,
      toCurrency: slots.currencyCode,
      institution: slots.institutionCode,
      accountIdentifier: slots.accountIdentifier,
      accountName: resolvedAccountName,
      memo: "Cowry remittance",
    }, signal);
  } catch (e) {
    await setPendingRemittance(sessionId, null);
    return {
      type: "clarify",
      question: `Couldn't get a payout quote right now (${
        e instanceof Error ? e.message : String(e)
      }). Please try again in a moment.`,
    };
  }

  const rateNum = Number(order.rate);
  const receiveAmount = netAmount * rateNum;
  const estimatedReceive = receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const last4 = slots.accountIdentifier.slice(-4);
  const displayLabel = `${slots.institutionName} ••••${last4}`;
  const symbol = getCurrencySymbol(slots.currencyCode);

  const quote: PendingRemittanceQuote = {
    amount: slots.amount,
    feeAmount,
    netAmount,
    token: slots.token,
    countryCode: slots.countryCode,
    currencyCode: slots.currencyCode,
    institutionCode: slots.institutionCode,
    institutionName: slots.institutionName,
    accountIdentifier: slots.accountIdentifier,
    accountName: resolvedAccountName,
    estimatedReceive,
    displayLabel,
    recipientNickname: slots.recipientNickname,
    orderId: order.id,
    receiveAddress: order.receiveAddress,
    rate: order.rate,
    validUntil: order.validUntil,
  };

  await setPendingRemittance(sessionId, null);
  await setPendingRemittanceQuote(sessionId, quote);

  const recipientLabel = `${resolvedAccountName} (${displayLabel})`;
  const rateLabel = `1 USD ≈ ${symbol}${rateNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} (locked for ~1hr)`;

  const feeLabel = `${feeAmount} ${slots.token}`;

  const preview =
    `🌍 Cross-Border Payment\n` +
    `To: ${recipientLabel}\n` +
    `They get: ${symbol}${estimatedReceive} ${slots.currencyCode}\n` +
    `You send: ${slots.amount} ${slots.token}\n` +
    `Fee: ${feeLabel}\n` +
    `Rate: ${rateLabel}\n\n` +
    `Reply confirm to send, or cancel to abort.`;

  return {
    type: "remittance_quote",
    preview,
    recipientLabel,
    sendAmount: String(slots.amount),
    sendToken: slots.token,
    receiveAmount: estimatedReceive,
    receiveCurrency: slots.currencyCode,
    rateLabel,
    feeLabel,
  };
}

/**
 * Continue collecting remittance details across turns: country -> institution
 * -> account number, in that order. `answer` is the user's reply to whichever
 * question was asked last (undefined when called with a fully-formed intent).
 */
async function continueRemittanceSlotFilling(
  sessionId: string,
  pending: PendingRemittance,
  walletAddress: `0x${string}`,
  answer?: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let unconsumed = answer?.trim() || undefined;

  // 1. Country / currency
  if (!pending.currencyCode) {
    if (unconsumed) {
      const country = resolveCountry(unconsumed);
      unconsumed = undefined;
      if (country) {
        pending.countryCode = country.countryCode;
        pending.currencyCode = country.currencyCode;
      } else {
        await setPendingRemittance(sessionId, pending);
        return {
          type: "clarify",
          question: `I didn't recognize that country. Which country is the recipient in? (${SUPPORTED_COUNTRIES.join(", ")})`,
        };
      }
    } else {
      await setPendingRemittance(sessionId, pending);
      return {
        type: "clarify",
        question: `Which country is the recipient in? (${SUPPORTED_COUNTRIES.join(", ")})`,
      };
    }
  }

  // 2. Institution (bank / mobile money provider)
  if (!pending.institutionCode) {
    // If we previously offered a numbered list, check whether this reply
    // selects from it (e.g. "3").
    if (pending.institutionCandidates && unconsumed) {
      const idx = parseInt(unconsumed.trim(), 10);
      const choice = pending.institutionCandidates[idx - 1];
      if (Number.isInteger(idx) && choice) {
        pending.institutionCode = choice.code;
        pending.institutionName = choice.name;
        pending.institutionCandidates = undefined;
        unconsumed = undefined;
      } else {
        // Not a valid selection — treat as a fresh free-text query.
        pending.institutionCandidates = undefined;
      }
    }

    if (!pending.institutionCode) {
      // A fresh reply always (re)sets the query — covers both a first answer
      // and a retry after a failed lookup below.
      if (unconsumed) {
        pending.institutionQuery = unconsumed;
        unconsumed = undefined;
      } else if (!pending.institutionQuery) {
        await setPendingRemittance(sessionId, pending);
        return {
          type: "clarify",
          question: "What's the bank or mobile money provider? (e.g. GTBank, Access Bank, MTN MoMo)",
        };
      }

      let institutions: Institution[];
      try {
        institutions = await getInstitutions(pending.currencyCode, signal);
      } catch (e) {
        await setPendingRemittance(sessionId, pending);
        return {
          type: "clarify",
          question: `Could not look up banks/providers right now (${
            e instanceof Error ? e.message : String(e)
          }). Please try again.`,
        };
      }

      const attempted = pending.institutionQuery;
      const matches = findInstitutionMatches(attempted, institutions);
      if (matches.length === 1) {
        pending.institutionCode = matches[0]!.code;
        pending.institutionName = matches[0]!.name;
        pending.institutionQuery = undefined;
      } else if (matches.length === 0) {
        pending.institutionQuery = undefined;
        pending.institutionCandidates = institutions.map((i) => ({ name: i.name, code: i.code }));
        await setPendingRemittance(sessionId, pending);
        const list = institutions.map((i, idx) => `${idx + 1}. ${i.name}`).join("\n");
        return {
          type: "clarify",
          question: `I couldn't find "${attempted}" for ${pending.currencyCode}. Reply with a number:\n${list}`,
        };
      } else {
        pending.institutionQuery = undefined;
        pending.institutionCandidates = matches.map((m) => ({ name: m.name, code: m.code }));
        await setPendingRemittance(sessionId, pending);
        const list = matches.map((m, idx) => `${idx + 1}. ${m.name}`).join("\n");
        return {
          type: "clarify",
          question: `I found a few matches for "${attempted}". Reply with a number:\n${list}`,
        };
      }
    }
  }

  // 3. Account / phone number
  if (!pending.accountIdentifier) {
    if (unconsumed) {
      pending.accountIdentifier = unconsumed;
      unconsumed = undefined;
    } else {
      await setPendingRemittance(sessionId, pending);
      return {
        type: "clarify",
        question: "What's the account number (or phone number for mobile money)?",
      };
    }
  }

  return buildRemittanceQuote(
    sessionId,
    {
      amount: pending.amount,
      token: pending.token,
      countryCode: pending.countryCode!,
      currencyCode: pending.currencyCode!,
      institutionCode: pending.institutionCode!,
      institutionName: pending.institutionName!,
      accountIdentifier: pending.accountIdentifier,
    },
    walletAddress,
    signal,
  );
}

// ── On-ramp / fiat → USDC (Paycrest) ─────────────────────────────────────────

async function buildOnRampOrder(
  sessionId: string,
  pending: Required<Pick<PendingOnRamp, "fiatAmount" | "fiatCurrency" | "countryCode" | "institutionCode" | "institutionName" | "accountIdentifier">>,
  walletAddress: `0x${string}`,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  // Verify the refund account so we have the canonical account name.
  let accountName: string;
  try {
    accountName = await verifyAccount(pending.institutionCode, pending.accountIdentifier, signal);
  } catch (e) {
    await setPendingOnRamp(sessionId, {
      fiatAmount: pending.fiatAmount,
      fiatCurrency: pending.fiatCurrency,
      countryCode: pending.countryCode,
      institutionCode: pending.institutionCode,
      institutionName: pending.institutionName,
    });
    return {
      type: "clarify",
      question: `Couldn't verify that account (${
        e instanceof Error ? e.message : String(e)
      }). Please double-check the account number and send it again.`,
    };
  }

  const resolvedName = accountName.toUpperCase() === "OK" ? "Account holder" : accountName;

  let order;
  try {
    order = await createOnRampOrder({
      fiatAmount: pending.fiatAmount,
      fiatCurrency: pending.fiatCurrency,
      refundInstitution: pending.institutionCode,
      refundAccountIdentifier: pending.accountIdentifier,
      refundAccountName: resolvedName,
      toCurrency: "USDC",
      recipientAddress: walletAddress,
      network: "celo",
    }, signal);
  } catch (e) {
    await setPendingOnRamp(sessionId, null);
    return {
      type: "clarify",
      question: `Couldn't create the on-ramp order (${
        e instanceof Error ? e.message : String(e)
      }). Please try again in a moment.`,
    };
  }

  const rateNum = Number(order.rate);
  const estimatedUsdc = rateNum > 0
    ? (pending.fiatAmount / rateNum).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";
  const symbol = getCurrencySymbol(pending.fiatCurrency);
  const expiry = new Date(order.validUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Store order state and orderId → sessionId mapping for the webhook.
  await setPendingOnRamp(sessionId, null);
  await setPendingOnRampOrder(sessionId, {
    orderId: order.id,
    fiatAmount: pending.fiatAmount,
    fiatCurrency: pending.fiatCurrency,
    providerBank: order.providerBank,
    providerAccountNumber: order.providerAccountNumber,
    providerAccountName: order.providerAccountName,
    amountToTransfer: order.amountToTransfer,
    validUntil: order.validUntil,
    rate: order.rate,
  });
  await setOnRampOrderSession(order.id, sessionId);

  const preview =
    `💰 Buy USDC\n` +
    `Send ${symbol}${order.amountToTransfer} ${pending.fiatCurrency} to:\n` +
    `Bank: ${order.providerBank}\n` +
    `Account: ${order.providerAccountNumber}\n` +
    `Name: ${order.providerAccountName}\n` +
    `You'll receive: ~${estimatedUsdc} USDC\n` +
    `Expires: ${expiry}\n\n` +
    `Once you've made the transfer, your USDC will arrive automatically.`;

  return {
    type: "onramp_virtual_account",
    preview,
    bank: order.providerBank,
    accountNumber: order.providerAccountNumber,
    accountName: order.providerAccountName,
    amountToTransfer: order.amountToTransfer,
    fiatCurrency: pending.fiatCurrency,
    estimatedUsdc,
    validUntil: order.validUntil,
    orderId: order.id,
  };
}

async function continueOnRampSlotFilling(
  sessionId: string,
  pending: PendingOnRamp,
  walletAddress: `0x${string}`,
  answer?: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let unconsumed = answer?.trim() || undefined;

  // 1. Currency / country
  if (!pending.fiatCurrency) {
    if (unconsumed) {
      const country = resolveCountry(unconsumed);
      unconsumed = undefined;
      if (country) {
        pending.countryCode = country.countryCode;
        pending.fiatCurrency = country.currencyCode;
      } else {
        await setPendingOnRamp(sessionId, pending);
        return {
          type: "clarify",
          question: `I didn't recognise that currency. Which country are you paying from? (${SUPPORTED_COUNTRIES.join(", ")})`,
        };
      }
    } else {
      await setPendingOnRamp(sessionId, pending);
      return {
        type: "clarify",
        question: `Which country are you paying from? (${SUPPORTED_COUNTRIES.join(", ")})`,
      };
    }
  }

  // 2. Refund bank (in case the deposit fails/expires)
  if (!pending.institutionCode) {
    if (pending.institutionCandidates && unconsumed) {
      const idx = parseInt(unconsumed.trim(), 10);
      const choice = pending.institutionCandidates[idx - 1];
      if (Number.isInteger(idx) && choice) {
        pending.institutionCode = choice.code;
        pending.institutionName = choice.name;
        pending.institutionCandidates = undefined;
        unconsumed = undefined;
      } else {
        pending.institutionCandidates = undefined;
      }
    }

    if (!pending.institutionCode) {
      if (unconsumed) {
        pending.institutionQuery = unconsumed;
        unconsumed = undefined;
      } else if (!pending.institutionQuery) {
        await setPendingOnRamp(sessionId, pending);
        return {
          type: "clarify",
          question: "What's your bank name? (needed for refunds if the transfer fails)",
        };
      }

      let institutions: Institution[];
      try {
        institutions = await getInstitutions(pending.fiatCurrency, signal);
      } catch (e) {
        await setPendingOnRamp(sessionId, pending);
        return {
          type: "clarify",
          question: `Could not look up banks right now (${
            e instanceof Error ? e.message : String(e)
          }). Please try again.`,
        };
      }

      const matches = findInstitutionMatches(pending.institutionQuery!, institutions);
      if (matches.length === 1) {
        pending.institutionCode = matches[0]!.code;
        pending.institutionName = matches[0]!.name;
        pending.institutionQuery = undefined;
      } else if (matches.length === 0) {
        pending.institutionQuery = undefined;
        pending.institutionCandidates = institutions.map((i) => ({ name: i.name, code: i.code }));
        await setPendingOnRamp(sessionId, pending);
        const list = institutions.map((i, idx) => `${idx + 1}. ${i.name}`).join("\n");
        return {
          type: "clarify",
          question: `Couldn't find that bank. Reply with a number:\n${list}`,
        };
      } else {
        pending.institutionQuery = undefined;
        pending.institutionCandidates = matches.map((m) => ({ name: m.name, code: m.code }));
        await setPendingOnRamp(sessionId, pending);
        const list = matches.map((m, idx) => `${idx + 1}. ${m.name}`).join("\n");
        return {
          type: "clarify",
          question: `Found a few matches. Reply with a number:\n${list}`,
        };
      }
    }
  }

  // 3. Refund account number
  if (!pending.accountIdentifier) {
    if (unconsumed) {
      pending.accountIdentifier = unconsumed;
    } else {
      await setPendingOnRamp(sessionId, pending);
      return {
        type: "clarify",
        question: "What's your account number? (for refunds only — your USDC goes straight to your wallet)",
      };
    }
  }

  return buildOnRampOrder(
    sessionId,
    {
      fiatAmount: pending.fiatAmount,
      fiatCurrency: pending.fiatCurrency!,
      countryCode: pending.countryCode!,
      institutionCode: pending.institutionCode!,
      institutionName: pending.institutionName!,
      accountIdentifier: pending.accountIdentifier,
    },
    walletAddress,
    signal,
  );
}

export async function onrampFromIntent(
  intent: ParsedIntent,
  walletAddress: `0x${string}` | undefined,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  if (intent.kind !== "onramp") {
    return { type: "clarify", question: "Not an on-ramp command." };
  }
  if (!walletAddress) {
    return { type: "clarify", question: "Connect your wallet so Cowry knows where to send your USDC." };
  }

  const existing = await getPendingOnRamp(sessionId);
  const fiatAmount = intent.fiatAmount ?? existing?.fiatAmount;
  if (!fiatAmount || !(fiatAmount > 0)) {
    return {
      type: "clarify",
      question: "How much do you want to deposit? e.g. buy 10000 NGN worth of USDC",
    };
  }

  const pending: PendingOnRamp = {
    fiatAmount,
    fiatCurrency: existing?.fiatCurrency,
    countryCode: existing?.countryCode,
    institutionQuery: existing?.institutionQuery,
    institutionCode: existing?.institutionCode,
    institutionName: existing?.institutionName,
    accountIdentifier: existing?.accountIdentifier,
  };

  if (intent.countryHint && !pending.fiatCurrency) {
    const country = resolveCountry(intent.countryHint);
    if (country) {
      pending.countryCode = country.countryCode;
      pending.fiatCurrency = country.currencyCode;
    }
  }
  if (intent.institutionHint && !pending.institutionCode && !pending.institutionQuery) {
    pending.institutionQuery = intent.institutionHint;
  }
  if (intent.accountIdentifier && !pending.accountIdentifier) {
    pending.accountIdentifier = intent.accountIdentifier;
  }

  return continueOnRampSlotFilling(sessionId, pending, walletAddress, undefined, signal);
}

export async function remittanceFromIntent(
  intent: ParsedIntent,
  walletAddress: `0x${string}` | undefined,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  if (intent.kind !== "remittance") {
    return { type: "clarify", question: "Not a remittance command." };
  }

  if (!walletAddress) {
    return {
      type: "clarify",
      question: "Connect your wallet so Cowry can send this payment on your behalf.",
    };
  }

  const existing = await getPendingRemittance(sessionId);
  const amount = intent.amount ?? existing?.amount;
  if (amount == null || !(amount > 0)) {
    return {
      type: "clarify",
      question: "How much USDC would you like to send abroad? e.g. send $50 to a bank account in Nigeria",
    };
  }

  // Paycrest lists USDT on Celo in its token registry, but its off-ramp
  // providers don't actually have liquidity configured for it yet — orders
  // and rate quotes both reject it. Only USDC is usable for now.
  let token: "USDC" | "USDT" = existing?.token ?? "USDC";
  if (intent.token) {
    const upper = intent.token.toUpperCase();
    if (upper === "USDC") {
      token = upper;
    } else {
      return {
        type: "clarify",
        question: `Cross-border payouts currently support USDC only on Celo — ${intent.token} isn't available yet. Want to send USDC instead?`,
      };
    }
  }

  // ── Saved recipient fast path ───────────────────────────────────────────
  if (intent.recipientNickname && !existing) {
    const saved = await findRecipientByNickname(walletAddress, intent.recipientNickname);
    if (saved) {
      return buildRemittanceQuote(
        sessionId,
        {
          amount,
          token,
          countryCode: saved.countryCode,
          currencyCode: saved.currencyCode,
          institutionCode: saved.institutionCode,
          institutionName: saved.institutionName,
          accountIdentifier: decryptAccountIdentifier(saved),
          recipientNickname: saved.nickname,
        },
        walletAddress,
        signal,
      );
    }
  }

  const pending: PendingRemittance = {
    amount,
    token,
    countryCode: existing?.countryCode,
    currencyCode: existing?.currencyCode,
    institutionQuery: existing?.institutionQuery,
    institutionCode: existing?.institutionCode,
    institutionName: existing?.institutionName,
    accountIdentifier: existing?.accountIdentifier,
  };

  if (intent.countryHint && !pending.currencyCode) {
    const country = resolveCountry(intent.countryHint);
    if (country) {
      pending.countryCode = country.countryCode;
      pending.currencyCode = country.currencyCode;
    }
  }
  if (intent.institutionHint && !pending.institutionCode && !pending.institutionQuery) {
    pending.institutionQuery = intent.institutionHint;
  }
  if (intent.accountIdentifier && !pending.accountIdentifier) {
    pending.accountIdentifier = intent.accountIdentifier;
  }

  return continueRemittanceSlotFilling(sessionId, pending, walletAddress, undefined, signal);
}

/**
 * Lock the real exchange rate via Paycrest, then have the agent broadcast
 * the source token -> Paycrest's receiveAddress on the sender's behalf.
 */
async function confirmRemittance(
  quote: PendingRemittanceQuote,
  deps: ResolutionDeps,
  walletAddress: `0x${string}`,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const sourceToken = getTokenBySymbol(quote.token);
  const amountBaseUnits = toBaseUnits(quote.amount, sourceToken.decimals);

  if (deps.mode === "chain" && deps.publicClient) {
    const plan: DraftTxPlan = {
      mode: "pay",
      token: sourceToken.address,
      to: walletAddress, // unused by checkUsdcReadiness; placeholder to satisfy the type
      amountHuman: quote.amount,
      amountBaseUnits: amountBaseUnits.toString(),
    };
    const block = await maybeTokenReadinessBlock(deps, walletAddress, plan);
    if (block) return block;
  }

  const agentWallet = tryGetAgentWallet();
  if (!agentWallet || deps.mode !== "chain") {
    return {
      type: "clarify",
      question: "The Cowry agent wallet is not configured — cannot execute this payment automatically.",
    };
  }

  // The quote already locked an order (with receiveAddress) when it was
  // built. Reuse it unless its validUntil window has passed, in which case
  // create a fresh order to get a current receiveAddress/rate.
  let order: { id: string; receiveAddress: string };
  if (new Date(quote.validUntil).getTime() > Date.now()) {
    order = { id: quote.orderId, receiveAddress: quote.receiveAddress };
  } else {
    try {
      order = await createOffRampOrder({
        amount: quote.netAmount,
        network: "celo",
        fromCurrency: quote.token,
        refundAddress: walletAddress,
        toCurrency: quote.currencyCode,
        institution: quote.institutionCode,
        accountIdentifier: quote.accountIdentifier,
        accountName: quote.accountName,
        memo: "Cowry remittance",
      }, signal);
    } catch (e) {
      return {
        type: "clarify",
        question: `Could not create the payout order (${
          e instanceof Error ? e.message : String(e)
        }). Reply confirm to retry, or cancel to abort.`,
      };
    }
  }

  // Split the total into the net amount that funds the Paycrest order and the
  // platform fee, deriving one from the other so they sum to exactly
  // `amountBaseUnits` (avoids rounding drift between two independent
  // toBaseUnits conversions).
  const feeAmountBaseUnits = toBaseUnits(quote.feeAmount, sourceToken.decimals);
  const netAmountBaseUnits = amountBaseUnits - feeAmountBaseUnits;

  let txHash: `0x${string}`;
  try {
    const call = encodePayOnBehalf(
      walletAddress,
      sourceToken.address,
      order.receiveAddress as `0x${string}`,
      netAmountBaseUnits,
    );
    txHash = await agentSendTx(call.to, call.data, 0n);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      type: "clarify",
      question: `Order ${order.id} was created but the on-chain payment failed (${errMsg}). Please contact support with this order ID.`,
    };
  }

  // Best-effort platform fee transfer. The recipient payout above already
  // succeeded, so a failure here shouldn't surface as an error to the user —
  // just log it for follow-up.
  if (feeAmountBaseUnits > 0n && REMITTANCE_TREASURY_ADDRESS) {
    try {
      const feeCall = encodePayOnBehalf(
        walletAddress,
        sourceToken.address,
        REMITTANCE_TREASURY_ADDRESS,
        feeAmountBaseUnits,
      );
      await agentSendTx(feeCall.to, feeCall.data, 0n);
    } catch (err) {
      console.error("Remittance fee transfer failed:", err);
    }
  }

  const explorerUrl = `https://celoscan.io/tx/${txHash}`;
  const symbol = getCurrencySymbol(quote.currencyCode);
  const preview =
    `✅ Sent! ${quote.accountName} will receive ${symbol}${quote.estimatedReceive} ${quote.currencyCode} ` +
    `in their ${quote.institutionName} account shortly.\n\n` +
    `Paycrest order: ${order.id}`;
  return {
    type: "tx_sent",
    preview,
    txHash,
    explorerUrl,
    agentAddress: agentWallet.address,
  };
}

const CONFIRM_RE = /^(yes|y|confirm|ok|proceed|sure)\b/i;
const CANCEL_RE = /^(no|cancel|stop|nope)\b/i;

export type ParseMessageFn = (text: string, signal?: AbortSignal) => Promise<ParsedIntent>;

export async function handleUserMessage(
  sessionId: string,
  message: string,
  deps: ResolutionDeps,
  parseFn: ParseMessageFn,
  walletAddress?: `0x${string}`,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const t = message.trim();

  // ── Pending group name ────────────────────────────────────────────────────
  // User was asked "What do you want to name this group?" — treat next message as name.
  const pendingGroupMembers = await getPendingGroupMembers(sessionId);
  if (pendingGroupMembers && !CONFIRM_RE.test(t) && !CANCEL_RE.test(t)) {
    const groupName = t.replace(/^["']|["']$/g, "").trim(); // strip optional quotes
    await setPendingGroupMembers(sessionId, null);
    if (groupName) {
      const fakeIntent: ParsedIntent = {
        kind: "admin",
        action: "CREATE_GROUP",
        groupName,
        members: pendingGroupMembers,
      };
      const a = await adminFromIntent(fakeIntent, deps, walletAddress, t, sessionId, signal);
      if (a.kind === "clarify") return { type: "clarify", question: a.question };
      if (a.kind === "tx_history") return { type: "tx_history", items: a.items };
      return {
        type: "info",
        message: a.message,
        ...(a.transactions?.length ? { transactions: a.transactions } : {}),
      };
    }
  }

  // ── Pending on-ramp slot-filling ─────────────────────────────────────────
  const pendingOnRamp = await getPendingOnRamp(sessionId);
  if (pendingOnRamp && !CONFIRM_RE.test(t) && !CANCEL_RE.test(t)) {
    if (!walletAddress) {
      return { type: "clarify", question: "Connect your wallet so Cowry knows where to send your USDC." };
    }
    return continueOnRampSlotFilling(sessionId, pendingOnRamp, walletAddress, t, signal);
  }

  // ── Settled on-ramp order notification ───────────────────────────────────
  // Check if a previously created on-ramp order has been settled by Paycrest
  // (webhook wrote the settlement flag to Redis).
  const pendingOnRampOrder = await getPendingOnRampOrder(sessionId);
  if (pendingOnRampOrder) {
    const settled = await getOnRampOrderSettled(pendingOnRampOrder.orderId);
    if (settled) {
      await setPendingOnRampOrder(sessionId, null);
      const symbol = getCurrencySymbol(pendingOnRampOrder.fiatCurrency);
      return {
        type: "info",
        message:
          `✅ Your ${symbol}${pendingOnRampOrder.amountToTransfer} deposit has been confirmed! ` +
          `${settled} USDC has been sent to your wallet on Celo.\n\nOrder: ${pendingOnRampOrder.orderId}`,
      };
    }
  }

  // ── Pending remittance slot-filling ───────────────────────────────────────
  // User was asked for a country / bank / account number — treat the next
  // message as the answer to that question.
  const pendingRemittance = await getPendingRemittance(sessionId);
  if (pendingRemittance && !CONFIRM_RE.test(t) && !CANCEL_RE.test(t)) {
    if (!walletAddress) {
      return {
        type: "clarify",
        question: "Connect your wallet so Cowry can prepare this payout.",
      };
    }
    return continueRemittanceSlotFilling(sessionId, pendingRemittance, walletAddress, t, signal);
  }

  if (CONFIRM_RE.test(t)) {
    // ── Check remittance quote confirmation ───────────────────────────────
    const pendingRemit = await getPendingRemittanceQuote(sessionId);
    if (pendingRemit) {
      if (!walletAddress) {
        return {
          type: "clarify",
          question: "Connect your wallet to confirm this remittance.",
        };
      }
      await setPendingRemittanceQuote(sessionId, null);
      return confirmRemittance(pendingRemit, deps, walletAddress, signal);
    }

    // ── Check yield deposit confirmation first ────────────────────────────
    const pendingYield = await getPendingYieldDeposit(sessionId);
    if (pendingYield) {
      await setPendingYieldDeposit(sessionId, null);
      const earnTx: EncodedTxJson = {
        to: pendingYield.txTo,
        data: pendingYield.txData,
        value: pendingYield.txValue,
        description: `Deposit ${pendingYield.amountHuman} USDC into ${pendingYield.opportunity.protocol} on ${pendingYield.opportunity.chainName}`,
      };
      return {
        type: "earn_draft",
        preview:
          `Deposit ${pendingYield.amountHuman} USDC into ` +
          `${pendingYield.opportunity.protocol} (${pendingYield.opportunity.chainName}) ` +
          `at ${formatApy(pendingYield.opportunity.apy)} APY`,
        transactions: [earnTx],
      };
    }

    // ── Existing payment draft confirmation ─────────────────────────────
    const pending = await getPendingDraft(sessionId);
    if (!pending) {
      return {
        type: "info",
        message: "Nothing to confirm. Try a payment command first.",
      };
    }
    if (deps.mode === "chain") {
      if (!walletAddress) {
        return {
          type: "clarify",
          question:
            "Pass walletAddress in the request body to confirm (must match a registered Cowry wallet).",
        };
      }
      if (!(await deps.isWalletRegistered(walletAddress))) {
        return {
          type: "clarify",
          question:
            "This wallet is not registered yet. Say register as yourname, sign the tx, then confirm again.",
        };
      }
      if (deps.publicClient) {
        const block = await maybeTokenReadinessBlock(
          deps,
          walletAddress,
          pending.txPlan,
        );
        if (block) return block;
      }
    }
    await setPendingDraft(sessionId, null);
    await clearDraft(pending.draftId);

    // ── Agent-executed path ────────────────────────────────────────────────
    // The Cowry AI agent signs and broadcasts the tx directly.
    // Funds: payer (user, pre-approved CowryPay) → recipients.
    // All tx volume is on the agent's address — agent is the on-chain actor.
    const agentWallet = tryGetAgentWallet();
    if (agentWallet && walletAddress && deps.mode === "chain") {
      try {
        const calls = encodeTxPlanOnBehalf(pending.txPlan, walletAddress);
        let lastHash: `0x${string}` = "0x";
        for (const call of calls) {
          lastHash = await agentSendTx(call.to, call.data, 0n);
        }
        const explorerUrl = `https://celoscan.io/tx/${lastHash}`;
        return {
          type: "tx_sent",
          preview: pending.preview,
          txHash: lastHash,
          explorerUrl,
          agentAddress: agentWallet.address,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const meta = await deps.getMeta();
        const tokenInfo = getTokenByAddress(pending.txPlan.token);
        const transactions = encodeTxPlan(pending.txPlan);
        const agent = await getAgentIdentity(deps.publicClient);
        return {
          type: "tx_ready",
          draftId: pending.draftId,
          preview: pending.preview,
          tx: {
            chainId: meta.chainId,
            token: { address: tokenInfo.address, symbol: tokenInfo.symbol, decimals: tokenInfo.decimals },
            cowryPay: meta.cowryPay,
            note: `⚠️ Agent execution failed (${errMsg}). Please sign manually.`,
            transactions,
          },
          ...(agent ? { agent } : {}),
        };
      }
    }

    // ── Fallback: no agent wallet → return calldata for user to sign ──────
    const meta = await deps.getMeta();
    const tokenInfo = getTokenByAddress(pending.txPlan.token);
    const transactions = encodeTxPlan(pending.txPlan);
    const agent = await getAgentIdentity(deps.publicClient);
    return {
      type: "tx_ready",
      draftId: pending.draftId,
      preview: pending.preview,
      tx: {
        chainId: meta.chainId,
        token: { address: tokenInfo.address, symbol: tokenInfo.symbol, decimals: tokenInfo.decimals },
        cowryPay: meta.cowryPay,
        note: "AGENT_PRIVATE_KEY not set. You are signing with your MiniPay wallet.",
        transactions,
      },
      ...(agent ? { agent } : {}),
    };
  }

  if (CANCEL_RE.test(t)) {
    // Clear on-ramp if pending
    if (await getPendingOnRamp(sessionId)) {
      await setPendingOnRamp(sessionId, null);
      return { type: "cancelled", message: "On-ramp cancelled. What next?" };
    }
    if (await getPendingOnRampOrder(sessionId)) {
      await setPendingOnRampOrder(sessionId, null);
      return { type: "cancelled", message: "On-ramp order dismissed. What next?" };
    }
    // Clear remittance quote/slot-filling if pending
    if (await getPendingRemittanceQuote(sessionId)) {
      await setPendingRemittanceQuote(sessionId, null);
      return { type: "cancelled", message: "Remittance cancelled. What next?" };
    }
    if (await getPendingRemittance(sessionId)) {
      await setPendingRemittance(sessionId, null);
      return { type: "cancelled", message: "Remittance cancelled. What next?" };
    }
    // Clear yield deposit if pending
    const pendingYield = await getPendingYieldDeposit(sessionId);
    if (pendingYield) {
      await setPendingYieldDeposit(sessionId, null);
      return { type: "cancelled", message: "Yield deposit cancelled. What next?" };
    }
    const pending = await getPendingDraft(sessionId);
    if (pending) {
      await clearDraft(pending.draftId);
      await setPendingDraft(sessionId, null);
      return { type: "cancelled", message: "Draft cancelled. What next?" };
    }
    return { type: "info", message: "No active draft. Say help for examples." };
  }

  const intent = await parseFn(t, signal);

  if (intent.kind === "unknown") {
    // Try conversational LLM reply before showing the fallback error
    const llm = createGroqClient();
    if (llm) {
      try {
        const reply = await generateChatReply(llm, t, undefined, signal);
        return { type: "info", message: reply };
      } catch { /* fall through */ }
    }
    return {
      type: "clarify",
      question:
        "I didn't quite get that. Try send $50 to a bank account in Nigeria, send USDC to another chain, my balance, or say help for all commands.",
    };
  }

  if (intent.kind === "admin") {
    const a = await adminFromIntent(intent, deps, walletAddress, t, sessionId, signal);
    if (a.kind === "clarify") {
      return { type: "clarify", question: a.question };
    }
    if (a.kind === "tx_history") {
      return { type: "tx_history", items: a.items };
    }
    return {
      type: "info",
      message: a.message,
      ...(a.transactions?.length ? { transactions: a.transactions } : {}),
    };
  }

  // ── On-ramp / fiat → USDC intents ──────────────────────────────────────────
  if (intent.kind === "onramp") {
    return onrampFromIntent(intent, walletAddress, sessionId, signal);
  }

  // ── LI.FI Earn intents ─────────────────────────────────────────────────────
  if (intent.kind === "earn") {
    return earnFromIntent(intent, sessionId, walletAddress);
  }

  // ── Remittance / cross-border intents ───────────────────────────────────────
  // Independent of the @username payment flow — the recipient does not need
  // a Cowry account, so this bypasses the isWalletRegistered gate below.
  if (intent.kind === "remittance") {
    return remittanceFromIntent(intent, walletAddress, sessionId, signal);
  }

  if (intent.kind === "payment") {
    if (deps.mode === "chain") {
      if (!walletAddress) {
        return {
          type: "clarify",
          question:
            "Include walletAddress in the JSON body. We use it to confirm your wallet is registered with a Cowry name before sending, and to find your groups.",
        };
      }
      if (!(await deps.isWalletRegistered(walletAddress))) {
        return {
          type: "clarify",
          question:
            "Link your wallet to a Cowry name first: say register as yourname (3–32 chars, a–z and 0–9), sign the UsernameRegistry transaction, then try paying again.",
        };
      }
    }
  }

  const p = await paymentFromIntent(intent, deps, walletAddress);
  if (!p.ok) return { type: "clarify", question: p.question };

  if (deps.mode === "chain" && deps.publicClient && walletAddress) {
    const block = await maybeTokenReadinessBlock(
      deps,
      walletAddress,
      p.draft.txPlan,
    );
    if (block) return block;
  }

  const draftId = randomUUID();
  const draft: DraftRecord = {
    draftId,
    sessionId,
    createdAt: Date.now(),
    ...p.draft,
  };
  await saveDraft(draft);
  await setPendingDraft(sessionId, draftId);

  const draftToken = getTokenByAddress(p.draft.txPlan.token);

  return {
    type: "draft",
    draftId,
    preview: draft.preview,
    action: draft.action,
    recipients: draft.recipients,
    totalAmount: draft.totalAmount,
    tokenSymbol: draftToken.symbol,
  };
}
