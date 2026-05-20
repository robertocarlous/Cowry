import userRegistry from "./userRegistry.json" with { type: "json" };
import groupRegistry from "./groupRegistry.json" with { type: "json" };
import Sendrpay from "./Sendrpay.json" with { type: "json" };

// ── Celo mainnet addresses ────────────────────────────────────────────────────
// TODO: replace with real addresses from deployments/celo-mainnet.json after
//       running `npm run deploy:celo-mainnet` in the smartcontract directory.

export const userRegistryContract = {
  abi: userRegistry,
  address: (process.env.USERNAME_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const groupRegistryContract = {
  abi: groupRegistry,
  address: (process.env.GROUP_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const sendrpayContract = {
  abi: Sendrpay,
  address: (process.env.SENDRPAY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
};
