import "dotenv/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

import {
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_RPC_DEFAULT,
  CELO_MAINNET_EXPLORER_API,
} from "./config/celoMainnet.js";

const celoMainnetRpcUrl =
  process.env.CELO_RPC_URL ?? CELO_MAINNET_RPC_DEFAULT;

const celoscanApiKey = process.env.CELOSCAN_API_KEY ?? "";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  chainDescriptors: {
    [CELO_MAINNET_CHAIN_ID]: {
      name: "Celo Mainnet",
      chainType: "l1",
      blockExplorers: {
        etherscan: {
          name: "CeloScan",
          url: "https://celoscan.io",
          apiUrl: CELO_MAINNET_EXPLORER_API,
        },
      },
    },
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    celoMainnet: {
      type: "http",
      chainType: "l1",
      chainId: CELO_MAINNET_CHAIN_ID,
      url: celoMainnetRpcUrl,
      accounts: [configVariable("CELO_DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: {
    blockscout: {
      enabled: false,
    },
    etherscan:
      celoscanApiKey.length > 0
        ? { enabled: true, apiKey: celoscanApiKey }
        : { enabled: false },
    sourcify: {
      enabled: true,
    },
  },
});
