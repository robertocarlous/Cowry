import { encodeFunctionData, erc20Abi } from "viem";
export function encodeErc20Approve(usdc, spender, amount) {
    const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [
            spender,
            amount
        ]
    });
    return {
        to: usdc,
        data,
        value: "0x0",
        description: `USDC.approve(CowryPay, ${amount.toString()} base units)`
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/encodeErc20.ts