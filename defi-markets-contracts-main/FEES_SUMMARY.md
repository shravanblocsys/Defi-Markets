## Vault Valuation and Accrued Fees Summary

### What this covers
- Live off-chain GAV/NAV computation using Jupiter prices and on-chain balances
- Accrued management fees formula (matching on-chain program logic)
- Example outputs from recent runs (for quick validation)

### Definitions
- GAV (Gross Asset Value): Vault asset value before deducting accrued management fees
- NAV (Net Asset Value): GAV minus total accrued management fees
- Accrued Management Fees: Fees accumulated since the last accrual based on GAV and time elapsed

### Units and scaling
- All balances and values are in 6-decimal fixed USD lamports (1 lamport = 1e-6 USD)
- Prices from Jupiter are converted to 6-decimal fixed integers: price_scaled = round(usdPrice * 1_000_000)
- Vault stablecoin balance (USDC) is counted 1:1 in 6-decimal USD lamports

### Formulas

1) Asset value (per underlying asset)
   value_usd = floor((asset_balance * price_scaled) / 1_000_000)
   - asset_balance: u64 balance as 6-decimal units
   - price_scaled: u64, USD price scaled by 1e6

2) Gross Asset Value (GAV)
   GAV = stablecoin_balance + sum(value_usd for each underlying asset)

3) Newly Accrued Management Fees
   newly_accrued = floor((GAV * management_fee_bps * elapsed_seconds) / (10_000 * SECONDS_PER_YEAR))
   - management_fee_bps: basis points (e.g., 200 bps = 2%)
   - SECONDS_PER_YEAR = 365 * 24 * 60 * 60

4) Total Accrued Fees
   total_accrued = previously_accrued + newly_accrued

5) Net Asset Value (NAV)
   NAV = GAV - total_accrued

Notes:
- All intermediate arithmetic mirrors the on-chain logic: integer math with floor division.
- The on-chain program treats all balances as 6-decimal fixed units for valuation.

### Example Output (Vault 15)

From a recent run of `read_vault.ts 15` after aligning the price scaling:

- Live Prices (scaled internally to 6 decimals):
  - WSOL: ~$177.069076
  - USDC (Stablecoin): ~$1.000000 (not listed as underlying here)
  - USDT: ~$1.000098
  - ETH (7vf...): ~$3752.889228

- Balances (6-decimal units):
  - Stablecoin (USDC) Balance: 40,000
  - WSOL Balance: 5,457,565
  - USDT Balance: 782,104
  - ETH Balance: 5,180

- Per-asset value_usd:
  - WSOL: value = floor(5,457,565 * 177,069,076 / 1_000_000) = 966,365,991
  - USDT: value = floor(782,104   *   1,000,098 / 1_000_000) =     782,180
  - ETH:  value = floor(5,180     * 3,752,889,228 / 1_000_000) =  19,439,966
  - Stablecoin: 40,000 (counted 1:1)

- GAV
  - GAV = 40,000 + 966,365,991 + 782,180 + 19,439,966 = 986,628,137

- Accrued Fees (management_fee_bps = 200, elapsed example = 284s)
  - newly_accrued = floor(986,628,137 * 200 * 284 / (10,000 * 31,536,000)) = 177
  - previously_accrued (from vault) = 1,223
  - total_accrued = 1,223 + 177 = 1,400

- NAV
  - NAV = 986,628,137 - 1,400 = 986,626,737 (rounded in logs)

These numbers are expected to vary slightly run-to-run due to live price changes and time deltas.

### Operational guidance
- Off-chain reads (no transaction) should use the formulas above with live Jupiter prices.
- On-chain reads (read-only): Call `get_accrued_management_fees` with `update_vault_state = false` to get calculated values without modifying vault state.
- On-chain updates (stateful accrual): Call `get_accrued_management_fees` with `update_vault_state = true` to both return computed values and update `accrued_management_fees_usdc` and `last_fee_accrual_ts`.

### Function Signature
```rust
pub fn get_accrued_management_fees(
    ctx: Context<GetAccruedManagementFees>,
    vault_index: u32,
    asset_prices: Vec<AssetPrice>,
    update_vault_state: bool,  // NEW: true = read-write, false = read-only
) -> Result<AccruedManagementFees>
```


