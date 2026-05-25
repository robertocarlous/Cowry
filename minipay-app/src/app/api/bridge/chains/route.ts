import { NextResponse } from "next/server";
import { loadAgentEnv } from "@/lib/loadAgentEnv";
import {
  getCeloBridgeSource,
  getCeloOutboundDestinations,
} from "@cowry/agent-core/lifi/bridgeClient.js";

export const runtime = "nodejs";

loadAgentEnv();

export function GET() {
  const source = getCeloBridgeSource();
  const destinations = getCeloOutboundDestinations();
  return NextResponse.json({ source, destinations });
}
