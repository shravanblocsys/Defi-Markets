# DeFi Markets Backend

### 📚 Description

DeFi Markets Backend is a robust API built with NestJS for managing decentralized finance market data and user profiles. It comes with database, logging, security, and authentication features out of the box.

**Features:**

- User authentication and authorization
- Profile management
- JWT token-based security
- MongoDB integration with Mongoose
- Swagger API documentation
- Winston logging
- Rate limiting and security headers

---

### 🛠️ Prerequisites

#### Non Docker

- Please make sure to either have MongoDB Community installed locally or a subscription to Mongo on the cloud by configuration a cluster in [atlas](https://www.mongodb.com/cloud/atlas).

#### Docker 🐳

- Please make sure to have docker desktop setup on any preferred operating system to quickly compose the required dependencies. Then follow the docker procedure outlined below.

**Note**: Docker Desktop comes free on both Mac and Windows, but it only works with Windows 10 Pro. A workaround is to get [Docker Toolbox](https://docs.docker.com/toolbox/toolbox_install_windows/) which will bypass the Windows 10 Pro prerequisite by executing in a VM.

---

### 🚀 Quick Start

#### Manual Deployment without Docker

1. **Clone the repository**

```bash
git clone <repository-url>
cd defi-markets-BE
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
```

3. **Set up environment variables**
   - Create a `.env` file in the root directory
   - Use the following template:

```env
# Application Environment
# Options: dev, prod
APP_ENV=local

# Application URL
# Example: http://localhost:3000 or https://yourdomain.com
APP_URL=http://localhost:3000

# JWT Configuration
# Secret key for JWT token signing (REQUIRED)
# Generate a strong random string for production
WEBTOKEN_SECRET_KEY=

# JWT Token expiration time in seconds (default: 1800 = 30 minutes)
WEBTOKEN_EXPIRATION_TIME=86400

# Database URL
DB_URL=

#
#S3 configurations
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET_NAME=

# Solana Configuration
# Solana network to use (devnet, testnet, mainnet-beta)
SOLANA_NETWORK=mainnet-beta

# Solana RPC URL (optional, will use default for the network if not provided)
SOLANA_RPC_URL=
JUPITER_API_BASE_URL=
JUPITER_QUOTE_API=
JUPITER_SWAP_API=

# Optional: Solana wallet configuration
# SOLANA_WALLET_PRIVATE_KEY=your_private_key_here

# WalletConnect Configuration
# WalletConnect Project ID for SIWE authentication
# Get your project ID from https://cloud.walletconnect.com/
WALLET_CONNECT_PROJECT_ID=

# Helius (Solana) Integration
# Obtain your API key from https://www.helius.dev/
# Base RPC URLs:
# - Mainnet: https://mainnet.helius-rpc.com
# - Devnet: https://devnet.helius-rpc.com
HELIUS_API_KEY=
HELIUS_WEBHOOK_SECRET=
SOLANA_VAULT_FACTORY_ADDRESS=

# # Optionally override the base RPC (defaults to mainnet if not set)
# HELIUS_RPC_BASE=https://mainnet.helius-rpc.com

# Redis Configuration
# Redis host (default: localhost)
REDIS_HOST=localhost
# Redis port (default: 6379)
REDIS_PORT=6379
# Redis password (optional)
# REDIS_PASSWORD=your_redis_password
# Redis database number (default: 0)
REDIS_DB=0
# Redis cache TTL in seconds (default: 300 = 5 minutes)
REDIS_TTL=300
# Redis max items in cache (default: 100)
REDIS_MAX_ITEMS=100

#Raydium token List API
RAYDIUM_API_BASE_URL=

#ORCA token list api
ORCA_API_BASE_URL=

# Local Development Origins
LOCAL_ORIGINS=

# QA Environment Origins
QA_ORIGINS=

# Production Environment Origins
PROD_ORIGINS=

# -> Rate Limit Config
SOLANA_ADMIN_PRIVATE_KEY=

RATE_LIMIT_REQ_COUNT=1
# Here 1000ms means 1 second
RATE_LIMIT_TIME_WINDOW=1000

# -> Cors configuration
# CORS_ORIGINS=

# -> CRON Job Interval
CRON_JOB_INTERVAL="*/15 * * * * *"

# -> Cool Down time Interval (15 minutes)
COOLDOWN_PERIOD=900000


#twitter connect
BASE_URL=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
CLIENT_TYPE=confidential
# SECURITY: Replace with a strong, randomly generated value in production. Do NOT use defaults.
SESSION_SECRET=def-market-secret-2025-very-long-secret-key-for-session-management-32-chars
CLIENT_HOME_PAGE_URL=
REDIRECT_URL=

#MINIMUM DEPOSIT (0.5 USDC)
MINI_DEPOSIT=
#MINIMUM REDEEM (0.5 shares)
MINI_REDEEM=

```

4. **Start MongoDB**

   - Install MongoDB locally, or
   - Use Docker: `docker run -d -p 27017:27017 --name mongodb mongo:latest`

5. **Start the application**

```bash
# Development mode
npm run start:dev

# Production mode
npm run start
```

The application will be available at **http://localhost:3000**

### 📁 Project Structure

```text
defi-markets-BE/
├── src/
│  ├── main.ts                              # App bootstrap (Fastify, Swagger, CORS, health)
│  ├── middlewares/
│  │  ├── admin/                            # Admin decorators and middleware
│  │  ├── auth/                             # Auth middleware
│  │  ├── domain/                           # Domain access control
│  │  ├── pagination/                       # Pagination helpers
│  │  ├── rateLimit/                        # Rate limiting helpers
│  │  └── response/                         # Response interceptor
│  ├── modules/
│  │  ├── app/                              # App module/controller/service wiring
│  │  ├── asset-allocation/                 # Asset allocation logic and APIs
│  │  ├── auth/                             # Local/JWT auth, Twitter OAuth setup
│  │  ├── charts/                           # Public charts endpoints
│  │  ├── config/                           # Env config service and module
│  │  ├── cron-job/                         # General cron endpoints
│  │  ├── dashboard/                        # Dashboard stats endpoints
│  │  ├── fees-management/                  # Fees management APIs
│  │  ├── helius-stream/                    # Helius webhook receiver for Solana events
│  │  ├── history/                          # Historical data endpoints
│  │  ├── profile/                          # User profile APIs
│  │  ├── roles/                            # RBAC roles
│  │  ├── s3-bucket/                        # S3/MinIO integration
│  │  ├── seeders/                          # Seed data utilities and endpoints
│  │  ├── share-price-cron/                 # Share price cron endpoints
│  │  ├── siwx/                             # SIWX wallet auth (create/verify/session)
│  │  ├── solana-token/                     # Solana token helpers/endpoints
│  │  ├── tx-event-management/              # Transaction events processing
│  │  ├── vault-deposit/                    # Vault operations, deposit/redeem, NAV
│  │  ├── vault-factory/                    # Vault configuration and creation
│  │  ├── vault-insights/                   # Public vault data (fees, history, portfolio)
│  │  ├── vault-management-fees/            # Vault management fees
│  │  ├── wallet/                           # Wallet endpoints and helpers
│  │  ├── wallet-roles/                     # Wallet roles management
│  │  └── winston/                          # Winston logger configuration
│  ├── schemas/
│  │  └── share-price-history.schema.ts     # Mongoose schemas
│  └── utils/
│     ├── abis/                             # ABIs (EVM)
│     ├── cache/                            # Cache utilities
│     ├── idls/                             # IDLs (Solana)
│     ├── redis/                            # Redis client and docs
│     └── utils.ts                          # Shared utilities
├── dist/                                   # Build output (tsc)
├── logs/                                   # Runtime logs (winston & rotate)
├── test/                                   # E2E tests and jest config
├── docker-compose.yml                      # Docker composition
├── Dockerfile                              # Docker image
├── package.json                            # Scripts and dependencies
├── tsconfig*.json                          # TypeScript configs
├── README.md                               # This file
├── DOMAIN_ACCESS_CONTROL.md                # Domain ACL design
├── SIWX_IMPLEMENTATION.md                  # SIWX architecture and API
├── TWITTER_AUTHENTICATION.md               # Twitter OAuth 2.0 integration
├── VAULT_INTEGRATION_GUIDE.md              # Vault Factory + Deposit overview
└── VAULT_MANAGEMENT_FEES_CRON.md           # Management fees cron guide
```

---

### 🧭 Project Architecture and Modules

This service is a NestJS Fastify application with modular domains. Key modules wired in `AppModule` include:

- Auth, Profile, Roles, Wallet, Wallet-Roles
- SIWX (Sign In With X) wallet auth
- Twitter OAuth 2.0 login
- Vault Factory, Vault Deposit, Vault Insights
- Fees Management, Vault Management Fees
- Tx Event Management, Asset Allocation, Solana Token
- Charts, Dashboard, Share Price Cron
- Helius Stream (webhook for on-chain events)
- Redis, S3 Bucket, Seeders, Winston logging

Core pieces:

- Fastify + Helmet + Rate Limiter
- Global validation via `ValidationPipe`
- Response interceptor middleware
- CORS origins driven by env via `ConfigService`
- Swagger at `/api/docs`
- Health check at `/api/health`

---

#### Deploying with Docker 🐳

- Execute the following command in-app directory:

```bash
# creates and loads the docker container with required configuration
$ docker-compose up -d
```

- The following command will set up and run the docker project for quick use. Then the web application, and MongoDB will be exposed to http://localhost:3000 and http://localhost:27017 respectively.

---

### 🔒 Environment Configuration

By default, the application comes with a config module that can read in every environment variable from the `.env` file.

---

### 🏗 Choosing a Web Framework

This boilerplate comes with [Fastify](https://github.com/fastify/fastify) out of the box as it offers [performance benefits](https://github.com/nestjs/nest/blob/master/benchmarks/all_output.txt) over Express. But this can be changed to use [Express](https://expressjs.com/) framework instead of Fastify.

For interchangeability:

- Replace the following lines of code in the [main.ts file](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/main.ts) with the ones detailed below.

Fastify:

```ts
// for fastify:
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import * as headers from "fastify-helmet";
import * as fastifyRateLimiter from "fastify-rate-limit";
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: console })
);
app.register(headers);
app.register(fastifyRateLimiter, {
  max: 100,
  timeWindow: "1 minute",
});
```

Express:

```ts
// for express:
import * as headers from "helmet";
import * as rateLimiter from "express-rate-limit";
const app = await NestFactory.create(AppModule, {
  logger: console,
});
app.use(headers());
app.use(
  rateLimiter({
    windowMs: 60, // 1 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  })
);
```

**Note**: The boilerplate comes with production dependencies for both Express and Fastify to support moving between two. But this is going to leave it bloated especially when only **one web framework is used at a time**. Thus, **it is recommended that when deploying to production, unused dependencies are purged.**

If you choose to **use Fastify**, this command will **purge all of the Express dependencies**:

```bash
# removing Express dependencies
$ npm rm @nestjs/platform-express express-rate-limit helmet swagger-ui-express @types/express --save
```

If you choose to **use Express**, this command will **purge all of the Fastify dependencies**:

```bash
# removing Fastify dependencies
$ npm rm @nestjs/platform-fastify fastify-helmet fastify-rate-limit fastify-swagger --save
```

---

### ✅ Testing

#### Docker 🐳

```bash
# unit tests
$ docker exec -it nest yarn test

# e2e tests
$ docker exec -it nest yarn test:e2e

# test coverage
$ docker exec -it nest yarn test:cov
```

#### Non-Docker

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

---
### ✨ Mongoose

Mongoose provides a straight-forward, schema-based solution to model your application data. It includes built-in type casting, validation, query building, business logic hooks and more, out of the box. Please view the [documentation](https://mongoosejs.com) for further details.

The configuration for Mongoose can be found in the [app module](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/modules/app/app.module.ts#L17).

---

### 🔊 Logs

This boilerplate comes with an integrated Winston module for logging, the configurations for Winston can be found in the [app module](https://github.com/msanvarov/nest-rest-mongo-boilerplate/blob/master/src/modules/app/app.module.ts#L27).

---

### 🚨 Troubleshooting

**Port already in use**: If you encounter port conflicts, you can change the port in `src/main.ts` or kill the process using the port:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

**MongoDB connection issues**: Ensure MongoDB is running and accessible at the URL specified in your `.env` file.

**Environment variables**: Make sure all required environment variables are set in your `.env` file.

---

### 🔐 Authentication

- **JWT**: Bearer tokens for protected endpoints.
- **SIWX (Sign In With X)**: Wallet-based auth across chains. See `src/modules/siwx/` and `SIWX_IMPLEMENTATION.md` for flows: create message, verify signature, create session, issue JWT.
- **Twitter OAuth 2.0**: Endpoints under `api/v1/auth/twitter`. See `TWITTER_AUTHENTICATION.md` for PKCE/state, callback handling, and JWT issuance.

Publicly accessible auth-related endpoints (see `AppModule` exclusions):

- `api/v1/auth/login`, `api/v1/auth/register`, `api/v1/auth/admin/login`
- `api/v1/auth/twitter`, `api/v1/auth/twitter/callback`
- SIWX public: `api/v1/user/create-nonce`, `api/v1/user/create-message`, `api/v1/user/verify`, `api/v1/user/verify-payload`

---

### 🧱 Vaults and On-chain Integrations

- **Vault Factory**: Vault configuration and creation.
- **Vault Deposit**: Operations, deposits/redemptions, NAV, and ledger.
- **Vault Insights**: Public vault details, user holdings, fees and history.
- **Helius Stream**: Webhook receiver at `POST /helius-stream/webhook` for Solana events (e.g., vault_created). Signature verified using `HELIUS_WEBHOOK_SECRET`.

See `VAULT_INTEGRATION_GUIDE.md` and `src/modules/helius-stream/README.md` for details.

---

### 📊 Charts and Dashboard

Public endpoints include (selection):

- `api/v1/charts/all`
- `api/v1/charts/vaults/line`
- `api/v1/charts/vault/:id/share-price`
- `api/v1/charts/vault/:id/share-price/history`
- `api/v1/charts/vault/:id/share-price/chart`
- `api/v1/charts/vault/:id/share-price/chart/all`
- Dashboard stats: `api/v1/dashboard/dashboard-statistics`, `api/v1/dashboard/vault-stats`

---

### ⏱️ Cron and Schedules

- Share price cron endpoints:
  - `api/v1/share-price-cron/trigger`
  - `api/v1/share-price-cron/status`
- Additional cron endpoints:
  - `api/v1/cron-job/trigger-price-fetch`
  - `api/v1/cron-job/token-price-history/*`
  - `api/v1/cron-job/vault-tvl-history/*`

`COOLDOWN_PERIOD` and `CRON_JOB_INTERVAL` control cadence.

---

### 🗄️ Caching and Redis

- Redis module available under `src/utils/redis` and `src/modules/redis`.
- Cache manager integration for performance and rate limiting backing store.

---

### 🪵 Logging

- Winston with daily rotate files:
  - `logs/application-%DATE%.log` (14 days, 20MB)
  - `logs/error-%DATE%.log` (30 days, 20MB)
  - Static: `logs/combined.log`, `logs/error.log`
- Structured JSON logs with timestamps; level depends on `APP_ENV`.

---

### 🌐 Current Runtime Defaults and Endpoints

- Port: `3400`
- Health: `GET /api/health`
- Swagger: `GET /api/docs`
- CORS: derived from `APP_ENV`-specific origin lists; localhost patterns auto-added in local.

Note: Earlier sections reference port 3000 from the original boilerplate. The current code boots on port 3400 while preserving earlier instructions for compatibility.

---

### 📚 Module Docs

- SIWX: `src/modules/siwx/README.md`, `SIWX_IMPLEMENTATION.md`
- Helius Stream: `src/modules/helius-stream/README.md`
- Fees Management: `src/modules/fees-management/README.md`
- Wallet: `src/modules/wallet/README.md`
- Vault Factory/Deposit: `VAULT_INTEGRATION_GUIDE.md`
- Vault Management Fees Cron: `VAULT_MANAGEMENT_FEES_CRON.md`

---
