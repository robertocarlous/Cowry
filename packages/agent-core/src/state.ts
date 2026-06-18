import { Redis } from "@upstash/redis";

import type { DraftRecord } from "./schemas.js";
import type { SessionState } from "./types.js";
import type { CachedOpportunity, PendingYieldDeposit } from "./lifi/types.js";
import type { PendingOnRamp, PendingOnRampOrder, PendingRemittance, PendingRemittanceQuote } from "./remittance/types.js";

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars are not set");
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

// Pending chat state shouldn't outlive a day — this just keeps Redis from
// accumulating abandoned sessions/drafts indefinitely.
const TTL_SECONDS = 60 * 60 * 24;

function sessionKey(sessionId: string): string {
  return `cowry:session:${sessionId}`;
}

function draftKey(draftId: string): string {
  return `cowry:draft:${draftId}`;
}

async function getSession(sessionId: string): Promise<SessionState> {
  const s = await getRedis().get<SessionState>(sessionKey(sessionId));
  return s ?? { pendingDraftId: null };
}

async function saveSession(sessionId: string, s: SessionState): Promise<void> {
  await getRedis().set(sessionKey(sessionId), s, { ex: TTL_SECONDS });
}

export async function setPendingDraft(sessionId: string, draftId: string | null): Promise<void> {
  const s = await getSession(sessionId);
  s.pendingDraftId = draftId;
  await saveSession(sessionId, s);
}

export async function getPendingDraft(sessionId: string): Promise<DraftRecord | null> {
  const s = await getSession(sessionId);
  if (!s.pendingDraftId) return null;
  return getDraft(s.pendingDraftId);
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  await getRedis().set(draftKey(draft.draftId), draft, { ex: TTL_SECONDS });
}

export async function getDraft(draftId: string): Promise<DraftRecord | null> {
  const d = await getRedis().get<DraftRecord>(draftKey(draftId));
  return d ?? null;
}

export async function clearDraft(draftId: string): Promise<void> {
  await getRedis().del(draftKey(draftId));
}

// ── LI.FI Earn session helpers ────────────────────────────────────────────────

/** Store the vault list shown to the user during a session */
export async function setEarnOpportunities(
  sessionId: string,
  opps: CachedOpportunity[],
): Promise<void> {
  const s = await getSession(sessionId);
  s.earnOpportunities = opps;
  await saveSession(sessionId, s);
}

/**
 * Retrieve a vault by 1-based index.
 * Returns the first vault (Morpho) if index is out of bounds or not provided.
 */
export async function getEarnOpportunity(
  sessionId: string,
  index?: number,
): Promise<CachedOpportunity | undefined> {
  const opps = (await getSession(sessionId)).earnOpportunities;
  if (!opps || opps.length === 0) return undefined;
  const i = (index ?? 1) - 1; // convert 1-based to 0-based
  return opps[Math.max(0, Math.min(i, opps.length - 1))];
}

/** Save a pending yield deposit (awaiting user confirm) */
export async function setPendingYieldDeposit(
  sessionId: string,
  deposit: PendingYieldDeposit | null,
): Promise<void> {
  const s = await getSession(sessionId);
  if (deposit === null) {
    delete s.pendingYieldDeposit;
  } else {
    s.pendingYieldDeposit = deposit;
  }
  await saveSession(sessionId, s);
}

/** Retrieve the pending yield deposit for a session */
export async function getPendingYieldDeposit(
  sessionId: string,
): Promise<PendingYieldDeposit | undefined> {
  return (await getSession(sessionId)).pendingYieldDeposit;
}

/** Store members while waiting for user to supply the group name */
export async function setPendingGroupMembers(sessionId: string, members: string[] | null): Promise<void> {
  const s = await getSession(sessionId);
  if (members === null) {
    delete s.pendingGroupMembers;
  } else {
    s.pendingGroupMembers = members;
  }
  await saveSession(sessionId, s);
}

export async function getPendingGroupMembers(sessionId: string): Promise<string[] | null> {
  return (await getSession(sessionId)).pendingGroupMembers ?? null;
}

// ── Remittance session helpers ────────────────────────────────────────────────

/** Save remittance details collected so far (mid slot-filling) */
export async function setPendingRemittance(
  sessionId: string,
  remittance: PendingRemittance | null,
): Promise<void> {
  const s = await getSession(sessionId);
  if (remittance === null) {
    delete s.pendingRemittance;
  } else {
    s.pendingRemittance = remittance;
  }
  await saveSession(sessionId, s);
}

/** Retrieve in-progress remittance details for a session */
export async function getPendingRemittance(sessionId: string): Promise<PendingRemittance | undefined> {
  return (await getSession(sessionId)).pendingRemittance;
}

/** Save a fully-resolved remittance quote (awaiting user confirm) */
export async function setPendingRemittanceQuote(
  sessionId: string,
  quote: PendingRemittanceQuote | null,
): Promise<void> {
  const s = await getSession(sessionId);
  if (quote === null) {
    delete s.pendingRemittanceQuote;
  } else {
    s.pendingRemittanceQuote = quote;
  }
  await saveSession(sessionId, s);
}

/** Retrieve the pending remittance quote for a session */
export async function getPendingRemittanceQuote(sessionId: string): Promise<PendingRemittanceQuote | undefined> {
  return (await getSession(sessionId)).pendingRemittanceQuote;
}

// ── On-ramp session helpers ───────────────────────────────────────────────────

export async function setPendingOnRamp(sessionId: string, onramp: PendingOnRamp | null): Promise<void> {
  const s = await getSession(sessionId);
  if (onramp === null) delete s.pendingOnRamp;
  else s.pendingOnRamp = onramp;
  await saveSession(sessionId, s);
}

export async function getPendingOnRamp(sessionId: string): Promise<PendingOnRamp | undefined> {
  return (await getSession(sessionId)).pendingOnRamp;
}

export async function setPendingOnRampOrder(sessionId: string, order: PendingOnRampOrder | null): Promise<void> {
  const s = await getSession(sessionId);
  if (order === null) delete s.pendingOnRampOrder;
  else s.pendingOnRampOrder = order;
  await saveSession(sessionId, s);
}

export async function getPendingOnRampOrder(sessionId: string): Promise<PendingOnRampOrder | undefined> {
  return (await getSession(sessionId)).pendingOnRampOrder;
}

/** Map orderId → sessionId so the webhook can find the right session. */
export async function setOnRampOrderSession(orderId: string, sessionId: string): Promise<void> {
  await getRedis().set(`cowry:onramp:order:${orderId}`, sessionId, { ex: TTL_SECONDS });
}

export async function getOnRampOrderSession(orderId: string): Promise<string | null> {
  return getRedis().get<string>(`cowry:onramp:order:${orderId}`);
}

/** Mark an on-ramp order as settled (called by the webhook). */
export async function setOnRampOrderSettled(orderId: string, amountPaid: string): Promise<void> {
  await getRedis().set(`cowry:onramp:settled:${orderId}`, amountPaid, { ex: TTL_SECONDS });
}

export async function getOnRampOrderSettled(orderId: string): Promise<string | null> {
  return getRedis().get<string>(`cowry:onramp:settled:${orderId}`);
}
