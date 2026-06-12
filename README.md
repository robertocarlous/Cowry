# Cowry — Conversational Crypto Payments

> **Send money as easily as sending a message.**

Cowry is an AI-powered crypto payment app built on **Celo**. Type what you want —
*"send $50 to a bank account in Nigeria"*, *"bridge 20 USDC to Base"*, *"what's my
balance?"* — and an onchain AI agent parses the intent, shows you a preview, and
executes the transaction on confirmation. No forms, no wallet addresses, no
multi-app hopping.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Live Deployment](#live-deployment)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Smart Contracts](#smart-contracts)
- [AI Layer](#ai-layer)
- [Integrations](#integrations)
- [Tech Stack](#tech-stack)
- [Why Celo](#why-celo)
- [Security & Safety](#security--safety)
- [Roadmap](#roadmap)
- [License](#license)

---

## The Problem

Crypto payments are powerful, but three everyday jobs remain painfully hard:

- **Sending money home.** Traditional remittance to Africa is slow and expensive —
  bank wires take days, fees eat 5–10%, and the recipient often needs an account
  the sender doesn't have details for.
- **Moving between chains.** Stablecoins are fragmented across a dozen networks.
  Getting USDC from Celo to Base or Arbitrum means juggling bridges, gas tokens,
  and unfamiliar UIs.
- **The interface itself.** Wallet addresses, gas, slippage, network switching —
  none of this maps to how people actually think ("send mom $50").

Cowry collapses all of this into one chat box.

---

## The Solution

Cowry wraps a few real, working integrations behind a single AI chat interface:

```
"Send $50 to a bank account in Nigeria"   → Cross-border payout via Paycrest
"Bridge 20 USDC to Base"                  → Cross-chain send via LI.FI
"What's my balance?"                      → Onchain USDC / USDm balance
```

Every action is parsed by an LLM, turned into a clear preview, and only executed
after the user explicitly confirms.

---

## Live Deployment

**Celo Mainnet (chainId `42220`)**

| Contract | Address |
|---|---|
| UsernameRegistry | `0x1d8050eda109364c15db4c2c5a172128eaeabd25` |
| GroupRegistry | `0x3d8ea5b32dda2b3bfb71c9a07de25ecf28b73fd4` |
| CowryPay (v2 + operators) | `0xf253dde47ca717737be3aefb76326180c2239e04` |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| USDm (Mento Dollar) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |

[View CowryPay on CeloScan →](https://celoscan.io/address/0xf253dde47ca717737be3aefb76326180c2239e04)

---

## Key Features

### 1. AI Chat Interface
Users talk to Cowry in plain language. A Groq-hosted Llama 3.3 model classifies
the message into a structured intent (remittance, cross-chain send, balance check,
general chat, etc.), and the pipeline fills in any missing details with targeted
follow-up questions before building a preview.

### 2. Cross-Border Remittance (Paycrest)
Send USDC from your Celo wallet straight to a **bank account or mobile money
wallet** abroad — the recipient doesn't need a wallet, an app, or a Cowry account.

Supported countries: 🇳🇬 Nigeria (NGN), 🇰🇪 Kenya (KES), 🇬🇭 Ghana (GHS),
🇺🇬 Uganda (UGX), 🇹🇿 Tanzania (TZS), 🇲🇼 Malawi (MWK).

Flow: resolve the bank/provider → verify the account holder's name → quote the
live exchange rate → on confirm, lock the rate with Paycrest and send USDC to the
settlement address. Frequent recipients can be saved under a nickname (e.g.
"mom"), with the account number encrypted at rest.

### 3. Cross-Chain Bridge (LI.FI)
Send USDC or USDm from Celo straight to a USDC address on another chain:
Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche, Linea, and
Scroll — with more available via LI.FI's routing.

### 4. Onchain Identity & Payments
Three Celo smart contracts power Cowry's payment rail:
- **UsernameRegistry** — maps a human-readable `@username` to a wallet address
- **GroupRegistry** — named groups of recipients for batch payments
- **CowryPay** — single, group-equal, and group-split transfers, including
  agent-executed (`...OnBehalf`) variants used by the AI for remittance and
  cross-chain sends

### 5. Always-Confirm Safety Layer
No transaction — onchain or off-chain — ever executes without the user explicitly
typing **confirm**. Every quote shows the exact amounts, recipient, and rate
up front.

### 6. Built on Celo, for MiniPay
Sub-cent fees, fast finality, and native MiniPay support make Cowry practical for
everyday, low-value payments — not just whales moving six figures.

---

## How It Works

1. **User types a message** — e.g. *"send $50 to a bank account in Nigeria"*.
2. **The AI parses intent** using Groq's Llama 3.3, extracting amount, country,
   institution, account details, or chain/token info.
3. **The pipeline fills gaps** by asking clarifying questions (e.g. "Which bank?",
   "What's the account number?") and resolves them against live data (Paycrest
   institution lists, LI.FI routes).
4. **A preview is shown** — exact send amount, recipient, estimated receive amount
   and rate (for remittance), or destination chain and route (for bridging).
5. **User confirms.** The AI agent — an EOA registered onchain as a verified agent
   (Self Protocol / ERC-8004, Agent ID `112`) — signs and submits the transaction(s)
   via `CowryPay.payOnBehalf`, a Paycrest sender order, or a LI.FI route.
6. **Result is shown in chat**, with a CeloScan link and (for remittance) a
   Paycrest order reference.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                       │
│   Next.js chat UI (minipay-app) · wagmi/viem wallet       │
│   Cross-chain send panel · Remittance quote cards         │
└─────────────────────────────┬───────────────────────────┘
                               │
┌─────────────────────────────▼───────────────────────────┐
│                       AI LAYER                            │
│   packages/agent-core — intent parsing (Groq/Llama 3.3)   │
│   Pipeline orchestration, clarifications, quotes          │
│   Session state, saved recipients (Upstash, AES-256-GCM)  │
└─────────────────────────────┬───────────────────────────┘
                               │
┌─────────────────────────────▼───────────────────────────┐
│              SMART CONTRACTS + INTEGRATIONS               │
│   Celo: UsernameRegistry · GroupRegistry · CowryPay        │
│   Paycrest (remittance) · LI.FI (cross-chain bridging)     │
│   Self Protocol (ERC-8004 agent identity)                  │
└─────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

### UsernameRegistry
Maps a unique, lowercase `@username` to a wallet address on Celo. Registration is
one-time and permanent (no transfers, no re-registration), preventing squatting
and impersonation.

### GroupRegistry
Stores named groups and their member lists — the onchain primitive for "pay
everyone in Friends" style batch payments.

### CowryPay (v2)
The payment engine. Supports:
- `pay` — single transfer
- `payGroupEqual` / `payGroupSplit` — batch transfers to a group, split evenly or
  by custom amounts
- `payOnBehalf`, `payGroupEqualOnBehalf`, `payGroupSplitOnBehalf` — operator
  (agent) variants used by the AI to execute remittance and cross-chain sends on
  a user's behalf after confirmation

---

## AI Layer

`packages/agent-core` is the shared TypeScript package powering intent parsing and
orchestration:

- **`llm.ts`** — Groq (Llama 3.3 70B) prompts for intent classification and
  general conversational replies (plain text, no markdown)
- **`pipeline.ts`** — routes parsed intents to handlers, manages clarification
  loops, builds previews, and confirms/executes transactions
- **`remittance/`** — Paycrest client, country/currency tables, institution
  matching, encrypted saved-recipient storage
- **`lifi/`** — LI.FI bridge quotes for cross-chain sends
- **`agent/`** — the agent's Celo wallet and its onchain identity (Self Protocol
  / ERC-8004 verification)

---

## Integrations

| Service | Used for |
|---|---|
| [Groq](https://console.groq.com) (Llama 3.3 70B) | Intent parsing & conversational replies |
| [Paycrest](https://paycrest.io) | Cross-border USDC → bank/mobile-money payouts |
| [LI.FI](https://li.fi) | Cross-chain USDC/USDm routing |
| [Upstash Redis](https://upstash.com) | Encrypted saved-recipient address book |
| [Self Protocol](https://self.xyz) | ERC-8004 onchain agent identity verification |

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Wallet / chain:** viem, wagmi, Celo mainnet
- **AI:** Groq-hosted Llama 3.3 70B via the OpenAI-compatible API
- **Monorepo:** `minipay-app` (Next.js app), `packages/agent-core` (shared AI +
  chain logic), `smartcontract` (Foundry contracts), `ai-agent-service`
- **Storage:** Upstash Redis (serverless), AES-256-GCM for encrypted PII

---

## Why Celo

- **Sub-cent fees** make per-message, low-value payments and remittance viable
- **Fast finality** keeps the chat experience responsive
- **Mento stablecoins** (USDm) and native USDC support
- **MiniPay** — Celo's mobile wallet — gives Cowry a built-in distribution channel
  across emerging markets, the exact audience remittance serves

---

## Security & Safety

- **Explicit confirmation** — every onchain or off-chain action requires the user
  to type `confirm`; nothing executes implicitly
- **Encrypted PII** — saved recipient bank/mobile-money numbers are encrypted at
  rest with AES-256-GCM before being stored in Redis
- **Verifiable agent identity** — the AI's wallet is registered onchain via Self
  Protocol (ERC-8004), so its actions are attributable and auditable
- **Atomic batch payments** — CowryPay's group functions revert entirely on
  partial failure, never leaving a split payment half-done

---

## Roadmap

- More remittance corridors and currencies
- Chat-driven group payments and splits (the onchain primitives already exist in
  GroupRegistry / CowryPay)
- Recurring and conditional payment automations
- Earn/yield (e.g. Morpho USDC vaults) directly from the chat
- Additional bridge chains via LI.FI

---

## License

MIT License — see [LICENSE](./LICENSE) for details.
