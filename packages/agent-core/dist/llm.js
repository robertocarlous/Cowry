import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parsedIntentSchema } from "./schemas.js";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const SYSTEM = `You are Cowry's intent parser. Output ONLY valid JSON matching this shape:
- Buy / purchase / top up USDC with fiat currency (on-ramp) — user wants to deposit local fiat and receive USDC in their wallet. Use whenever the message mentions: "buy", "purchase", "top up", "add funds", "on-ramp", combined with a fiat currency or country name:
  {"kind":"onramp","action":"BUY_CRYPTO","fiatAmount":number,"countryHint":"string (e.g. 'Nigeria', 'NGN')","institutionHint":"string (bank name if mentioned)","accountIdentifier":"string (account number if given)"}
- Send money to someone's bank account / mobile money / cross-border / remittance / abroad — recipient does NOT need a Cowry account or username. ALWAYS use this whenever the message mentions any of: "bank account", "bank", "mobile money", "MoMo", "account number", "phone number", a country name (e.g. Nigeria, Kenya, Uganda, Tanzania, Malawi), or a saved nickname like "mom"/"my landlord". Do NOT set recipientNickname to an @username or Cowry handle — if the message ONLY contains an @username/handle with none of the cues above, use CHAT instead:
  {"kind":"remittance","action":"SEND_REMITTANCE","amount":number,"recipientNickname":"string (if user references a saved name like 'mom', 'my landlord' — NOT an @username)","countryHint":"string (country if mentioned, e.g. 'Nigeria')","institutionHint":"string (bank or mobile money name if mentioned, e.g. 'GTBank', 'MTN MoMo')","accountIdentifier":"string (account/phone number if given)","token":"USDC or USDT — only if the user explicitly names one, otherwise omit"}
- Approve token for CowryPay: {"kind":"admin","action":"APPROVE_USDC","amount":number,"token":"USDm, USDC, or USDT"}
- Help / what can you do: {"kind":"admin","action":"HELP"}
- Check balance / how much do I have / my USDm balance / my USDC balance: {"kind":"admin","action":"BALANCE"}
- My transactions / transaction history / recent payments / what did I send: {"kind":"admin","action":"TX_HISTORY"}
- Greetings / general chat / questions about Cowry: {"kind":"admin","action":"CHAT"}

Examples:
- "Buy 10000 NGN worth of USDC" → {"kind":"onramp","action":"BUY_CRYPTO","fiatAmount":10000,"countryHint":"NGN"}
- "I want to top up with Naira" → {"kind":"onramp","action":"BUY_CRYPTO","countryHint":"Nigeria"}
- "Send $50 to a bank account in Tanzania" → {"kind":"remittance","action":"SEND_REMITTANCE","amount":50,"countryHint":"Tanzania"}
- "Send $20 to mobile money in Kenya, 0712345678" → {"kind":"remittance","action":"SEND_REMITTANCE","amount":20,"countryHint":"Kenya","accountIdentifier":"0712345678"}
- "Send 20 USDC to @ada" → {"kind":"admin","action":"CHAT"}  (an @username alone is not a remittance recipient)
- "Send 50 USDT to a bank account in Nigeria" → {"kind":"remittance","action":"SEND_REMITTANCE","amount":50,"countryHint":"Nigeria","token":"USDT"}

Rules: amounts are numbers (user may say dollars or $). If a message describes sending money to a person but doesn't fit remittance, classify it as "admin"/"CHAT" rather than inventing an unsupported intent.`;
const CHAT_SYSTEM = `You are Cowry, an AI-powered crypto payment assistant built on Celo.
You help users send money abroad and bridge crypto using natural language.

Cowry capabilities:
• Buy USDC with local currency (on-ramp) — deposit Naira or Shillings directly to your wallet: "Buy 10000 NGN worth of USDC"
• Send to a bank account or mobile money abroad — recipient doesn't need Cowry (remittance): "Send $50 to a bank account in Nigeria"
• Cross-chain: send USDC or USDm from Celo to USDC on Ethereum, Base, Arbitrum and more
• Check balance and view transactions

When asked about balance or transactions: let the user know you can check their on-chain balance — suggest they type "my balance" or ask them to connect if not connected yet.

Keep responses SHORT (2-3 sentences max), friendly, and helpful, written as plain conversational text. Do not use markdown formatting of any kind — no headers (#), no bold (**text**), no bullet points or numbered lists. Mention specific Cowry commands in plain words when relevant. Never make up transaction data.`;
export function createGroqClient() {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) return null;
    return new OpenAI({
        apiKey: key,
        baseURL: GROQ_BASE_URL
    });
}
function createAnthropicClient() {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;
    return new Anthropic({
        apiKey: key
    });
}
export async function parseWithLlm(client, userMessage, signal) {
    const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";
    const completion = await client.chat.completions.create({
        model,
        response_format: {
            type: "json_object"
        },
        messages: [
            {
                role: "system",
                content: SYSTEM
            },
            {
                role: "user",
                content: userMessage
            }
        ],
        temperature: 0.1
    }, {
        signal
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return {
        kind: "unknown",
        rawSummary: "empty model response"
    };
    let data;
    try {
        data = JSON.parse(raw);
    } catch  {
        return {
            kind: "unknown",
            rawSummary: "invalid json from model"
        };
    }
    const parsed = parsedIntentSchema.safeParse(data);
    if (!parsed.success) return {
        kind: "unknown",
        rawSummary: parsed.error.message
    };
    return parsed.data;
}
const institutionResolutionSchema = z.object({
    index: z.number().int().nullable()
});
function institutionResolutionPrompt(institutions) {
    const list = institutions.map((inst, i)=>`${i}. ${inst.name}`).join("\n");
    return `You match a user's free-text bank or mobile-money provider name against a fixed numbered list. The user may use abbreviations, slang, or typos (e.g. "momo" or "MTN" for "MTN Mobile Money", "GTB" for "GTBank"). Pick the SINGLE best-matching index. If nothing is a confident match, or the text could plausibly mean more than one entry, return null — do not guess. Respond with ONLY JSON: {"index": <number or null>}.

List:
${list}`;
}
function parseIndexResponse(raw, institutions) {
    if (!raw) return null;
    let data;
    try {
        data = JSON.parse(raw);
    } catch  {
        const match = raw.match(/\{[^}]*\}/);
        if (!match) return null;
        try {
            data = JSON.parse(match[0]);
        } catch  {
            return null;
        }
    }
    const parsed = institutionResolutionSchema.safeParse(data);
    if (!parsed.success || parsed.data.index == null) return null;
    return institutions[parsed.data.index] ?? null;
}
async function resolveInstitutionWithGroq(query, institutions, signal) {
    const client = createGroqClient();
    if (!client) return null;
    const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";
    try {
        const completion = await client.chat.completions.create({
            model,
            response_format: {
                type: "json_object"
            },
            messages: [
                {
                    role: "system",
                    content: institutionResolutionPrompt(institutions)
                },
                {
                    role: "user",
                    content: query
                }
            ],
            temperature: 0
        }, {
            signal
        });
        return parseIndexResponse(completion.choices[0]?.message?.content, institutions);
    } catch  {
        return null;
    }
}
async function resolveInstitutionWithClaude(query, institutions, signal) {
    const client = createAnthropicClient();
    if (!client) return null;
    const model = process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-haiku-4-5-20251001";
    try {
        const msg = await client.messages.create({
            model,
            max_tokens: 50,
            system: institutionResolutionPrompt(institutions),
            messages: [
                {
                    role: "user",
                    content: query
                }
            ]
        }, {
            signal
        });
        const block = msg.content.find((b)=>b.type === "text");
        return parseIndexResponse(block?.text, institutions);
    } catch  {
        return null;
    }
}
export async function resolveInstitutionWithLlm(query, institutions, signal) {
    if (institutions.length === 0) return null;
    const groqMatch = await resolveInstitutionWithGroq(query, institutions, signal);
    if (groqMatch) return groqMatch;
    return resolveInstitutionWithClaude(query, institutions, signal);
}
export async function generateChatReply(userMessage, context, signal) {
    const contextNote = context?.username ? `\nThe user's Cowry username is @${context.username}.` : context?.walletAddress ? `\nThe user's wallet: ${context.walletAddress.slice(0, 10)}…` : "";
    const system = CHAT_SYSTEM + contextNote;
    const groq = createGroqClient();
    if (groq) {
        try {
            const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";
            const completion = await groq.chat.completions.create({
                model,
                messages: [
                    {
                        role: "system",
                        content: system
                    },
                    {
                        role: "user",
                        content: userMessage
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            }, {
                signal
            });
            const reply = completion.choices[0]?.message?.content?.trim();
            if (reply) return reply;
        } catch  {}
    }
    const anthropic = createAnthropicClient();
    if (anthropic) {
        const model = process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-haiku-4-5-20251001";
        const msg = await anthropic.messages.create({
            model,
            max_tokens: 200,
            system,
            messages: [
                {
                    role: "user",
                    content: userMessage
                }
            ]
        }, {
            signal
        });
        const block = msg.content.find((b)=>b.type === "text");
        if (block?.text?.trim()) return block.text.trim();
    }
    return "How can I help you today?";
}


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/llm.ts