import { createChainResolutionDeps } from "./chainResolution.js";
import { createUnavailableResolutionDeps } from "./unavailableResolution.js";
export function createResolutionDeps() {
    const rpc = process.env.CELO_RPC_URL?.trim() || process.env.RPC_URL?.trim() || "";
    if (rpc) {
        return createChainResolutionDeps(rpc);
    }
    return createUnavailableResolutionDeps("Celo RPC is not configured for username/group resolution.");
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/deps/createDeps.ts