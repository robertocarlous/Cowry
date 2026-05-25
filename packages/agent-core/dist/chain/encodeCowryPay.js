import { encodeFunctionData } from "viem";
import { cowrypayContract } from "../abi/index.js";
export function encodePay(token, to, amountBaseUnits) {
    const data = encodeFunctionData({
        abi: cowrypayContract.abi,
        functionName: "pay",
        args: [
            token,
            to,
            amountBaseUnits
        ]
    });
    return {
        to: cowrypayContract.address,
        data,
        value: "0x0",
        description: `CowryPay.pay(token=${token}, to=${to}, amount=${amountBaseUnits})`
    };
}
export function encodePayGroupEqual(token, groupId, amountPerMemberBaseUnits) {
    const data = encodeFunctionData({
        abi: cowrypayContract.abi,
        functionName: "payGroupEqual",
        args: [
            token,
            groupId,
            amountPerMemberBaseUnits
        ]
    });
    return {
        to: cowrypayContract.address,
        data,
        value: "0x0",
        description: `CowryPay.payGroupEqual(token=${token}, group=${groupId}, perMember=${amountPerMemberBaseUnits})`
    };
}
export function encodePayGroupSplit(token, groupId, totalAmountBaseUnits) {
    const data = encodeFunctionData({
        abi: cowrypayContract.abi,
        functionName: "payGroupSplit",
        args: [
            token,
            groupId,
            totalAmountBaseUnits
        ]
    });
    return {
        to: cowrypayContract.address,
        data,
        value: "0x0",
        description: `CowryPay.payGroupSplit(token=${token}, group=${groupId}, total=${totalAmountBaseUnits})`
    };
}
export function encodedCallToJson(c) {
    return {
        to: c.to,
        data: c.data,
        value: c.value,
        description: c.description
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/encodeCowryPay.ts