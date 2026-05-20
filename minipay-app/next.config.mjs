/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for MiniPay — disable strict mode to avoid double-effects
  // triggering wallet connections twice
  reactStrictMode: false,
  // viem is ESM-only; webpack needs to transpile it for client bundles
  transpilePackages: ["viem"],

  // Proxy /api/* to the AI agent service so the frontend only needs one origin.
  // Set NEXT_PUBLIC_AGENT_URL in .env.local to override (e.g. a hosted backend).
  async rewrites() {
    const agentOrigin = process.env.AGENT_INTERNAL_URL ?? "http://localhost:3001";
    return [
      {
        source:      "/api/:path*",
        destination: `${agentOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
