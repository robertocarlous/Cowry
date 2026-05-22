import { NextResponse } from "next/server";
import { SUPPORTED_CHAINS } from "@agent/lifi/bridgeClient.js";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ chains: Object.values(SUPPORTED_CHAINS) });
}
