# DeFi Markets - DFM
The Fund Management Operating System

At its core are Decentralized Traded Funds (DTFs) — 
ETF-like on-chain portfolios, where NAV, fees, and governance are fully deterministic.

---

This repo contains:

- User-facing Web App (FE)
- Administrative Dashboard (Admin FE)
- Backend API (NestJS)
- Solana Programs and CLI scripts (Anchor)

---

## Linked README

- [DeFi Markets App](defi-markets-FE-main/README.md)
- [DeFi Markets Admin App](defi-markets-admin-main/README.md)
- [DeFi Markets Backend](defi-markets-BE-main/README.md)
- [ETF Vaults - Solana Smart Contracts](defi-markets-contracts-main/README.md)

---

## Project Structure

```text
/defi-markets-FE-main/           # User app (React + Vite + Tailwind + shadcn/ui)
/defi-markets-admin-main/        # Admin dashboard (React + Vite)
/defi-markets-BE-main/           # Backend API (NestJS + Fastify + Mongo + Redis)
/defi-markets-contracts-main/    # Solana programs (Anchor) + TS CLI scripts
```

Key docs (see inside each package for full details):

- Frontend: `defi-markets-FE-main/README.md`, `API_INTEGRATION_README.md`, `VAULT_CREATION_README.md`, `VAULT_CREATION_CLEAN_IMPLEMENTATION.md`
- Admin: `defi-markets-admin-main/README.md`, `ADMIN_PAGES_API_USAGE.md`, `ANCHOR_INTEGRATION_SUMMARY.md`
- Backend: `defi-markets-BE-main/README.md`, `VAULT_INTEGRATION_GUIDE.md`, `SIWX_IMPLEMENTATION.md`, `DOMAIN_ACCESS_CONTROL.md`, `VAULT_MANAGEMENT_FEES_CRON.md`
- Contracts: `defi-markets-contracts-main/README.md`, `README-DEPOSIT-REDEEM.md`, `TESTING-DEPOSIT-SHARE-PRICE.md`, `DEPLOYMENT_GUIDE.md`, `FACTORY_SETUP_GUIDE.md`, `FEES_SUMMARY.md`, `SOLANA_DEPLOYMENT_SOLUTIONS.md`

---

## Platform Overview

- Permissionless vault creation with configurable underlying assets (BPS allocations)
- Share-price aware deposits and NAV-based redemptions with program-side Jupiter swaps
- Management/entry/exit fees with accrual and distribution tooling
- Real-time analytics, dashboards, portfolio views, and admin operations
- Wallet auth via Sign-In with Solana (SIWS) and optional Twitter OAuth in the backend

---

## Tech Stack

- Frontends: React 18 + TypeScript, Vite, Tailwind, shadcn/ui, Radix UI, Recharts
- State/Data: React Query, Redux Toolkit (+ persist) where applicable
- Wallet: Reown AppKit (WalletConnect) + Solana adapter
- Backend: NestJS (Fastify), MongoDB (Mongoose), Redis, Swagger, Winston
- Solana: Anchor 0.31.x, `@solana/web3.js`, `@solana/spl-token`

---

## Quick Start (Local Development)

You can run each project independently. Recommended order: Backend → Frontends. Contracts are optional unless you want to build/deploy programs locally.

1.  Backend API (port 3400 by default)

```bash
cd defi-markets-BE-main
npm install
# copy .env from README and fill values
npm run start:dev
```

2.  User Frontend (port 8080 via Vite config; check project README)

```bash
cd defi-markets-FE-main
npm install
# create .env; set VITE_API_BASE_URL to http://0.0.0.0:3400/api/v1
npm run dev
# open http://localhost:8080 (or as configured in vite.config.ts)
```

3.  Admin Frontend (default dev port 5173 or 8082 as noted in README)

```bash
cd defi-markets-admin-main
npm install
# create .env; set VITE_API_BASE_URL to http://0.0.0.0:3400/api
npm run dev
# open the printed dev URL (README references 8082)
```

4.  Solana Programs (Anchor)

```bash
cd defi-markets-contracts-main
npm install
anchor build
# optional
anchor deploy
```

For comprehensive scripts and flows (deposit/redeem, fees, vault mgmt), see contracts README and `README-DEPOSIT-REDEEM.md`.

---

## Environment Variables (Summary)

Consolidated highlights; see each package README for complete lists.

- Frontend (`defi-markets-FE-main`)

  - `VITE_API_BASE_URL` (e.g., http://0.0.0.0:3400/api/v1)
  - `VITE_SOLANA_NETWORK` (devnet | mainnet-beta)
  - `VITE_VAULT_FACTORY_PROGRAM_ID`
  - `VITE_HELIUS_API_KEY` or `VITE_*_RPC_URL`

- Admin (`defi-markets-admin-main`)

  - `VITE_API_BASE_URL` (e.g., http://0.0.0.0:3400/api)
  - `VITE_FEES_ID`
  - `VITE_SOLANA_NETWORK`, `VITE_SOLANA_RPC_URL`, `VITE_VAULT_FACTORY_PROGRAM_ID`

- Backend (`defi-markets-BE-main`)
  - Mongo: `DB_URL`
  - JWT: `WEBTOKEN_SECRET_KEY`, `WEBTOKEN_EXPIRATION_TIME`
  - Solana/Helius: `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_SECRET`
  - Vault factory: `SOLANA_VAULT_FACTORY_ADDRESS`
  - Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_TTL`
  - Rate limit: `RATE_LIMIT_REQ_COUNT`, `RATE_LIMIT_TIME_WINDOW`
  - Cron/Cooldown: `CRON_JOB_INTERVAL`, `COOLDOWN_PERIOD`
  - Twitter OAuth: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `BASE_URL`, `REDIRECT_URL`

---

## Solana Program Concepts (Contracts)

- Single program with Factory module and per‑vault PDAs
- Core flows:
  - Deposit: first deposit 1:1 after entry fee; subsequent vs share price
  - Redeem (program-side): withdraw underlying pro‑rata → Jupiter swaps → finalize NAV payout
- Fees: entry, exit, management; accrual and distribution tools
- PDAs: factory, vault, vault mint, vault stablecoin, internal token account

See `defi-markets-contracts-main/README.md` and `README-DEPOSIT-REDEEM.md` for instruction catalogs, events, fee math, and scripts.

---

## Development Notes

- Frontends use Reown AppKit for wallet connection and SIWS flows (coordinated with backend SIWX endpoints)
- Backend exposes Swagger at `/api/docs` and health at `/api/health` (default port 3400)
- Admin app includes on‑chain actions (pause/resume vaults, fees) coordinated with backend updates
- Charts, dashboard, and history endpoints available under `/api/v1/*` (see backend README)

---

## Useful Scripts and Commands

- Contracts CLI (inside `defi-markets-contracts-main`):
  ```bash
  npx ts-node script.ts create            # create vault
  npx ts-node script.ts deposit <idx> <amount>
  npx ts-node script.ts redeem <idx> <amount>
  npx ts-node script.ts fees <idx>
  ```
- Program-side flows:
  ```bash
  npx ts-node deposit_program_side.ts <vaultIndex> <amountRaw> <sharePriceRaw>
  npx ts-node redeem_program_side.ts <vaultIndex> <vaultTokenAmountRaw>
  ```

Refer to the contracts docs for complete catalogs and examples.

---

## Production & Deployment

- Backend: Docker Compose available; see `defi-markets-BE-main/docker-compose.yml` and README
- Frontends: Vite build → static hosting/CDN; ensure envs injected at build time
- Programs: `anchor build && anchor deploy`; set program IDs in FE/Admin/BE configs

---
