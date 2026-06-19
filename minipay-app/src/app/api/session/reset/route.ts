import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@cowry/agent-core/state.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { sessionId } = body;

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId (string) required" }, { status: 400 });
  }

  try {
    await clearSession(sessionId.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
