import { Redis } from "@upstash/redis";
let redisClient = null;
function getRedis() {
    if (redisClient) return redisClient;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars are not set");
    }
    redisClient = new Redis({
        url,
        token
    });
    return redisClient;
}
const TTL_SECONDS = 60 * 60 * 24;
function sessionKey(sessionId) {
    return `cowry:session:${sessionId}`;
}
function draftKey(draftId) {
    return `cowry:draft:${draftId}`;
}
async function getSession(sessionId) {
    const s = await getRedis().get(sessionKey(sessionId));
    return s ?? {
        pendingDraftId: null
    };
}
async function saveSession(sessionId, s) {
    await getRedis().set(sessionKey(sessionId), s, {
        ex: TTL_SECONDS
    });
}
export async function setPendingDraft(sessionId, draftId) {
    const s = await getSession(sessionId);
    s.pendingDraftId = draftId;
    await saveSession(sessionId, s);
}
export async function getPendingDraft(sessionId) {
    const s = await getSession(sessionId);
    if (!s.pendingDraftId) return null;
    return getDraft(s.pendingDraftId);
}
export async function saveDraft(draft) {
    await getRedis().set(draftKey(draft.draftId), draft, {
        ex: TTL_SECONDS
    });
}
export async function getDraft(draftId) {
    const d = await getRedis().get(draftKey(draftId));
    return d ?? null;
}
export async function clearDraft(draftId) {
    await getRedis().del(draftKey(draftId));
}
export async function setEarnOpportunities(sessionId, opps) {
    const s = await getSession(sessionId);
    s.earnOpportunities = opps;
    await saveSession(sessionId, s);
}
export async function getEarnOpportunity(sessionId, index) {
    const opps = (await getSession(sessionId)).earnOpportunities;
    if (!opps || opps.length === 0) return undefined;
    const i = (index ?? 1) - 1;
    return opps[Math.max(0, Math.min(i, opps.length - 1))];
}
export async function setPendingYieldDeposit(sessionId, deposit) {
    const s = await getSession(sessionId);
    if (deposit === null) {
        delete s.pendingYieldDeposit;
    } else {
        s.pendingYieldDeposit = deposit;
    }
    await saveSession(sessionId, s);
}
export async function getPendingYieldDeposit(sessionId) {
    return (await getSession(sessionId)).pendingYieldDeposit;
}
export async function setPendingGroupMembers(sessionId, members) {
    const s = await getSession(sessionId);
    if (members === null) {
        delete s.pendingGroupMembers;
    } else {
        s.pendingGroupMembers = members;
    }
    await saveSession(sessionId, s);
}
export async function getPendingGroupMembers(sessionId) {
    return (await getSession(sessionId)).pendingGroupMembers ?? null;
}
export async function setPendingRemittance(sessionId, remittance) {
    const s = await getSession(sessionId);
    if (remittance === null) {
        delete s.pendingRemittance;
    } else {
        s.pendingRemittance = remittance;
    }
    await saveSession(sessionId, s);
}
export async function getPendingRemittance(sessionId) {
    return (await getSession(sessionId)).pendingRemittance;
}
export async function setPendingRemittanceQuote(sessionId, quote) {
    const s = await getSession(sessionId);
    if (quote === null) {
        delete s.pendingRemittanceQuote;
    } else {
        s.pendingRemittanceQuote = quote;
    }
    await saveSession(sessionId, s);
}
export async function getPendingRemittanceQuote(sessionId) {
    return (await getSession(sessionId)).pendingRemittanceQuote;
}
export async function setPendingOnRamp(sessionId, onramp) {
    const s = await getSession(sessionId);
    if (onramp === null) delete s.pendingOnRamp;
    else s.pendingOnRamp = onramp;
    await saveSession(sessionId, s);
}
export async function getPendingOnRamp(sessionId) {
    return (await getSession(sessionId)).pendingOnRamp;
}
export async function setPendingOnRampOrder(sessionId, order) {
    const s = await getSession(sessionId);
    if (order === null) delete s.pendingOnRampOrder;
    else s.pendingOnRampOrder = order;
    await saveSession(sessionId, s);
}
export async function getPendingOnRampOrder(sessionId) {
    return (await getSession(sessionId)).pendingOnRampOrder;
}
export async function setOnRampOrderSession(orderId, sessionId) {
    await getRedis().set(`cowry:onramp:order:${orderId}`, sessionId, {
        ex: TTL_SECONDS
    });
}
export async function getOnRampOrderSession(orderId) {
    return getRedis().get(`cowry:onramp:order:${orderId}`);
}
export async function setOnRampOrderSettled(orderId, amountPaid) {
    await getRedis().set(`cowry:onramp:settled:${orderId}`, amountPaid, {
        ex: TTL_SECONDS
    });
}
export async function getOnRampOrderSettled(orderId) {
    return getRedis().get(`cowry:onramp:settled:${orderId}`);
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/state.ts