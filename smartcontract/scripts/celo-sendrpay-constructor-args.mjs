import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CELO_USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

const path = join(__dirname, "..", "deployments", "celo-mainnet.json");
const d = JSON.parse(readFileSync(path, "utf8"));

export default [
  [CELO_USDM, CELO_USDC],
  d.contracts.GroupRegistry,
  d.deployer,
];
