import type { DraftRecord } from "./schemas.js";
import type { SessionState } from "./types.js";
import type { CachedOpportunity, PendingYieldDeposit } from "./lifi/types.js";
import type { PendingRemittance, PendingRemittanceQuote } from "./remittance/types.js";

const drafts = new Map<string, DraftRecord>();
const sessions = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { pendingDraftId: null };
    sessions.set(sessionId, s);
  }
  return s;
}

export function setPendingDraft(sessionId: string, draftId: string | null): void {
  getSession(sessionId).pendingDraftId = draftId;
}

export function getPendingDraft(sessionId: string): DraftRecord | null {
  const id = getSession(sessionId).pendingDraftId;
  if (!id) return null;
  return drafts.get(id) ?? null;
}

export function saveDraft(draft: DraftRecord): void {
  drafts.set(draft.draftId, draft);
}

export function getDraft(draftId: string): DraftRecord | undefined {
  return drafts.get(draftId);
}

export function clearDraft(draftId: string): void {
  drafts.delete(draftId);
}

// ── LI.FI Earn session helpers ────────────────────────────────────────────────

/** Store the vault list shown to the user during a session */
export function setEarnOpportunities(
  sessionId: string,
  opps: CachedOpportunity[],
): void {
  getSession(sessionId).earnOpportunities = opps;
}

/**
 * Retrieve a vault by 1-based index.
 * Returns the first vault (Morpho) if index is out of bounds or not provided.
 */
export function getEarnOpportunity(
  sessionId: string,
  index?: number,
): CachedOpportunity | undefined {
  const opps = getSession(sessionId).earnOpportunities;
  if (!opps || opps.length === 0) return undefined;
  const i = (index ?? 1) - 1; // convert 1-based to 0-based
  return opps[Math.max(0, Math.min(i, opps.length - 1))];
}

/** Save a pending yield deposit (awaiting user confirm) */
export function setPendingYieldDeposit(
  sessionId: string,
  deposit: PendingYieldDeposit | null,
): void {
  const s = getSession(sessionId);
  if (deposit === null) {
    delete s.pendingYieldDeposit;
  } else {
    s.pendingYieldDeposit = deposit;
  }
}

/** Retrieve the pending yield deposit for a session */
export function getPendingYieldDeposit(
  sessionId: string,
): PendingYieldDeposit | undefined {
  return getSession(sessionId).pendingYieldDeposit;
}

/** Store members while waiting for user to supply the group name */
export function setPendingGroupMembers(sessionId: string, members: string[] | null): void {
  const s = getSession(sessionId);
  if (members === null) {
    delete s.pendingGroupMembers;
  } else {
    s.pendingGroupMembers = members;
  }
}

export function getPendingGroupMembers(sessionId: string): string[] | null {
  return getSession(sessionId).pendingGroupMembers ?? null;
}

// ── Remittance session helpers ────────────────────────────────────────────────

/** Save remittance details collected so far (mid slot-filling) */
export function setPendingRemittance(
  sessionId: string,
  remittance: PendingRemittance | null,
): void {
  const s = getSession(sessionId);
  if (remittance === null) {
    delete s.pendingRemittance;
  } else {
    s.pendingRemittance = remittance;
  }
}

/** Retrieve in-progress remittance details for a session */
export function getPendingRemittance(sessionId: string): PendingRemittance | undefined {
  return getSession(sessionId).pendingRemittance;
}

/** Save a fully-resolved remittance quote (awaiting user confirm) */
export function setPendingRemittanceQuote(
  sessionId: string,
  quote: PendingRemittanceQuote | null,
): void {
  const s = getSession(sessionId);
  if (quote === null) {
    delete s.pendingRemittanceQuote;
  } else {
    s.pendingRemittanceQuote = quote;
  }
}

/** Retrieve the pending remittance quote for a session */
export function getPendingRemittanceQuote(sessionId: string): PendingRemittanceQuote | undefined {
  return getSession(sessionId).pendingRemittanceQuote;
}

/** Test helper */
export function resetStores(): void {
  drafts.clear();
  sessions.clear();
}
