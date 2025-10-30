## GAV and NAV Documentation

### Overview
This document explains how Gross Asset Value (GAV) and Net Asset Value (NAV) are derived for vaults in this service, along with the API endpoint to fetch the computed values.

### Definitions
- **GAV (Gross Asset Value)**: Total value of all underlying assets in the vault using current market prices.
- **NAV (Net Asset Value)**: GAV after deducting management fees.

### Formulas
- GAV: \( \text{GAV} = \sum_{i}(\text{assetQuantity}_i \times \text{assetPrice}_i) \)
- NAV: \( \text{NAV} = \text{GAV} - (\text{GAV} \times \tfrac{\text{fee\%}}{100}) \)
- Total Fees: \( \text{TotalFees} = \text{GAV} - \text{NAV} \)

### Inputs and Sources
- Underlying assets and quantities are obtained from the vault configuration and user holdings where applicable.
- Asset prices are fetched from external price sources (e.g., Jupiter) used within `vault-insights`.
- Fee percentage is read from the vault configuration (e.g., `managementFeeBps`), where basis points (bps) are converted to percentage as `fee% = managementFeeBps / 100`.

### API Endpoint
Fetch GAV/NAV for a vault:

```
GET /vault-insights/gav-nav/:id
```

Path params:
- `id`: Vault ID

Optional authenticated context may provide a `userId` to refine holdings.

### Response Schema (GavNavDto)
```
{
  grossAssetValue: number,
  netAssetValue: number
  // Future fields (when enabled): totalFees, feePercentage
}
```

### Example
Assume a vault holds:
- 2.0 SOL at $150.00
- 1000.0 USDC at $1.00

Then:
- GAV = (2 × 150) + (1000 × 1) = 300 + 1000 = 1300
- If management fee is 150 bps (1.5%): NAV = 1300 − (1300 × 0.015) = 1300 − 19.5 = 1280.5
- Total Fees = 19.5

### Notes
- If a vault has no underlying assets, both GAV and NAV return 0.
- If fees are not configured, the fee percentage defaults to 0, so NAV equals GAV.
- Precision and rounding depend on price source precision and internal numeric handling.

### Related Implementation
- Controller: `src/modules/vault-insights/vault-insights.controller.ts` → `GET /gav-nav/:id`
- Service: `src/modules/vault-insights/vault-insights.service.ts` → `getGavNav(vaultId, userId?)`


