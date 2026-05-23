import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentSrc = path.resolve(__dirname, "../ai-agent-service/src");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["viem", "openai"],

  webpack(config) {
    config.resolve.extensionAlias = {
      ".js":  [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      "@agent": agentSrc,
    };
    // Suppress "Critical dependency: expression in require()" warning from ox/tempo
    // (used internally by viem's tempo chain definition — not used by Cowry)
    config.module.exprContextCritical = false;

    return config;
  },
};

export default nextConfig;
