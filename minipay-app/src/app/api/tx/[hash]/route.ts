import { NextRequest, NextResponse } from "next/server";
import { isHash, createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { fetchTxReceiptStatus } from "@agent/txStatus.js";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { hash: string } }) {
  const h = params.hash;
  if (!isHash(h)) {
    return NextResponse.json({ error: "invalid tx hash" }, { status: 400 });
  }

  const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });

  try {
    const out = await fetchTxReceiptStatus(client, h);
    return NextResponse.json({
      ...out,
      message:
        out.status === "success" ? "Done ✅ Transaction succeeded."
        : out.status === "failed"  ? "Failed ❌ Transaction reverted."
        : "Pending… No receipt yet.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
