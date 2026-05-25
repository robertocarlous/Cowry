import { encodeFunctionData } from "viem";
import { userRegistryContract } from "../abi/index.js";
export function encodeRegisterUsername(name) {
    const data = encodeFunctionData({
        abi: userRegistryContract.abi,
        functionName: "register",
        args: [
            name
        ]
    });
    return {
        to: userRegistryContract.address,
        data,
        value: "0x0",
        description: `UsernameRegistry.register("${name}")`
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/encodeUserRegistry.ts