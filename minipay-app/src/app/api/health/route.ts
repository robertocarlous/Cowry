import { NextResponse } from "next/server";
import { createResolutionDeps } from "@cowry/agent-core/deps/createDeps.js";

export const runtime = "nodejs";

const deps = createResolutionDeps();

export function GET() {
  if (deps.mode === "chain") {
    return NextResponse.json({ ok: true, mode: deps.mode });
  }
  return NextResponse.json(
    { ok: false, mode: deps.mode, reason: deps.reason },
    { status: 503 },
  );
}
