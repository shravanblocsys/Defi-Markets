### Admin Pages API Usage

This document summarizes the REST APIs used by the admin pages under `src/pages/admin` in `defi-markets-admin`.

#### Dashboard (`Dashboard.tsx`)
- Uses `dashboardApi.getStatistics` → GET `/dashboard/dashboard-statistics`
- Uses `auditApi.getAuditLogs` → GET `/history?limit=10`

#### Vault Management (`AdminVaults.tsx`)
- Uses `vaultsStatsApi.getVaultStatistics` → GET `/dashboard/vault-statistics`
- Uses `vaultsApi.getAll` → GET `/vaults?{page,limit,search}`
- Uses `vaultsApi.pause` → PATCH `/vaults/:vaultId/status` body `{ status: "paused" }`
- Uses `vaultsApi.resume` → PATCH `/vaults/:vaultId/status` body `{ status: "active" }`
- Uses `vaultsApi.updateFeatured` → PATCH `/vaults/:vaultId/featured` body `{ isFeaturedVault }`

#### Asset Management (`AdminAssets.tsx`)
- Uses `assetAllocationApi.getAssets` → GET `/asset-allocation?{page,limit,search,type,active}`
- Uses `assetAllocationApi.toggleAssetStatus` → PATCH `/asset-allocation/:id/toggle-active`

#### Fee Management (`Fees.tsx`)
- Uses `feesManagementApi.getFees` → GET `/fees-management/:feesId`
- Uses `feesManagementApi.updateFees` → PUT `/fees-management/:feesId` body `{ fees: [...] }`
- Uses `feeHistoryApi.getFeeHistory` → GET `/history/fees?{page,limit}`

#### Audit Logs (`AuditLogs.tsx`)
- Uses `auditApi.getAuditLogs` → GET `/history?{page,limit,action,fromDate,toDate,search,relatedEntity}`
- Uses `exportAuditApi.getAuditLogs` → GET `/history/export?{action,fromDate,toDate,relatedEntity}`

#### Login (`Login.tsx` via `useAuth`)
- Uses `authApi.adminLogin` → POST `/auth/admin/login` body `{ email, password }`
- Uses `authApi.adminVerify` → GET `/auth/admin/verify`

#### Wallets (`Wallets.tsx`)
- No backend API calls (local mocked state for demo)

Notes
- All requests are sent via the shared `apiRequest` helper, which prefixes the base URL from `VITE_API_BASE_URL` (defaults to `http://localhost:3001/api`) and attaches the `Authorization: Bearer <token>` header when a token exists in `sessionStorage`.

