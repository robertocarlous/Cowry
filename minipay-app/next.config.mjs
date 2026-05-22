import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentSrc = path.resolve(__dirname, "../ai-agent-service/src");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // viem + openai are ESM-only — webpack must transpile them for client bundles
  transpilePackages: ["viem", "openai"],

  webpack(config) {
    // Allow  import { x } from "./file.js"  to resolve  ./file.ts
    // (the ESM/NodeNext convention used by ai-agent-service)
    config.resolve.extensionAlias = {
      ".js":  [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };

    // @agent/* → ai-agent-service/src/*  (clean import alias for API routes)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@agent": agentSrc,
    };

    return config;
  },

  // No proxy rewrite needed — API routes are built directly into Next.js
};

export default nextConfig;
