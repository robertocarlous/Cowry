/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for MiniPay — disable strict mode to avoid double-effects
  // triggering wallet connections twice
  reactStrictMode: false,
  // viem is ESM-only; webpack needs to transpile it for client bundles
  transpilePackages: ["viem"],
};

export default nextConfig;
