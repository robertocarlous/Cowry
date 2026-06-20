"use client";
import { decodeErrorResult, encodeFunctionData, zeroAddress } from "viem";
import { getPublicClient, sendTransaction } from "./wallet";

export const USERNAME_REGISTRY = "0x1d8050eda109364c15db4c2c5a172128eaeabd25" as const;

const REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs:  [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    name: "getAddressByName",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  { name: "NameTaken",          type: "error", inputs: [] },
  { name: "AlreadyRegistered",  type: "error", inputs: [] },
  { name: "InvalidName",        type: "error", inputs: [] },
] as const;

// ── Registration ──────────────────────────────────────────────────────────────

/** Validates a username string. Returns an error message or null if valid. */
export function validateUsername(raw: string): string | null {
  const name = raw.toLowerCase().trim();
  if (name.length < 3)  return "At least 3 characters";
  if (name.length > 32) return "Max 32 characters";
  if (!/^[a-z0-9]+$/.test(name)) return "Only lowercase letters (a–z) and numbers (0–9)";
  return null;
}

/** Wallet that owns `name`, or null if the name is unclaimed. */
export async function getUsernameOwner(name: string): Promise<`0x${string}` | null> {
  const client = getPublicClient();
  const owner = await client.readContract({
    address:      USERNAME_REGISTRY,
    abi:          REGISTRY_ABI,
    functionName: "getAddressByName",
    args:         [name.toLowerCase().trim()],
  });
  if (!owner || owner === zeroAddress) return null;
  return owner as `0x${string}`;
}

/** Pre-flight check before signing register(). Returns a user-facing message or null if OK. */
export async function checkUsernameAvailability(
  name: string,
  wallet: `0x${string}`,
): Promise<string | null> {
  const owner = await getUsernameOwner(name);
  if (owner && owner.toLowerCase() !== wallet.toLowerCase()) {
    return `@${name.toLowerCase().trim()} is already taken. Try another username.`;
  }
  return null;
}

const REVERT_SELECTOR_MESSAGES: Record<string, string> = {
  "0x9e4b2685": "@{name} is already taken by another wallet. Try a different username.",
  "0x3a81d6fc": "This wallet already has a username. Tap \"Recover your username\" below.",
  "0x430f13b3": "Invalid username. Use 3–32 characters (letters a–z and numbers 0–9 only).",
};

function extractRevertData(error: unknown): `0x${string}` | null {
  const seen = new Set<unknown>();
  let cur: unknown = error;

  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as Record<string, unknown>;

    if (typeof o.data === "string" && o.data.startsWith("0x")) {
      return o.data as `0x${string}`;
    }

    const msg = [o.message, o.details, o.shortMessage]
      .filter((x) => typeof x === "string")
      .join(" ");
    const match = msg.match(/data["']?\s*[:=]\s*["']?(0x[a-fA-F0-9]+)/);
    if (match) return match[1] as `0x${string}`;

    cur = o.cause;
  }

  if (error instanceof Error) {
    const match = error.message.match(/data["']?\s*[:=]\s*["']?(0x[a-fA-F0-9]+)/);
    if (match) return match[1] as `0x${string}`;
  }

  return null;
}

/** Turn viem / wallet / UsernameRegistry errors into a short user-facing message. */
export function formatRegistrationError(error: unknown, username?: string): string {
  const data = extractRevertData(error);
  const name = username?.toLowerCase().trim();

  if (data) {
    const selector = data.slice(0, 10).toLowerCase();
    const template = REVERT_SELECTOR_MESSAGES[selector];
    if (template) {
      return template.replace("{name}", name ?? "This username");
    }

    try {
      const decoded = decodeErrorResult({ abi: REGISTRY_ABI, data });
      switch (decoded.errorName) {
        case "NameTaken":
          return name
            ? `@${name} is already taken by another wallet. Try a different username.`
            : "That username is already taken. Try a different one.";
        case "AlreadyRegistered":
          return "This wallet already has a username. Tap \"Recover your username\" below.";
        case "InvalidName":
          return "Invalid username. Use 3–32 characters (letters a–z and numbers 0–9 only).";
      }
    } catch {
      // fall through
    }
  }

  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected")) {
    return "Transaction cancelled.";
  }
  if (lower.includes("insufficient funds")) {
    return "Not enough balance to pay for gas. Add a little CELO or USDm in MiniPay.";
  }

  return "Could not register username. Please try again.";
}

/** Encodes and broadcasts a UsernameRegistry.register(name) transaction. */
export async function registerUsername(name: string): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi:          REGISTRY_ABI,
    functionName: "register",
    args:         [name.toLowerCase().trim()],
  });
  return sendTransaction({ to: USERNAME_REGISTRY, data, value: "0x0" });
}
