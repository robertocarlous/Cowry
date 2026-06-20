import { z } from "zod";
export const paymentActionSchema = z.enum([
    "SEND_SINGLE",
    "SPLIT_EQUAL",
    "SEND_TO_GROUP",
    "GROUP_SPLIT_TOTAL"
]);
export const adminActionSchema = z.enum([
    "REGISTER_USERNAME",
    "APPROVE_USDC",
    "CREATE_GROUP",
    "ADD_MEMBERS",
    "REMOVE_MEMBERS",
    "CANCEL_GROUP",
    "LIST_GROUPS",
    "HELP",
    "BALANCE",
    "TX_HISTORY",
    "CHAT"
]);
export const earnActionSchema = z.enum([
    "LIST_OPPORTUNITIES",
    "DEPOSIT_YIELD",
    "VIEW_POSITIONS"
]);
export const parsedIntentSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("payment"),
        action: paymentActionSchema,
        amount: z.number().positive().optional(),
        perRecipientAmount: z.number().positive().optional(),
        recipient: z.string().optional(),
        splitCount: z.number().int().positive().optional(),
        members: z.array(z.string()).optional(),
        groupName: z.string().optional(),
        note: z.string().optional(),
        token: z.string().optional()
    }),
    z.object({
        kind: z.literal("admin"),
        action: adminActionSchema,
        username: z.string().optional(),
        amount: z.number().positive().optional(),
        token: z.string().optional(),
        groupName: z.string().optional(),
        groupId: z.union([
            z.string(),
            z.number()
        ]).optional(),
        members: z.array(z.string()).optional()
    }),
    z.object({
        kind: z.literal("earn"),
        action: earnActionSchema,
        amount: z.number().positive().optional(),
        vaultIndex: z.number().int().positive().optional(),
        minApy: z.number().optional(),
        chainName: z.string().optional(),
        token: z.string().optional()
    }),
    z.object({
        kind: z.literal("remittance"),
        action: z.literal("SEND_REMITTANCE"),
        amount: z.number().positive().optional(),
        recipientNickname: z.string().optional(),
        countryHint: z.string().optional(),
        institutionHint: z.string().optional(),
        accountIdentifier: z.string().optional(),
        token: z.string().optional()
    }),
    z.object({
        kind: z.literal("onramp"),
        action: z.literal("BUY_CRYPTO"),
        fiatAmount: z.number().positive().optional(),
        countryHint: z.string().optional(),
        institutionHint: z.string().optional(),
        accountIdentifier: z.string().optional()
    }),
    z.object({
        kind: z.literal("unknown"),
        rawSummary: z.string()
    })
]);
export const draftTxPlanSchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("pay"),
        token: z.string(),
        to: z.string(),
        amountHuman: z.number(),
        amountBaseUnits: z.string()
    }),
    z.object({
        mode: z.literal("payGroupEqual"),
        token: z.string(),
        groupId: z.string(),
        amountPerMemberHuman: z.number(),
        amountPerMemberBaseUnits: z.string(),
        memberCount: z.number()
    }),
    z.object({
        mode: z.literal("payMany"),
        token: z.string(),
        items: z.array(z.object({
            to: z.string(),
            amountHuman: z.number(),
            amountBaseUnits: z.string()
        }))
    }),
    z.object({
        mode: z.literal("payGroupSplit"),
        token: z.string(),
        groupId: z.string(),
        totalHuman: z.number(),
        totalBaseUnits: z.string(),
        memberCount: z.number()
    })
]);
export const draftRecordSchema = z.object({
    draftId: z.string(),
    sessionId: z.string(),
    createdAt: z.number(),
    action: paymentActionSchema,
    recipients: z.array(z.object({
        username: z.string(),
        address: z.string(),
        amount: z.number()
    })),
    totalAmount: z.number(),
    preview: z.string(),
    txPlan: draftTxPlanSchema
});


//# sourceURL=/home/simze/web3-project/SendPay/packages/agent-core/src/schemas.ts