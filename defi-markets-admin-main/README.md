# DeFi Markets Admin Panel

A comprehensive administrative dashboard for managing DeFi Markets' ETF vault platform, built with modern web technologies and a focus on security and user experience.

## 🎯 Overview

The DeFi Markets Admin Panel provides administrators and operators with powerful tools to:

- Monitor and manage ETF vault operations
- Track platform performance and analytics
- Manage user wallets and permissions
- Configure fees and platform parameters
- Audit system activities and user actions
- Oversee platform health and security

## 🚀 Features

### Core Administration

- **Dashboard Overview**: Real-time platform metrics and health monitoring
- **Vault Management**: Create, pause, and manage ETF vaults
- **Wallet Administration**: Manage treasury wallets and user permissions
- **Fee Configuration**: Set and update platform fees and parameters
- **Audit Logging**: Comprehensive tracking of all administrative actions
- **User Management**: Monitor and manage platform users and operators

### Security & Monitoring

- **Real-time Health Checks**: API status and performance monitoring
- **Activity Tracking**: Detailed audit logs for compliance and security
- **Access Control**: Role-based permissions and authentication
- **Security Monitoring**: Suspicious activity detection and alerts

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: Redux Toolkit + React Redux
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router DOM
- **UI Components**: Radix UI primitives
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation
- **Authentication**: Reown AppKit for Web3 wallet integration
- **Blockchain**: Solana integration via AppKit adapter

## 📦 Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd defi-markets-admin
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
   Navigate to `http://localhost:8082` to access the admin panel.

## 🏗️ Project Structure

```
src/
├── assets/
│   └── hero-bg.jpg
├── components/                      # Reusable UI and domain components
│   ├── admin/
│   │   └── AdminLayout.tsx
│   ├── auth/
│   │   └── Auth.tsx
│   ├── examples/
│   │   └── VaultList.tsx
│   ├── layout/
│   │   ├── Footer.tsx
│   │   └── Navigation.tsx
│   ├── solana/
│   │   ├── Idl/
│   │   │   ├── vaultFactory.ts
│   │   │   └── vaultIdl.json
│   │   └── programIds/
│   │       └── programids.ts
│   ├── ui/                           # shadcn/ui components (subset shown)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dynamic-table.tsx
│   │   ├── vault-card.tsx
│   │   └── ...
│   └── wallet/
│       ├── ConnectButton.tsx
│       ├── wallet.css
│       └── wallet.tsx
├── hooks/
│   ├── use-mobile.tsx
│   ├── use-toast.ts
│   ├── useAppKitDisconnect.ts
│   ├── useAuth.ts
│   ├── useContract.ts
│   ├── useSolanaAuth.ts
│   └── useVaults.ts
├── lib/
│   ├── helpers.ts
│   ├── solana.ts
│   └── utils.ts
├── pages/
│   └── admin/
│       ├── AdminAssets.tsx
│       ├── AdminVaults.tsx
│       ├── AuditLogs.tsx
│       ├── Dashboard.tsx
│       ├── Fees.tsx
│       ├── Login.tsx
│       ├── ManagementFeesAccrued.tsx
│       └── Wallets.tsx
├── services/
│   └── api.ts
├── store/
│   ├── index.ts
│   └── slices/
│       ├── authSlice.ts
│       ├── portfolioSlice.ts
│       ├── uiSlice.ts
│       ├── vaultsSlice.ts
│       └── walletSlice.ts
├── types/
│   ├── appkit.d.ts
│   └── store.ts
├── App.css
├── App.tsx
├── index.css
├── main.tsx
├── vite-env.d.ts
```

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 📘 Admin Panel Pages

### Dashboard

- Fetches overview metrics via `dashboardApi.getStatistics` on mount and every 30s.
- Loads recent actions via `auditApi.getAuditLogs({ limit: 10 })` with a loading state.
- Manual refresh button triggers both requests; displays computed summaries and a basic API health indicator.

### Assets

