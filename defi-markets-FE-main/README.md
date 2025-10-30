# DeFi Markets - Permissionless ETF Vault Platform

A modern, decentralized platform for creating and managing permissionless ETF vaults with institutional-grade infrastructure.

## 🚀 Features

- **Permissionless Vault Creation**: Create and deploy custom ETF vaults without restrictions
- **Smart Asset Allocation**: Automated asset allocation and rebalancing for optimal performance
- **Instant Liquidity**: Seamlessly swap between assets using integrated DEX aggregators
- **Portfolio Management**: Track and manage your diversified DeFi portfolios
- **Real-time Analytics**: Monitor vault performance with comprehensive dashboards

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router DOM
- **UI Components**: Radix UI primitives
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation

## 📦 Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd defi-markets-FE
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   bun install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   # or
   bun dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:8080` to view the application.

## 🗂️ Project Structure

```
src/
├── components/
│   ├── layout/                 # Navigation, Footer
│   ├── portfolio/              # Portfolio charts and KPIs
│   ├── skeleton/               # Loading skeletons for tabs/cards
│   ├── solana/                 # Program IDs and IDL references
│   ├── ui/                     # shadcn/ui primitives and custom UI
│   ├── vault/                  # Vault details tabs (Overview, Fees, Activity, etc.)
│   └── wallet/                 # Wallet Connect button and setup
├── pages/                      # Route pages (Vaults, CreateVault, VaultDetails, Portfolio,etc.)
├── services/                   # API clients (api.ts, bitqueryService.ts, vaultDataService.ts)
├── store/                      # Redux store and slices (with redux-persist)
├── hooks/                      # Custom hooks (auth init, contract, etc.)
└── lib/                        # Utilities and helpers
```

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 🎯 Key Pages

- **Home**: Landing page with platform overview and featured vaults
- **Create Vault**: Interface for creating new ETF vaults with asset allocation
- **Vaults**: Browse and interact with existing vaults
- **Portfolio**: Personal portfolio dashboard with performance metrics

## 🔧 Configuration

The project uses several configuration files:

- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint rules

## 🔑 Environment Variables

Create a `.env` in the project root (values shown are examples/defaults):

```
# API
VITE_API_BASE_URL=http://0.0.0.0:3400/api/v1

VITE_FEES_ID=

VITE_SOLANA_NETWORK=mainnet-beta  # or devnet

# Solana Programs
VITE_VAULT_FACTORY_PROGRAM_ID=

# RPC config (used by src/lib/solana.ts)
# Option A: Use Helius (recommended)
VITE_HELIUS_API_KEY=

# Option B: Custom RPC overrides (takes precedence if set)
VITE_MAINNET_RPC_URL=
VITE_DEVNET_RPC_URL=https://api.devnet.solana.com/

#Twitter connect api
VITE_BASE_URL= (backend URL)

```

## 🔗 Backend Proxy & Dev Server

- Dev server is configured in `vite.config.ts` to run on port `8080`.
- API requests to `/api` are proxied to `http://0.0.0.0:3400` during development.
- If the port differs from the note above, prefer the value from `vite.config.ts`.

## 📱 Responsive Design

The application is fully responsive and optimized for:

- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (320px - 767px)

## 🎨 Design System

Built with a comprehensive design system featuring:

- Dark theme by default
- Consistent color palette and typography
- Accessible UI components
- Smooth animations and transitions

## 🧩 State & Data Layer

- React Query for server-state fetching and caching
- Redux Toolkit for app/UI/wallet state
- redux-persist to persist selected slices across reloads
- Slices in `src/store/slices/`: `authSlice`, `walletSlice`, `vaultsSlice`, `portfolioSlice`, `chartSlice`, `uiSlice`

## 🪪 Wallet & Authentication

- Wallet connection via Reown AppKit (WalletConnect) with Solana-specific adapter
- Sign-In with Solana (SIWS) 4-step flow supported by backend APIs
- JWT stored in `sessionStorage` and attached as `Authorization` header for authenticated requests

## 🧠 Solana Integration

- Uses `@solana/web3.js`, `@solana/spl-token` and Anchor (`@coral-xyz/anchor`)
- Program IDs supplied via environment variables; default IDs provided for convenience
- Program/IDL references in `src/components/solana/`
  - `solana/Idl/vaultIdl.json`, `solana/Idl/vaultFactory.ts`
  - `solana/programIds/programids.ts` (program IDs, token mints)
- Vault creation UX implemented in `src/pages/CreateVault.tsx` with clean implementation documented in `VAULT_CREATION_CLEAN_IMPLEMENTATION.md`

```
## 📘 API Documentation

For endpoint details, request/response schemas, and auth flow, see:

- `API_INTEGRATION_README.md` (comprehensive frontend API integration guide)
- `VAULT_CREATION_README.md` and `VAULT_CREATION_CLEAN_IMPLEMENTATION.md` (vault creation via Solana programs)

```

## 🔗 Links

- [Live Demo](https://app.defimarkets.finance/)
   - Note: Live Demo is secured by a login, use below credentials to access the application at the start
   - Username: defi-market
   - Password: DfmEtf#2025      
