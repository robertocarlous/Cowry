/**
 * Verify deployed Cowry contracts on Sourcify (and CeloScan if CELOSCAN_API_KEY is set).
 *
 * Prerequisites: deployments/celo-mainnet.json from deploy-cowry-celo-mainnet.ts
 *
 * Run: npm run verify:celo-mainnet
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { execSync } from "node:child_process";

type Deployment = {
  deployer: `0x${string}`;
  contracts: {
    UsernameRegistry: `0x${string}`;
    GroupRegistry: `0x${string}`;
    CowryPay: `0x${string}`;
  };
};

const path = join(process.cwd(), "deployments", "celo-mainnet.json");
const d = JSON.parse(readFileSync(path, "utf8")) as Deployment;

const network = "celoMainnet";
const profile = "--build-profile production";

function run(cmd: string) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

console.log("Verifying Celo mainnet deployment from", path);

run(
  `npx hardhat verify sourcify ${profile} --network ${network} ${d.contracts.UsernameRegistry}`,
);
run(
  `npx hardhat verify sourcify ${profile} --network ${network} ${d.contracts.GroupRegistry}`,
);

// Parent `hardhat verify` resolves --constructor-args-path; `verify sourcify` does not.
run(
  `npx hardhat verify ${profile} --network ${network} --contract contracts/CowryPay.sol:CowryPay --constructor-args-path scripts/celo-sendrpay-constructor-args.mjs ${d.contracts.CowryPay}`,
);

console.log("\n✅ Sourcify verification commands finished.");
