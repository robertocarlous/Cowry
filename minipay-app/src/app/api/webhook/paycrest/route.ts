import { NextRequest, NextResponse } from "next/server";
import { getOnRampOrderSession, setOnRampOrderSettled } from "@cowry/agent-core/state.js";

export const runtime = "nodejs";

// Paycrest sends order lifecycle events to this endpoint.
// We only care about `payment_order.settled` (fiat received, USDC released).
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = body.event as string | undefined;
  const data  = body.data as Record<string, unknown> | undefined;

  if (!event || !data) {
    return NextResponse.json({ error: "missing event or data" }, { status: 400 });
  }

  if (event === "payment_order.settled") {
    const orderId    = (data.id ?? data.orderId) as string | undefined;
    const amountPaid = (data.amountPaid ?? data.amount ?? "") as string;

    if (!orderId) {
      return NextResponse.json({ error: "missing orderId" }, { status: 400 });
    }

    // Check we issued this order (and have a session mapping for it)
    const sessionId = await getOnRampOrderSession(orderId);
    if (!sessionId) {
      // Not ours — ack anyway so Paycrest doesn't retry
      return NextResponse.json({ ok: true });
    }

    await setOnRampOrderSettled(orderId, String(amountPaid));
    console.log(`[paycrest webhook] order ${orderId} settled (session ${sessionId}, paid ${amountPaid})`);
  }

  // Always return 200 to prevent Paycrest retries for events we don't handle
  return NextResponse.json({ ok: true });
}
