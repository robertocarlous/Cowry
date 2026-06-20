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
let _nonce = null;
const _nonceLock = {
    busy: false
};
async function getNextNonce(publicClient, address) {
    if (_nonce === null) {
        _nonce = await publicClient.getTransactionCount({
            address,
            blockTag: "pending"
        });
    }
    const n = _nonce;
    _nonce += 1;
    return n;
}
export function resetAgentNonce() {
    _nonce = null;
}
export async function agentSendTx(to, data, value = 0n) {
    while(_nonceLock.busy){
        await new Promise((r)=>setTimeout(r, 50));
    }
    _nonceLock.busy = true;
    try {
        const { walletClient, account, publicClient } = getAgentWallet();
        const nonce = await getNextNonce(publicClient, account.address);
        try {
            return await walletClient.sendTransaction({
                account,
                chain: celo,
                to,
                data,
                value,
                nonce
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isNonceError = msg.includes("nonce") || msg.includes("replacement transaction") || msg.includes("already known");
            if (isNonceError) {
                _nonce = null;
                const freshNonce = await getNextNonce(publicClient, account.address);
                return await walletClient.sendTransaction({
                    account,
                    chain: celo,
                    to,
                    data,
                    value,
                    nonce: freshNonce
                });
            }
            throw err;
        }
    } finally{
        _nonceLock.busy = false;
    }
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/agent/wallet.ts