/**
 * Register the Cowry AI agent wallet as an operator on CowryPay v2.
 *
 * This allows the agent to call payOnBehalf / payGroupEqualOnBehalf /
 * payGroupSplitOnBehalf on behalf of users who have approved CowryPay.
 *
 * Prerequisites:
 *   - CELO_DEPLOYER_PRIVATE_KEY in .env (the contract owner wallet)
 *   - AGENT_PRIVATE_KEY or AGENT_ADDRESS in .env (the agent wallet to register)
 *
 * Run: npx hardhat run scripts/register-agent-operator.ts --network celoMainnet
 */
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import "dotenv/config";

const COWRYPAY_V2 = "0xf253dde47ca717737be3aefb76326180c2239e04" as const;

const COWRYPAY_ABI = [
  {
    name: "setOperator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "enabled",  type: "bool"    },
    ],
    outputs: [],
  },
  {
    name: "operators",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool"    }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";

// ── Deployer (contract owner) ─────────────────────────────────────────────────
const deployerKey = process.env.CELO_DEPLOYER_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
if (!deployerKey?.startsWith("0x")) {
  console.error("❌  Set CELO_DEPLOYER_PRIVATE_KEY in .env (the account that deployed CowryPay).");
  process.exit(1);
}
const deployer = privateKeyToAccount(deployerKey as `0x${string}`);

// ── Agent wallet to register ──────────────────────────────────────────────────
const agentAddressRaw = process.env.AGENT_ADDRESS?.trim()
  ?? (process.env.AGENT_PRIVATE_KEY?.startsWith("0x")
    ? privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`).address
    : undefined);

if (!agentAddressRaw) {
  console.error("❌  Set AGENT_ADDRESS or AGENT_PRIVATE_KEY in .env.");
  process.exit(1);
}
const agentAddress = agentAddressRaw as `0x${string}`;

const publicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: deployer, chain: celo, transport: http(rpcUrl) });

console.log("CowryPay v2 :", COWRYPAY_V2);
console.log("Owner wallet:", deployer.address);
console.log("Agent wallet:", agentAddress);
console.log("");

// ── Verify owner ──────────────────────────────────────────────────────────────
const contractOwner = await publicClient.readContract({
  address: COWRYPAY_V2, abi: COWRYPAY_ABI, functionName: "owner",
}) as `0x${string}`;

if (contractOwner.toLowerCase() !== deployer.address.toLowerCase()) {
  console.error(`❌  Deployer ${deployer.address} is not the contract owner.`);
  console.error(`    Owner is: ${contractOwner}`);
  console.error("    Use the correct CELO_DEPLOYER_PRIVATE_KEY.");
  process.exit(1);
}
console.log("✅  Deployer is contract owner.");

// ── Check current status ──────────────────────────────────────────────────────
const alreadyOperator = await publicClient.readContract({
  address: COWRYPAY_V2, abi: COWRYPAY_ABI, functionName: "operators",
  args: [agentAddress],
}) as boolean;

if (alreadyOperator) {
  console.log("✅  Agent is already registered as operator — nothing to do.");
  process.exit(0);
}

// ── Register ──────────────────────────────────────────────────────────────────
console.log("⏳  Calling setOperator(agentAddress, true)…");

const hash = await walletClient.writeContract({
  address: COWRYPAY_V2,
  abi: COWRYPAY_ABI,
  functionName: "setOperator",
  args: [agentAddress, true],
});

console.log("   tx hash:", hash);
console.log("   Waiting for confirmation…");

await publicClient.waitForTransactionReceipt({ hash });

// ── Verify ────────────────────────────────────────────────────────────────────
const confirmed = await publicClient.readContract({
  address: COWRYPAY_V2, abi: COWRYPAY_ABI, functionName: "operators",
  args: [agentAddress],
}) as boolean;

if (confirmed) {
  console.log("");
  console.log("✅  Agent registered as operator!");
  console.log(`   Agent:    ${agentAddress}`);
  console.log(`   Contract: ${COWRYPAY_V2}`);
  console.log(`   CeloScan: https://celoscan.io/tx/${hash}`);
} else {
  console.error("❌  setOperator confirmed but operators() still returns false. Check manually.");
  process.exit(1);
}
