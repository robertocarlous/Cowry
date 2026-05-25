import userRegistry from "./userRegistry.json" with {
    type: "json"
};
import groupRegistry from "./groupRegistry.json" with {
    type: "json"
};
import CowryPay from "./CowryPay.json" with {
    type: "json"
};
function contractAddress(envKey, fallback) {
    const v = process.env[envKey]?.trim();
    if (v && /^0x[a-fA-F0-9]{40}$/.test(v)) return v;
    return fallback;
}
const DEFAULT_USERNAME_REGISTRY = "0x3b89d7b4997db5645db2829523ed3e79e55a0f02";
const DEFAULT_GROUP_REGISTRY = "0xee7ee3852663917a12ef95852a9fc4e092e45a31";
const DEFAULT_COWRYPAY = "0x2b0d2f1dec9ab3e06668145d21ed17715e288350";
export const userRegistryContract = {
    abi: userRegistry,
    address: contractAddress("USERNAME_REGISTRY_ADDRESS", DEFAULT_USERNAME_REGISTRY)
};
export const groupRegistryContract = {
    abi: groupRegistry,
    address: contractAddress("GROUP_REGISTRY_ADDRESS", DEFAULT_GROUP_REGISTRY)
};
export const cowrypayContract = {
    abi: CowryPay,
    address: contractAddress("COWRYPAY_ADDRESS", DEFAULT_COWRYPAY)
};


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/abi/index.ts