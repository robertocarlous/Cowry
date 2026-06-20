import { Redis } from "@upstash/redis";
import { decryptSecret } from "./crypto.js";
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
function recipientsKey(wallet) {
    return `cowry:recipients:${wallet.toLowerCase()}`;
}
export async function getSavedRecipients(wallet) {
    const redis = getRedis();
    const data = await redis.get(recipientsKey(wallet));
    return data ?? [];
}
export async function findRecipientByNickname(wallet, nickname) {
    const recipients = await getSavedRecipients(wallet);
    const key = nickname.trim().toLowerCase();
    return recipients.find((r)=>r.nickname === key) ?? null;
}
export async function saveRecipient(wallet, recipient) {
    const redis = getRedis();
    const key = recipient.nickname.trim().toLowerCase();
    const recipients = await getSavedRecipients(wallet);
    const next = recipients.filter((r)=>r.nickname !== key);
    next.push({
        ...recipient,
        nickname: key
    });
    await redis.set(recipientsKey(wallet), next);
}
export function decryptAccountIdentifier(recipient) {
    return decryptSecret(recipient.accountIdentifierEnc);
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/remittance/recipients.ts