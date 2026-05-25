import { createDefaultRegistry } from "../resolvers.js";
import { createChainResolutionDeps } from "./chainResolution.js";
import { createMockResolutionDeps } from "./mockResolution.js";
export function createResolutionDeps() {
    const rpc = process.env.CELO_RPC_URL?.trim() || process.env.RPC_URL?.trim() || "";
    if (rpc) {
        return createChainResolutionDeps(rpc);
    }
    return createMockResolutionDeps(createDefaultRegistry());
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/deps/createDeps.ts