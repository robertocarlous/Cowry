import { erc20Abi } from "viem";
export async function readErc20Balance(client, token, owner) {
    const v = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [
            owner
        ]
    });
    return v;
}
export async function readErc20Allowance(client, token, owner, spender) {
    const v = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [
            owner,
            spender
        ]
    });
    return v;
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/erc20Reads.ts