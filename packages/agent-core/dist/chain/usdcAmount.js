export const USDC_DECIMALS = 18;
export function usdcBaseUnitsFromHuman(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Amount must be a positive finite number");
    }
    return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/usdcAmount.ts