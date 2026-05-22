import { NextResponse } from "next/server";
import { createResolutionDeps } from "@agent/deps/createDeps.js";

export const runtime = "nodejs";

const deps = createResolutionDeps();

export function GET() {
  return NextResponse.json({ ok: true, mode: deps.mode });
}
