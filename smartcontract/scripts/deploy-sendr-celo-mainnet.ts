/**
 * Deploy UsernameRegistry, GroupRegistry, and SendrPay wired to USDm on Celo mainnet.
 *
 * Prerequisites:
 * - `CELO_DEPLOYER_PRIVATE_KEY` in `.env` (deployer wallet with CELO for gas).
 * - Optional: `CELO_RPC_URL` (defaults to https://forno.celo.org).
 *
 * Run: npm run deploy:celo-mainnet
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { network } from "hardhat";

import {
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_RPC_DEFAULT,
  CELO_USDM_ADDRESS,
  CELO_USDC_ADDRESS,
} from "../config/celoMainnet.js";

const { viem } = await network.connect({
  network: "celoMainnet",
  chainType: "l1",
});

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const owner = deployer.account.address;

const rpcUrl = process.env.CELO_RPC_URL ?? CELO_MAINNET_RPC_DEFAULT;

const balance = await publicClient.getBalance({ address: owner });
const minDeployWei = 500_000_000_000_000_000n; // ~0.5 CELO — rough headroom for 3 contracts
if (balance < minDeployWei) {
  console.error(
    `Deployer ${owner} has ${balance} wei CELO; need at least ~0.5 CELO for three contract deploys. Fund the wallet and retry.`,
  );
  process.exit(1);
}

const initialTokens: `0x${string}`[] = [CELO_USDM_ADDRESS, CELO_USDC_ADDRESS];

console.log("Network: Celo Mainnet (chainId", String(CELO_MAINNET_CHAIN_ID) + ")");
console.log("RPC:", rpcUrl);
console.log("Deployer:", owner);
console.log("Supported tokens:", initialTokens.join(", "));

const registry = await viem.deployContract("UsernameRegistry", []);
const groups = await viem.deployContract("GroupRegistry", []);
const pay = await viem.deployContract("SendrPay", [initialTokens, groups.address, owner]);

console.log("UsernameRegistry:", registry.address);
console.log("GroupRegistry:   ", groups.address);
console.log("SendrPay:        ", pay.address);

const artifact = {
  chainId: CELO_MAINNET_CHAIN_ID,
  networkName: "Celo Mainnet",
  deployedAt: new Date().toISOString(),
  documentation: "https://docs.celo.org",
  rpcUrl,
  tokens: {
    usdm: { address: CELO_USDM_ADDRESS, decimals: 18 },
    usdc: { address: CELO_USDC_ADDRESS, decimals: 6 },
  },
  deployer: owner,
  contracts: {
    UsernameRegistry: registry.address,
    GroupRegistry: groups.address,
    SendrPay: pay.address,
  },
  explorers: {
    celoscan: "https://celoscan.io",
  },
};

const outPath = join(process.cwd(), "deployments", "celo-mainnet.json");
writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
console.log("Wrote", outPath);
