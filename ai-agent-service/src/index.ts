import "dotenv/config";
import express, { type Request, type Response } from "express";
import { isAddress, isHash } from "viem";
import { createResolutionDeps } from "./deps/createDeps.js";
import { handleUserMessage } from "./pipeline.js";
import { createMessageParser } from "./parseMessage.js";
import { fetchTxReceiptStatus } from "./txStatus.js";
import { getAgentWallet } from "./agent/wallet.js";
import { getAgentIdStatus } from "./agent/selfId.js";

const app = express();
app.use(express.json());

const deps = createResolutionDeps();
const parseMessage = createMessageParser();

// ── Chat ─────────────────────────────────────────────────────────────────────

app.post("/chat", async (req: Request, res: Response) => {
  const sessionId =
    typeof req.body?.sessionId === "string" && req.body.sessionId
      ? req.body.sessionId
      : "default";
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message (string) required" });
    return;
  }
  const rawWallet = req.body?.walletAddress;
  const walletAddress =
    typeof rawWallet === "string" && isAddress(rawWallet)
      ? (rawWallet as `0x${string}`)
      : undefined;
  try {
    const out = await handleUserMessage(sessionId, message, deps, parseMessage, walletAddress);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, mode: deps.mode });
});

// ── Agent identity (ERC-8004 / Self Agent ID) ─────────────────────────────────

app.get("/agent/info", async (_req: Request, res: Response) => {
  try {
    const { address, publicClient } = getAgentWallet();
    const selfStatus = deps.publicClient
      ? await getAgentIdStatus(deps.publicClient, address)
      : await getAgentIdStatus(publicClient, address);

    res.json({
      agentAddress: address,
      network: "celo-mainnet",
      erc8004: selfStatus.registered
        ? { registered: true, agentId: selfStatus.agentId.toString() }
        : { registered: false, hint: selfStatus.hint },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Transaction status ────────────────────────────────────────────────────────

app.get("/tx/:hash", async (req: Request, res: Response) => {
  const h = req.params.hash;
  if (!isHash(h)) {
    res.status(400).json({ error: "invalid tx hash" });
    return;
  }
  if (!deps.publicClient) {
    res.status(503).json({ error: "RPC not configured", hint: "Set CELO_RPC_URL or RPC_URL" });
    return;
  }
  try {
    const out = await fetchTxReceiptStatus(deps.publicClient, h);
    res.json({
      ...out,
      message:
        out.status === "success"
          ? "Done ✅ Transaction succeeded."
          : out.status === "failed"
            ? "Failed ❌ Transaction reverted."
            : "Pending… No receipt yet.",
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/tx-status", async (req: Request, res: Response) => {
  const raw = req.body?.txHash ?? req.body?.hash;
  if (typeof raw !== "string" || !isHash(raw)) {
    res.status(400).json({ error: "txHash (0x-prefixed 32-byte hash) required" });
    return;
  }
  if (!deps.publicClient) {
    res.status(503).json({ error: "RPC not configured" });
    return;
  }
  try {
    const out = await fetchTxReceiptStatus(deps.publicClient, raw as `0x${string}`);
    res.json({
      ...out,
      message: out.status === "success" ? "Done ✅" : out.status === "failed" ? "Failed ❌" : "Pending…",
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const { address } = getAgentWallet();
  console.log(`SendR agent  →  http://localhost:${port}  (resolution: ${deps.mode})`);
  console.log(`Agent wallet →  ${address}`);
  console.log(`Agent info   →  GET http://localhost:${port}/agent/info`);
  console.log(`Chat         →  POST http://localhost:${port}/chat`);
});
