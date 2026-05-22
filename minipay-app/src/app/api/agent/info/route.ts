import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { getAgentIdStatus } from "@agent/agent/selfId.js";

export const runtime = "nodejs";

export async function GET() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json({ error: "AGENT_PRIVATE_KEY not set" }, { status: 503 });
  }

  try {
    const account   = privateKeyToAccount(pk as `0x${string}`);
    const rpcUrl    = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
    const client    = createPublicClient({ chain: celo, transport: http(rpcUrl) });
    const selfStatus = await getAgentIdStatus(client, account.address);

    return NextResponse.json({
      agentAddress: account.address,
      network:      "celo-mainnet",
      erc8004:      selfStatus.registered
        ? { registered: true,  agentId: selfStatus.agentId.toString() }
        : { registered: false, hint: selfStatus.hint },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
