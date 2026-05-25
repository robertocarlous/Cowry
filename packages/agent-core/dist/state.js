const drafts = new Map();
const sessions = new Map();
export function getSession(sessionId) {
    let s = sessions.get(sessionId);
    if (!s) {
        s = {
            pendingDraftId: null
        };
        sessions.set(sessionId, s);
    }
    return s;
}
export function setPendingDraft(sessionId, draftId) {
    getSession(sessionId).pendingDraftId = draftId;
}
export function getPendingDraft(sessionId) {
    const id = getSession(sessionId).pendingDraftId;
    if (!id) return null;
    return drafts.get(id) ?? null;
}
export function saveDraft(draft) {
    drafts.set(draft.draftId, draft);
}
export function getDraft(draftId) {
    return drafts.get(draftId);
}
export function clearDraft(draftId) {
    drafts.delete(draftId);
}
export function setEarnOpportunities(sessionId, opps) {
    getSession(sessionId).earnOpportunities = opps;
}
export function getEarnOpportunity(sessionId, index) {
    const opps = getSession(sessionId).earnOpportunities;
    if (!opps || opps.length === 0) return undefined;
    const i = (index ?? 1) - 1;
    return opps[Math.max(0, Math.min(i, opps.length - 1))];
}
export function setPendingYieldDeposit(sessionId, deposit) {
    const s = getSession(sessionId);
    if (deposit === null) {
        delete s.pendingYieldDeposit;
    } else {
        s.pendingYieldDeposit = deposit;
    }
}
export function getPendingYieldDeposit(sessionId) {
    return getSession(sessionId).pendingYieldDeposit;
}
export function resetStores() {
    drafts.clear();
    sessions.clear();
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/state.ts