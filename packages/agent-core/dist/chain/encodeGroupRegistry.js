import { encodeFunctionData } from "viem";
import { groupRegistryContract } from "../abi/index.js";
export function encodeCreateGroup(displayName) {
    const data = encodeFunctionData({
        abi: groupRegistryContract.abi,
        functionName: "createGroup",
        args: [
            displayName.trim()
        ]
    });
    return {
        to: groupRegistryContract.address,
        data,
        value: "0x0",
        description: `GroupRegistry.createGroup("${displayName.trim()}")`
    };
}
export function encodeAddMember(groupId, member) {
    const data = encodeFunctionData({
        abi: groupRegistryContract.abi,
        functionName: "addMember",
        args: [
            groupId,
            member
        ]
    });
    return {
        to: groupRegistryContract.address,
        data,
        value: "0x0",
        description: `GroupRegistry.addMember(${groupId}, ${member})`
    };
}
export function encodeRemoveMember(groupId, member) {
    const data = encodeFunctionData({
        abi: groupRegistryContract.abi,
        functionName: "removeMember",
        args: [
            groupId,
            member
        ]
    });
    return {
        to: groupRegistryContract.address,
        data,
        value: "0x0",
        description: `GroupRegistry.removeMember(${groupId}, ${member})`
    };
}
export function encodeCancelGroup(groupId) {
    const data = encodeFunctionData({
        abi: groupRegistryContract.abi,
        functionName: "cancelGroup",
        args: [
            groupId
        ]
    });
    return {
        to: groupRegistryContract.address,
        data,
        value: "0x0",
        description: `GroupRegistry.cancelGroup(${groupId})`
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/encodeGroupRegistry.ts