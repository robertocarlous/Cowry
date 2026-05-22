import { NextRequest, NextResponse } from "next/server";
import { getBridgeStatus } from "@agent/lifi/bridgeClient.js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const txHash      = searchParams.get("txHash") ?? "";
  const fromChainId = Number(searchParams.get("fromChainId"));
  const toChainId   = Number(searchParams.get("toChainId"));

  if (!txHash || !fromChainId || !toChainId) {
    return NextResponse.json(
      { error: "Required query params: txHash, fromChainId, toChainId" },
      { status: 400 },
    );
  }

  try {
    const status = await getBridgeStatus(txHash, fromChainId, toChainId);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
