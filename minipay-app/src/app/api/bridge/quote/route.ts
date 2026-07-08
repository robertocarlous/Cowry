import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, isAddress } from "viem";
import { celo } from "viem/chains";
import { loadAgentEnv } from "@/lib/loadAgentEnv";
import { getBridgeQuote, formatBridgeSummary } from "@cowry/agent-core/lifi/bridgeClient.js";

loadAgentEnv();

export const runtime = "nodejs";

async function readPreflight(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  needed: bigint,
) {
  const rpc =
    process.env.CELO_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_CELO_RPC_URL?.trim() ||
    "https://forno.celo.org";
  const client = createPublicClient({ chain: celo, transport: http(rpc) });
  const [allowance, balance] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    }),
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
  ]);
  return {
    needsApproval: allowance < needed,
    sufficientBalance: balance >= needed,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress } = body;

  if (!fromChainId || !fromTokenAddress || !fromAmount || !fromAddress || !toChainId || !toTokenAddress || !toAddress) {
    return NextResponse.json(
      { error: "Required: fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress" },
      { status: 400 },
    );
  }

  if (!isAddress(String(fromAddress)) || !isAddress(String(toAddress))) {
    return NextResponse.json({ error: "Invalid sender or recipient address." }, { status: 400 });
  }

  try {
    const params = {
      fromChainId:      Number(fromChainId),
      fromTokenAddress: String(fromTokenAddress),
      fromAmount:       String(fromAmount),
      fromAddress:      fromAddress as `0x${string}`,
      toChainId:        Number(toChainId),
      toTokenAddress:   String(toTokenAddress),
      toAddress:        toAddress as `0x${string}`,
    };

    // Preview at base fee to discover relay cost, then final quote with adjusted fee
    const preview = await getBridgeQuote(params, 0);
    const relayCostUSD = preview.estimate.gasCosts.reduce(
      (s, g) => s + Number(g.amountUSD), 0,
    );
    const quote = await getBridgeQuote(params, relayCostUSD);

    const approvalAddress = quote.estimate.approvalAddress ?? quote.transactionRequest.to;

    let preflight: { needsApproval: boolean; sufficientBalance: boolean } | undefined;
    try {
      preflight = await readPreflight(
        String(fromTokenAddress) as `0x${string}`,
        fromAddress as `0x${string}`,
        approvalAddress as `0x${string}`,
        BigInt(String(fromAmount)),
      );
    } catch {
      // Client will re-check via wallet RPC before executing.
    }

    return NextResponse.json({
      quoteId:            quote.id,
      tool:               quote.tool,
      summary:            formatBridgeSummary(quote),
      fromTokenAddress:   String(fromTokenAddress),
      fromAmount:         String(fromAmount),
      approvalAddress,
      platformFeeUSD:     quote.platformFeeUSD,
      preflight,
      transactionRequest: quote.transactionRequest,
      estimate:           quote.estimate,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
