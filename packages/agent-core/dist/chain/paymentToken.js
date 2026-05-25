import { readErc20Balance } from "./erc20Reads.js";
import { DEFAULT_TOKEN, TOKENS, fromBaseUnits, getTokenBySymbol, toBaseUnits } from "./tokenConfig.js";
export async function resolvePaymentToken(opts) {
    if (opts.explicitSymbol) {
        return {
            token: getTokenBySymbol(opts.explicitSymbol)
        };
    }
    if (!opts.wallet || !opts.client) {
        return {
            token: DEFAULT_TOKEN
        };
    }
    const entries = await Promise.all(Object.values(TOKENS).map(async (token)=>{
        const balance = await readErc20Balance(opts.client, token.address, opts.wallet);
        const human = Number(fromBaseUnits(balance, token.decimals));
        const required = toBaseUnits(opts.amountHuman, token.decimals);
        return {
            token,
            balance,
            human,
            sufficient: balance >= required
        };
    }));
    const sufficient = entries.filter((e)=>e.sufficient);
    if (sufficient.length === 1) {
        return {
            token: sufficient[0].token
        };
    }
    if (sufficient.length > 1) {
        const amt = opts.amountHuman.toLocaleString();
        const lines = sufficient.map((e)=>`• **${e.human.toLocaleString()} ${e.token.symbol}**`).join("\n");
        return {
            clarify: `You have enough for **${amt}** in more than one token:\n${lines}\n\n` + `Specify which to send, e.g. **send ${amt} USDC to @name** or **send ${amt} USDm to @name**.`
        };
    }
    entries.sort((a, b)=>b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0);
    return {
        token: entries[0]?.token ?? DEFAULT_TOKEN
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/chain/paymentToken.ts