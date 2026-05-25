import { createChainResolutionDeps } from "./chainResolution.js";
import { createUnavailableResolutionDeps } from "./unavailableResolution.js";
import type { ResolutionDeps } from "./types.js";

/**
 * If CELO_RPC_URL or RPC_URL is set, uses on-chain UsernameRegistry + GroupRegistry reads.
 * Otherwise returns an explicit unavailable state so deployments never silently
 * fall back to fake usernames/groups.
 */
export function createResolutionDeps(): ResolutionDeps {
  const rpc =
    process.env.CELO_RPC_URL?.trim() || process.env.RPC_URL?.trim() || "";
  if (rpc) {
    return createChainResolutionDeps(rpc);
  }
  return createUnavailableResolutionDeps(
    "Celo RPC is not configured for username/group resolution.",
  );
}
