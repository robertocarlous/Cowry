import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { loadAgentEnv } from "@/lib/loadAgentEnv";
import { executeBridgeForUser } from "@cowry/agent-core/lifi/agentBridge.js";

loadAgentEnv();

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { fromTokenAddress, fromAmount, fromWallet, toChainId, toTokenAddress, toAddress } = body;

  if (!fromTokenAddress || !fromAmount || !fromWallet || !toChainId || !toTokenAddress || !toAddress) {
    return NextResponse.json(
      { error: "Required: fromTokenAddress, fromAmount, fromWallet, toChainId, toTokenAddress, toAddress" },
      { status: 400 },
    );
  }

  if (!isAddress(String(fromWallet)) || !isAddress(String(toAddress))) {
    return NextResponse.json({ error: "Invalid wallet or recipient address." }, { status: 400 });
  }

  console.info("[bridge/execute] request", { fromTokenAddress, fromAmount, fromWallet, toChainId, toTokenAddress, toAddress });

  try {
    const { txHash } = await executeBridgeForUser({
      fromChainId:      42220,
      fromTokenAddress: String(fromTokenAddress),
      fromAmount:       String(fromAmount),
      fromAddress:      fromWallet as `0x${string}`,
      toChainId:        Number(toChainId),
      toTokenAddress:   String(toTokenAddress),
      toAddress:        toAddress as `0x${string}`,
    });

    return NextResponse.json({
      txHash,
      explorerUrl: `https://celoscan.io/tx/${txHash}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bridge/execute] failed", { fromWallet, fromAmount, error: msg });
    const status = msg.includes("not approved") ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
