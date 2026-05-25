import { cowrypayContract } from "../abi/index.js";
import { normalizeUsernameForRegistry } from "../chain/normalizeUsername.js";
import type { ResolutionDeps, TxMeta } from "./types.js";

function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

export function createUnavailableResolutionDeps(reason: string): ResolutionDeps {
  const chainId = Number(process.env.CHAIN_ID || 42220);
  const hint = `${reason} Set CELO_RPC_URL or RPC_URL in the deployment environment.`;

  return {
    mode: "unavailable",
    reason: hint,
    publicClient: null,
    async isWalletRegistered() {
      return false;
    },
    async resolveUsername(handle: string) {
      const norm = normalizeUsernameForRegistry(handle);
      return {
        ok: false,
        username: norm.ok ? norm.name : normalizeHandle(handle),
        reason: hint,
      };
    },
    async resolveGroupByName() {
      return { ok: false, reason: hint };
    },
    async listGroups() {
      return hint;
    },
    async getMeta(): Promise<TxMeta> {
      return {
        chainId,
        cowryPay: cowrypayContract.address,
      };
    },
    async adminCreateGroup() {
      return { ok: false, reason: hint };
    },
    async adminRegisterUsername() {
      return { ok: false, reason: hint };
    },
  };
}
