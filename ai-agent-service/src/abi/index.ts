import userRegistry from "./userRegistry.json" with { type: "json" };
import groupRegistry from "./groupRegistry.json" with { type: "json" };
import CowryPay from "./CowryPay.json" with { type: "json" };

function contractAddress(
  envKey: string,
  fallback: `0x${string}`,
): `0x${string}` {
  const v = process.env[envKey]?.trim();
  if (v && /^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
  return fallback;
}

/** Celo mainnet — deployed 2026-05-20. Override via env if redeployed. */
const DEFAULT_USERNAME_REGISTRY = "0x3b89d7b4997db5645db2829523ed3e79e55a0f02" as const;
const DEFAULT_GROUP_REGISTRY    = "0xee7ee3852663917a12ef95852a9fc4e092e45a31" as const;
const DEFAULT_COWRYPAY          = "0x2b0d2f1dec9ab3e06668145d21ed17715e288350" as const;

export const userRegistryContract = {
  abi: userRegistry,
  address: contractAddress("USERNAME_REGISTRY_ADDRESS", DEFAULT_USERNAME_REGISTRY),
};

export const groupRegistryContract = {
  abi: groupRegistry,
  address: contractAddress("GROUP_REGISTRY_ADDRESS", DEFAULT_GROUP_REGISTRY),
};

export const cowrypayContract = {
  abi: CowryPay,
  address: contractAddress("COWRYPAY_ADDRESS", DEFAULT_COWRYPAY),
};
