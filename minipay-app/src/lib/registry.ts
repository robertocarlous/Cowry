"use client";
import { encodeFunctionData } from "viem";
import { getPublicClient, sendTransaction } from "./wallet";

export const USERNAME_REGISTRY = "0x3b89d7b4997db5645db2829523ed3e79e55a0f02" as const;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
    name: "NameRegistered",
    type: "event",
    inputs: [
      { indexed: true,  name: "owner",    type: "address" },
      { indexed: true,  name: "nameHash", type: "bytes32" },
      { indexed: false, name: "name",     type: "string"  },
    ],
  },
] as const;

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

// ── On-chain checks ───────────────────────────────────────────────────────────

/** Returns true if this address has already claimed a username on-chain. */
export async function isRegisteredOnChain(address: `0x${string}`): Promise<boolean> {
  try {
    const client = getPublicClient();
    const hash = await client.readContract({
      address: USERNAME_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getNameHashByAddress",
      args: [address],
    });
    return (hash as string) !== ZERO_HASH;
  } catch {
    return false;
  }
}

/**
 * Scan NameRegistered events to get the actual username string for an address.
 * Scans in a shrinking window to handle RPC range limits.
 */
export async function getUsernameFromChain(address: `0x${string}`): Promise<string | null> {
  try {
    const client = getPublicClient();
    const latest = await client.getBlockNumber();

    // Try progressively smaller windows (some RPCs cap eth_getLogs range)
    const windows = [100_000n, 50_000n, 10_000n, 2_000n];
    for (const window of windows) {
      const fromBlock = latest > window ? latest - window : 0n;
      try {
        const logs = await client.getLogs({
          address: USERNAME_REGISTRY,
          event:   REGISTRY_ABI[2],
          args:    { owner: address },
          fromBlock,
          toBlock: "latest",
        });
        if (logs.length > 0) {
          const name = (logs[logs.length - 1].args as { name?: string }).name;
          return name ?? null;
        }
      } catch {
        // Try smaller window
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
export async function resolveUsername(address: `0x${string}`): Promise<{
  registered: boolean;
  username: string | null;
}> {
  // Fast path: cached locally
  const cached = getCachedUsername(address);

  // Always verify on-chain
  const registered = await isRegisteredOnChain(address);

  if (!registered) {
    return { registered: false, username: null };
  }

  if (cached) {
    return { registered: true, username: cached };
  }

  // Registered but no local cache — scan events (new device / cleared storage)
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

/** Encodes and broadcasts a UsernameRegistry.register(name) transaction. */
export async function registerUsername(name: string): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi:          REGISTRY_ABI,
    functionName: "register",
    args:         [name.toLowerCase().trim()],
  });
  return sendTransaction({ to: USERNAME_REGISTRY, data, value: "0x0" });
}
