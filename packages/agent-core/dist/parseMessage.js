import { createGroqClient, parseWithLlm } from "./llm.js";
import { ruleParse } from "./ruleParser.js";
export function createMessageParser(options) {
    const client = options?.llmClient ?? createGroqClient();
    return async (text)=>{
        const ruled = ruleParse(text);
        if (ruled) return ruled;
        if (client) {
            try {
                return await parseWithLlm(client, text);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                    kind: "unknown",
                    rawSummary: msg
                };
            }
        }
        return {
            kind: "unknown",
            rawSummary: "no rule matched and GROQ_API_KEY is not set"
        };
    };
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/parseMessage.ts