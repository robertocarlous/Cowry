import OpenAI from "openai";
import { parsedIntentSchema, type ParsedIntent } from "./schemas.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const SYSTEM = `You are Cowry's intent parser. Output ONLY valid JSON matching this shape:
- Send money to someone's bank account / mobile money / cross-border / remittance / abroad — recipient does NOT need a Cowry account or username. ALWAYS use this whenever the message mentions any of: "bank account", "bank", "mobile money", "MoMo", "account number", "phone number", a country name (e.g. Nigeria, Kenya, Ghana, Uganda, Tanzania, Malawi), or a saved nickname like "mom"/"my landlord". Do NOT set recipientNickname to an @username or Cowry handle — if the message ONLY contains an @username/handle with none of the cues above, use CHAT instead:
  {"kind":"remittance","action":"SEND_REMITTANCE","amount":number,"recipientNickname":"string (if user references a saved name like 'mom', 'my landlord' — NOT an @username)","countryHint":"string (country if mentioned, e.g. 'Nigeria')","institutionHint":"string (bank or mobile money name if mentioned, e.g. 'GTBank', 'MTN MoMo')","accountIdentifier":"string (account/phone number if given)"}
- Register name for wallet (user signs tx): {"kind":"admin","action":"REGISTER_USERNAME","username":"lowercase_no_at"}
- Approve token for CowryPay: {"kind":"admin","action":"APPROVE_USDC","amount":number,"token":"USDm or USDC"}
- Help / what can you do: {"kind":"admin","action":"HELP"}
- Show USDC yield vaults / earn / invest / Morpho / APY: {"kind":"earn","action":"LIST_OPPORTUNITIES"}
- Deposit into a vault (pick by number): {"kind":"earn","action":"DEPOSIT_YIELD","amount":number,"vaultIndex":number}
- Deposit (no vault specified): {"kind":"earn","action":"DEPOSIT_YIELD","amount":number,"vaultIndex":1}
- Show yield positions / what am I earning / my Morpho balance: {"kind":"earn","action":"VIEW_POSITIONS"}
- Check balance / how much do I have / my USDm balance / my USDC balance: {"kind":"admin","action":"BALANCE"}
- My transactions / transaction history / recent payments / what did I send: {"kind":"admin","action":"TX_HISTORY"}
- Greetings / general chat / questions about Cowry: {"kind":"admin","action":"CHAT"}

Examples:
- "Send $50 to a bank account in Ghana" → {"kind":"remittance","action":"SEND_REMITTANCE","amount":50,"countryHint":"Ghana"}
- "Send $20 to mobile money in Kenya, 0712345678" → {"kind":"remittance","action":"SEND_REMITTANCE","amount":20,"countryHint":"Kenya","accountIdentifier":"0712345678"}
- "Send 20 USDC to @ada" → {"kind":"admin","action":"CHAT"}  (an @username alone is not a remittance recipient)

Rules: amounts are numbers (user may say dollars or $). Usernames (REGISTER_USERNAME only): a–z 0–9 only, 3–32 chars, no @ in JSON. For earn: vaultIndex is 1-based integer. If a message describes sending money to a person but doesn't fit remittance, classify it as "admin"/"CHAT" rather than inventing an unsupported intent.`;

const CHAT_SYSTEM = `You are Cowry, an AI-powered crypto payment assistant built on Celo.
You help users send money abroad and bridge crypto using natural language.

Cowry capabilities:
• Send to a bank account or mobile money abroad — recipient doesn't need Cowry (remittance): "Send $50 to a bank account in Nigeria"
• Cross-chain: bridge USDC from Ethereum, Base, Arbitrum and more to Celo
• Earn yield: deposit USDC into Morpho vaults
• Check balance and view transactions

When asked about balance or transactions: let the user know you can check their on-chain balance — suggest they type "my balance" or ask them to connect if not connected yet.

Keep responses SHORT (2-3 sentences max), friendly, and helpful. Use markdown bold (**text**) sparingly for key terms. Mention specific Cowry commands when relevant. Never make up transaction data.`;

/** Groq exposes an OpenAI-compatible Chat Completions API. */
export function createGroqClient(): OpenAI | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: GROQ_BASE_URL });
}

/** Parse a user message into a structured intent. */
export async function parseWithLlm(
  client: OpenAI,
  userMessage: string,
  signal?: AbortSignal,
): Promise<ParsedIntent> {
  const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";
  const completion = await client.chat.completions.create(
    {
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user",   content: userMessage },
      ],
      temperature: 0.1,
    },
    { signal },
  );
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { kind: "unknown", rawSummary: "empty model response" };
  let data: unknown;
  try { data = JSON.parse(raw); } catch {
    return { kind: "unknown", rawSummary: "invalid json from model" };
  }
  const parsed = parsedIntentSchema.safeParse(data);
  if (!parsed.success) return { kind: "unknown", rawSummary: parsed.error.message };
  return parsed.data;
}

/** Generate a conversational reply for general chat / unknown intents. */
export async function generateChatReply(
  client: OpenAI,
  userMessage: string,
  context?: { username?: string | null; walletAddress?: string },
  signal?: AbortSignal,
): Promise<string> {
  const model = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";

  const contextNote = context?.username
    ? `\nThe user's Cowry username is @${context.username}.`
    : context?.walletAddress
    ? `\nThe user's wallet: ${context.walletAddress.slice(0, 10)}…`
    : "";

  const completion = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: CHAT_SYSTEM + contextNote },
        { role: "user",   content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 200,
    },
    { signal },
  );
  return completion.choices[0]?.message?.content?.trim() ?? "How can I help you today?";
}
