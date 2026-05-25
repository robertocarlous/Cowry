export async function fetchTxReceiptStatus(client, hash) {
    const receipt = await client.getTransactionReceipt({
        hash
    }).catch(()=>null);
    if (!receipt) {
        const tx = await client.getTransaction({
            hash
        }).catch(()=>null);
        if (!tx) {
            return {
                txHash: hash,
                status: "pending"
            };
        }
        return {
            txHash: hash,
            status: "pending"
        };
    }
    return {
        txHash: hash,
        status: receipt.status === "success" ? "success" : "failed",
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString()
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/txStatus.ts