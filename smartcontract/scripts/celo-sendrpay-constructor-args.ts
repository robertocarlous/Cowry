import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CELO_USDC_ADDRESS,
  CELO_USDM_ADDRESS,
} from "../config/celoMainnet.js";

const path = join(process.cwd(), "deployments", "celo-mainnet.json");
const d = JSON.parse(readFileSync(path, "utf8")) as {
  deployer: `0x${string}`;
  agentOperator?: `0x${string}` | null;
  contracts: { GroupRegistry: `0x${string}` };
};

const initialOperators: `0x${string}`[] = d.agentOperator
  ? [d.agentOperator]
  : [];

export default [
  [CELO_USDM_ADDRESS, CELO_USDC_ADDRESS],
  initialOperators,
  d.contracts.GroupRegistry,
  d.deployer,
];
