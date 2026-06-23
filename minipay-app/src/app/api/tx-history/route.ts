import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchTransactionHistory } from "@cowry/agent-core/txHistory.js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "page must be a positive integer" }, { status: 400 });
  }

  try {
    const out = await fetchTransactionHistory(address, page, 10);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
