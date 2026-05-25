import { cowrypayContract } from "../abi/index.js";
import { normalizeUsernameForRegistry } from "../chain/normalizeUsername.js";
function normalizeHandle(handle) {
    return handle.replace(/^@/, "").toLowerCase();
}
export function createUnavailableResolutionDeps(reason) {
    const chainId = Number(process.env.CHAIN_ID || 42220);
    const hint = `${reason} Set CELO_RPC_URL or RPC_URL in the deployment environment.`;
    return {
        mode: "unavailable",
        reason: hint,
        publicClient: null,
        async isWalletRegistered () {
            return false;
        },
        async resolveUsername (handle) {
            const norm = normalizeUsernameForRegistry(handle);
            return {
                ok: false,
                username: norm.ok ? norm.name : normalizeHandle(handle),
                reason: hint
            };
        },
        async resolveGroupByName () {
            return {
                ok: false,
                reason: hint
            };
        },
        async listGroups () {
            return hint;
        },
        async getMeta () {
            return {
                chainId,
                cowryPay: cowrypayContract.address
            };
        },
        async adminCreateGroup () {
            return {
                ok: false,
                reason: hint
            };
        },
        async adminRegisterUsername () {
            return {
                ok: false,
                reason: hint
            };
        }
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/deps/unavailableResolution.ts