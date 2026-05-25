import { createPublicClient, http } from "viem";
export function makePublicClient(rpcUrl, chainId) {
    const chain = {
        id: chainId,
        name: "celo",
        nativeCurrency: {
            name: "CELO",
            symbol: "CELO",
            decimals: 18
        },
        rpcUrls: {
            default: {
                http: [
                    rpcUrl
                ]
            }
        }
    };
    return createPublicClient({
        chain,
        transport: http(rpcUrl)
    });
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/client.ts