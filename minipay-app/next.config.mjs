import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bridge/chat API routes import the shared agent core package in-process.
// Pull shared secrets (LIFI_API_KEY, GROQ_API_KEY, etc.) from ai-agent-service/.env when missing locally.
const agentEnvPath = path.resolve(__dirname, "../ai-agent-service/.env");
if (existsSync(agentEnvPath)) {
  for (const line of readFileSync(agentEnvPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@cowry/agent-core", "viem", "openai"],

  webpack(config, { isServer }) {
    // Suppress "Critical dependency: expression in require()" warning from ox/tempo
    // (used internally by viem's tempo chain definition — not used by Cowry)
    config.module.exprContextCritical = false;

    // Allow webpack to resolve TypeScript-style `.js` imports to `.ts` source files.
    // Required because @cowry/agent-core is now loaded from src/ (transpilePackages)
    // and TypeScript ESM convention uses `.js` extensions for relative imports.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return config;
  },
};

export default nextConfig;
