import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
let _wallet = null;
export function tryGetAgentWallet() {
    try {
        return getAgentWallet();
    } catch  {
        return null;
    }
}
export function getAgentWallet() {
    if (_wallet) return _wallet;
    const raw = process.env.AGENT_PRIVATE_KEY;
    if (!raw || !raw.startsWith("0x")) {
        throw new Error("AGENT_PRIVATE_KEY must be set in .env (0x-prefixed hex private key)");
    }
    const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
    const account = privateKeyToAccount(raw);
    const wallet = {
        account,
        address: account.address,
        walletClient: createWalletClient({
            account,
            chain: celo,
            transport: http(rpcUrl)
        }),
        publicClient: createPublicClient({
            chain: celo,
            transport: http(rpcUrl)
        })
    };
    _wallet = wallet;
    return wallet;
}
export async function agentSendTx(to, data, value = 0n) {
    const { walletClient, account } = getAgentWallet();
    return walletClient.sendTransaction({
        account,
        chain: celo,
        to,
        data,
        value
    });
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/agent/wallet.ts