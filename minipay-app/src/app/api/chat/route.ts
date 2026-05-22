import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { handleUserMessage } from "@agent/pipeline.js";
import { createResolutionDeps } from "@agent/deps/createDeps.js";
import { createMessageParser } from "@agent/parseMessage.js";

// Singletons — initialised once per cold start, reused across requests
const deps        = createResolutionDeps();
const parseMessage = createMessageParser();

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { message, walletAddress, sessionId = "default" } = body;

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message (string) required" }, { status: 400 });
  }

  const wallet =
    typeof walletAddress === "string" && isAddress(walletAddress)
      ? (walletAddress as `0x${string}`)
      : undefined;

  try {
    const out = await handleUserMessage(
      String(sessionId),
      message,
      deps,
      parseMessage,
      wallet,
    );
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
