import { Redis } from "@upstash/redis";

import { decryptSecret } from "./crypto.js";
import type { SavedRecipient } from "./types.js";

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

function recipientsKey(wallet: string): string {
  return `cowry:recipients:${wallet.toLowerCase()}`;
}

/** All recipients saved by this sender wallet. */
export async function getSavedRecipients(wallet: string): Promise<SavedRecipient[]> {
  const redis = getRedis();
  const data = await redis.get<SavedRecipient[]>(recipientsKey(wallet));
  return data ?? [];
}

/** Case-insensitive lookup by nickname (e.g. "Mom" -> "mom"). */
export async function findRecipientByNickname(
  wallet: string,
  nickname: string,
): Promise<SavedRecipient | null> {
  const recipients = await getSavedRecipients(wallet);
  const key = nickname.trim().toLowerCase();
  return recipients.find((r) => r.nickname === key) ?? null;
}

/** Insert or replace a saved recipient, keyed by nickname. */
export async function saveRecipient(wallet: string, recipient: SavedRecipient): Promise<void> {
  const redis = getRedis();
  const key = recipient.nickname.trim().toLowerCase();
  const recipients = await getSavedRecipients(wallet);
  const next = recipients.filter((r) => r.nickname !== key);
  next.push({ ...recipient, nickname: key });
  await redis.set(recipientsKey(wallet), next);
}

/** Decrypt the real account number / phone number for use with Paycrest. */
export function decryptAccountIdentifier(recipient: SavedRecipient): string {
  return decryptSecret(recipient.accountIdentifierEnc);
}
