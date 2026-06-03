"use client";
import { decodeErrorResult, encodeFunctionData, zeroAddress } from "viem";
import { getPublicClient, sendTransaction, requireProvider } from "./wallet";

export const USERNAME_REGISTRY = "0x1d8050eda109364c15db4c2c5a172128eaeabd25" as const;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * eth_call that prefers the MiniPay injected provider over our own public RPC.
 * This avoids forno.celo.org being unreachable in server/test environments.
 */
async function registryCall(
  to: `0x${string}`,
  data: `0x${string}`,
): Promise<string> {
  // Try injected provider first (MiniPay — always available in-app)
  try {
    const provider = requireProvider();
    const result = await provider.request({
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }) as string;
    return result ?? "0x";
  } catch {
    // Fall back to our public client (forno.celo.org or NEXT_PUBLIC_CELO_RPC_URL)
    const client = getPublicClient();
    const result = await client.call({ to, data });
    return result.data ?? "0x";
  }
}

const REGISTRY_ABI = [
  {
    name: "getNameHashByAddress",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }],
    outputs: [{ name: "",      type: "bytes32"  }],
  },
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

const NAME_REGISTERED_EVENT = {
  name: "NameRegistered",
  type: "event",
  inputs: [
    { indexed: true,  name: "owner",    type: "address" },
    { indexed: true,  name: "nameHash", type: "bytes32" },
    { indexed: false, name: "name",     type: "string"  },
  ],
} as const;

// ── localStorage cache ────────────────────────────────────────────────────────

function cacheKey(address: string) {
  return `cowry:username:${address.toLowerCase()}`;
}

export function getCachedUsername(address: string): string | null {
  try { return localStorage.getItem(cacheKey(address)); } catch { return null; }
}

export function setCachedUsername(address: string, username: string) {
  try { localStorage.setItem(cacheKey(address), username); } catch { /* ignore */ }
}

export function clearCachedUsername(address: string) {
  try { localStorage.removeItem(cacheKey(address)); } catch { /* ignore */ }
}

// ── On-chain checks ───────────────────────────────────────────────────────────

/** Returns true if this address has already claimed a username on-chain. */
export async function isRegisteredOnChain(address: `0x${string}`): Promise<boolean> {
  try {
    const data = encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: "getNameHashByAddress",
      args: [address],
    });
    const raw = await registryCall(USERNAME_REGISTRY, data);
    // raw is a 32-byte hex — compare to zero hash
    return raw !== ZERO_HASH && raw !== "0x" && raw !== "0x0";
  } catch {
    return false;
  }
}

/**
 * Scan NameRegistered events to get the actual username string for an address.
 * First confirms the wallet is registered, then scans progressively from the
 * widest useful range down to smaller windows to handle RPC range limits.
 */
export async function getUsernameFromChain(address: `0x${string}`): Promise<string | null> {
  try {
    const data = encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: "getNameHashByAddress",
      args: [address],
    });
    const nameHash = await registryCall(USERNAME_REGISTRY, data);
    if (nameHash === ZERO_HASH || nameHash === "0x" || nameHash === "0x0") return null;

    // For event log scanning we still need the public client (getLogs)
    const client = getPublicClient();
    let latest = 0n;
    try {
      latest = await client.getBlockNumber();
    } catch {
      latest = 0n;
    }

    const windows = [latest, 500_000n, 100_000n, 50_000n, 10_000n, 2_000n];
    const tried = new Set<string>();
    for (const window of windows) {
      const fromBlock = latest > window ? latest - window : 0n;
      const key = fromBlock.toString();
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        const logs = await client.getLogs({
          address: USERNAME_REGISTRY,
          event:   NAME_REGISTERED_EVENT,
          args:    { owner: address },
          fromBlock,
          toBlock: "latest",
        });
        if (logs.length > 0) {
          const name = (logs[logs.length - 1].args as { name?: string }).name;
          return name ?? null;
        }
      } catch {
        // Try a smaller window next.
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Full username resolution for an address.
 * 1. Check localStorage (instant)
 * 2. Verify on-chain registration status
 * 3. If registered but no cached name, scan events
 */
/** Quick gate: one contract read — used on /app load. */
export async function isWalletRegistered(address: `0x${string}`): Promise<boolean> {
  return isRegisteredOnChain(address);
}

/**
 * Full username resolution. Prefer {@link isWalletRegistered} + cache on load;
 * use this when you need the name string and can wait for event scans.
 */
export async function resolveUsername(address: `0x${string}`): Promise<{
  registered: boolean;
  username: string | null;
}> {
  const cached = getCachedUsername(address);
  const registered = await isRegisteredOnChain(address);

  if (!registered) {
    return { registered: false, username: null };
  }

  if (cached) {
    return { registered: true, username: cached };
  }

  const username = await getUsernameFromChain(address);
  if (username) {
    setCachedUsername(address, username);
  }

  return { registered: true, username };
}

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
