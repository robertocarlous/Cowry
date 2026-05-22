import { NextRequest, NextResponse } from "next/server";
import { getBridgeQuote, formatBridgeSummary } from "@agent/lifi/bridgeClient.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress } = body;

  if (!fromChainId || !fromTokenAddress || !fromAmount || !fromAddress || !toChainId || !toTokenAddress || !toAddress) {
    return NextResponse.json(
      { error: "Required: fromChainId, fromTokenAddress, fromAmount, fromAddress, toChainId, toTokenAddress, toAddress" },
      { status: 400 },
    );
  }

  try {
    const quote = await getBridgeQuote({
      fromChainId:      Number(fromChainId),
      fromTokenAddress: String(fromTokenAddress),
      fromAmount:       String(fromAmount),
      fromAddress:      fromAddress as `0x${string}`,
      toChainId:        Number(toChainId),
      toTokenAddress:   String(toTokenAddress),
      toAddress:        toAddress as `0x${string}`,
    });
    return NextResponse.json({
      quoteId:            quote.id,
      tool:               quote.tool,
      summary:            formatBridgeSummary(quote),
      transactionRequest: quote.transactionRequest,
      estimate:           quote.estimate,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