- Lists assets with server-side pagination via `assetAllocationApi.getAssets({ page, limit, search, type, active })`.
- Filters: search (500ms debounce), type (`crypto`), status (`active`/`inactive`), and clear filters.
- Toggle status per asset via `assetAllocationApi.toggleAssetStatus(id)`; reloads current page after update.
- UX niceties: copy mint address to clipboard with feedback; dynamic badges and table via `DynamicTable`.

### Fees

- Reads current fee config using env `VITE_FEES_ID` → `feesManagementApi.getFees(feesId)`.
- Edit flow guarded by Zod schema: validates ranges and that creator/platform split totals 100%.
- On submit:
  - Loads current on-chain factory info via `useVaultFactory().getFactoryInfo()` to preserve unchanged values.
  - Updates factory fees on-chain via `useVaultFactory().updateFactoryFees(...)` (Anchor program call).
  - Records updates in backend via `feesManagementApi.updateFees(feesId, feesToUpdate)`.
- Shows blockchain transaction in `SuccessPopup`; reloads both current fees and fee history.
- Fee history table fetched with `feeHistoryApi.getFeeHistory({ page, limit })` and paginated.

### Management Fees Accrued

- Retrieves records via `managementFeesApi.getManagementFees({ page, limit })` with pagination.
- Reads live on-chain metrics per vault using `useVaultFactory().readVaultLiveMetrics(vaultIndex)` to show current accrued fees.
- Loads dynamic creator/platform split bps from factory via `getFactoryInfo()`; computes per-row and totals on the fly.
- Distribute action opens confirmation dialog and sends on-chain tx via `distributeAccruedFees(vaultIndex)`; success popup with signature.

### Vaults

- Summary stats via `vaultsStatsApi.getVaultStatistics()`; cards show counts by status.
- Vault list via `vaultsApi.getAll({ page, limit, search })`; 500ms search debounce; client-side status filter.
- Pause/Resume:
  - Requires connected wallet + initialized Anchor program (`useVaultFactory`).
  - Calls `setVaultPaused(vaultIndex, true|false)` on-chain, then updates backend via `vaultsApi.pause(id)`/`vaultsApi.resume(id)`.
  - Shows success popup; refreshes stats and list.
- Featured toggle via `vaultsApi.updateFeatured(id, isFeatured)`; refreshes list and stats.

### Audit Logs

- Fetches logs via `auditApi.getAuditLogs({ page, limit, action, relatedEntity, fromDate, toDate })`.
- Filters: action type, resource type, date range; clear filters resets to defaults and reloads.
- Export CSV uses `exportAuditApi.getAuditLogs(...)` and sanitizes cells to prevent formula injection.
- Paginated table with responsive navigation.

## 🔧 Configuration

The project uses several configuration files:

- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint rules
- `components.json` - shadcn/ui component configuration

## 🔐 Authentication & Security

- **Web3 Wallet Integration**: Connect via Solana wallets
- **Role-based Access Control**: Different permission levels for admins and operators
- **Secure API Communication**: Protected endpoints for sensitive operations
- **Audit Trail**: Complete logging of all administrative actions

## 📱 Responsive Design

The admin panel is fully responsive and optimized for:

- Desktop (1024px+) - Full feature access
- Tablet (768px - 1023px) - Optimized layout
- Mobile (320px - 767px) - Essential functions

## 🎨 Design System

Built with a comprehensive design system featuring:

- Dark theme optimized for admin workflows
- Consistent color palette and typography
- Accessible UI components following WCAG guidelines
- Smooth animations and transitions
- Professional admin interface aesthetics

## 🔗 Dependencies

### Core Dependencies

- React 18 with TypeScript for type safety
- Redux Toolkit for state management
- TanStack Query for server state management
- React Router for navigation
- Radix UI for accessible components

### Blockchain Integration

- Reown AppKit for Web3 functionality
- Solana adapter for blockchain operations
- BS58 for Solana address encoding

### UI & Styling

- Tailwind CSS for utility-first styling
- shadcn/ui for pre-built components
- Lucide React for consistent iconography
- Recharts for data visualization

## ⚠️ Important Notes

- This is an **administrative panel** for DeFi Markets platform operators
- Requires proper authentication and authorization to access
- Designed for internal use by platform administrators
- Includes sensitive financial and operational data

