import { readErc20Allowance, readErc20Balance } from "./erc20Reads.js";
import { USDC_DECIMALS } from "./usdcAmount.js";
export function totalBaseUnitsFromTxPlan(plan) {
    switch(plan.mode){
        case "pay":
            return BigInt(plan.amountBaseUnits);
        case "payGroupEqual":
            return BigInt(plan.amountPerMemberBaseUnits) * BigInt(plan.memberCount);
        case "payMany":
            return plan.items.reduce((s, i)=>s + BigInt(i.amountBaseUnits), 0n);
        case "payGroupSplit":
            return BigInt(plan.totalBaseUnits);
        default:
            throw new Error(`Unhandled plan mode: ${plan.mode}`);
    }
}
export function formatUsdcFromBase(units) {
    const divisor = BigInt(10 ** USDC_DECIMALS);
    const whole = units / divisor;
    const frac = units % divisor;
    const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}
export async function checkUsdcReadiness(client, usdc, owner, sendrPay, required) {
    if (required <= 0n) return {
        ok: true
    };
    const [balance, allowance] = await Promise.all([
        readErc20Balance(client, usdc, owner),
        readErc20Allowance(client, usdc, owner, sendrPay)
    ]);
    if (balance < required) {
        return {
            ok: false,
            reason: "insufficient_balance",
            balance,
            allowance,
            required
        };
    }
    if (allowance < required) {
        return {
            ok: false,
            reason: "insufficient_allowance",
            balance,
            allowance,
            required
        };
    }
    return {
        ok: true
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/usdcReadiness.ts