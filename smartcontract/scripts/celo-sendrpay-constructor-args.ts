import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CELO_USDC_ADDRESS,
  CELO_USDM_ADDRESS,
} from "../config/celoMainnet.js";

const path = join(process.cwd(), "deployments", "celo-mainnet.json");
const d = JSON.parse(readFileSync(path, "utf8")) as {
  deployer: `0x${string}`;
  contracts: { GroupRegistry: `0x${string}` };
};

export default [
  [CELO_USDM_ADDRESS, CELO_USDC_ADDRESS],
  d.contracts.GroupRegistry,
  d.deployer,
];