---

## 🔐 Solana Sign-In (SIWS) Flow

The app implements a 4-step Solana Sign-In (Sign-In With Solana) flow used for wallet authentication.

Flow (see `src/hooks/useSolanaAuth.ts` and `src/services/api.ts`):

1. Client requests a server nonce: `POST /user/create-nonce` with `{ address }`.
2. Client requests a message to sign: `POST /user/create-message` with the nonce and SIWS fields.
3. Client formats and signs the message via the connected wallet (`walletProvider.signMessage`).
4. Client verifies the signature: `POST /user/verify-payload`, receives `{ user, token }`.

Token handling

- On success, the JWT is stored in Redux and persisted to `sessionStorage` under both `authToken` and `token` keys.
- Logout clears `sessionStorage` and removes all auth state.

Relevant code

- Redux: `src/store/slices/authSlice.ts` (`setToken`, `clearAuth`, async thunks)
- Hook: `src/hooks/useSolanaAuth.ts` (SIWS orchestration)
- API: `src/services/api.ts` (`getNonce`, `createMessage`, `verifySignature`)

## 👮 Admin Username/Password Login

In addition to wallet auth, there is an admin login path used on `pages/admin/Login.tsx` via `useAuth`:

- `POST /auth/admin/login` with `{ email, password }`
- `GET /auth/admin/verify` to validate token and load profile

All are proxied through `src/services/api.ts` and use the shared `apiRequest` helper.

## 🌐 API Requests & Headers

`src/services/api.ts` centralizes all HTTP calls:

- Prefixes requests with `VITE_API_BASE_URL`
- Automatically attaches `Authorization: Bearer <token>` when `sessionStorage.token` exists
- Parses JSON and throws typed `ApiError` with `status` and optional `code`

Key endpoints used by pages (see `ADMIN_PAGES_API_USAGE.md` for the full list):

- Dashboard: `/dashboard/dashboard-statistics`, `/history`
- Vaults: `/dashboard/vault-statistics`, `/vaults`, `/vaults/:id/status`, `/vaults/:id/featured`
- Assets: `/asset-allocation`, `/asset-allocation/:id/toggle-active`
- Fees: `/fees-management/:feesId`, `/history/fees`
- Audit: `/history`, `/history/export`

## 🔗 Solana, Anchor, and Program Setup

Program IDs and IDL

- Program ID: `src/components/solana/programIds/programids.ts` (e.g., `VAULT_FACTORY_PROGRAM_ID`).
- IDL: `src/components/solana/Idl/vaultFactory.ts` and `vaultIdl.json`.

Anchor program access

- Hook `useAnchorProgram` (`src/hooks/useContract.ts`) creates an `AnchorProvider` using the connected AppKit wallet and `VITE_SOLANA_RPC_URL`.
- `useVaultFactory()` composes `useAnchorProgram` for Vault Factory interactions.

Direct transactions

- `useContract` exposes `executeTransaction`/`callContract` helpers using `@solana/web3.js` and the connected wallet.

RPC and network

- Set `VITE_SOLANA_NETWORK` and `VITE_SOLANA_RPC_URL` (defaults to mainnet URL in code).

## 🧭 State Management Overview

Redux store configuration is in `src/store/index.ts` with slices:

- `authSlice`: token/user state, Solana SIWS state, login/logout, profile
- `walletSlice`: connected wallet, balances, transactions
- `vaultsSlice`, `portfolioSlice`, `uiSlice`: domain states for admin features and UI

## 🧪 Local Development Checklist

1. Create `.env` with `VITE_API_BASE_URL` and AppKit/Solana values.
2. Start backend on matching base URL (`/api` path required).
3. Start the app: `npm run dev` and open `http://localhost:5173`.
4. Use Admin Login or connect a Solana wallet for SIWS.

## 📚 Supplemental Docs

- `ADMIN_PAGES_API_USAGE.md`: page-by-page API calls
- `ANCHOR_INTEGRATION_SUMMARY.md`: high-level Anchor/IDL integration notes
