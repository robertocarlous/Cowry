/**
 * One-time script to register the CowryPay AI agent with Self Agent ID (ERC-8004).
 *
 * What it does:
 * 1. Derives the agent's Ethereum address from AGENT_PRIVATE_KEY
 * 2. Initiates a "verified-wallet" registration with Self Protocol
 * 3. Prints a QR code URL — the human operator scans this with the Self app
 *    and completes a ZK passport verification
 * 4. Polls until the soulbound ERC-721 NFT is minted on Celo mainnet
 *
 * Prerequisites:
 *   AGENT_PRIVATE_KEY=0x... in .env (the deployer / agent wallet private key)
 *   CELO_RPC_URL=https://forno.celo.org  (optional, defaults to forno)
 *
 * Run: npm run register:agent
 */
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { requestRegistration } from "@selfxyz/agent-sdk";
import { getAgentIdStatus, SELF_AGENT_REGISTRY } from "../src/agent/selfId.js";

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

const pk = process.env.AGENT_PRIVATE_KEY;
if (!pk || !pk.startsWith("0x")) {
  console.error("❌  AGENT_PRIVATE_KEY is not set or not 0x-prefixed.");
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";

const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });

console.log("───────────────────────────────────────────");
console.log("  CowryPay AI — Self Agent ID Registration");
console.log("───────────────────────────────────────────");
console.log("  Agent address :", account.address);
console.log("  Network       : Celo Mainnet");
console.log("  Registry      :", SELF_AGENT_REGISTRY);
console.log();

// Check if already registered
const current = await getAgentIdStatus(client, account.address);
if (current.registered) {
  console.log(`✅  Already registered — Agent NFT ID: ${current.agentId}`);
  process.exit(0);
}

console.log("⏳  Initiating registration with Self Protocol...");

const session = await requestRegistration({
  mode: "verified-wallet",
  network: "mainnet",
  humanAddress: account.address,
  agentName: "CowryPay AI Agent",
  disclosures: { ofac: true },
});

console.log();
console.log("📱  Scan the QR code below with the Self app to complete ZK passport verification:");
console.log();
console.log("  ➜", session.qrUrl ?? session.deepLink ?? session.sessionId);
console.log();
console.log("  (The Self app is available at https://self.xyz)");
console.log();
console.log("⏳  Waiting for verification to complete (timeout: 10 min)...");

const deadline = Date.now() + POLL_TIMEOUT_MS;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

  const status = await getAgentIdStatus(client, account.address);
  if (status.registered) {
    console.log();
    console.log("───────────────────────────────────────────");
    console.log("✅  Registration complete!");
    console.log(`  Agent NFT ID  : ${status.agentId}`);
    console.log(`  Agent address : ${status.agentAddress}`);
    console.log(`  Add to .env   : AGENT_SELF_ID=${status.agentId}`);
    console.log("───────────────────────────────────────────");
    process.exit(0);
  }

  process.stdout.write(".");
}

console.error("\n❌  Timed out waiting for registration. Please try again.");
process.exit(1);
