# Deposit and Redeem (Share-Price Based)

This document explains the updated share-price-based deposit and the program-side redeem flow.

## Overview

- Deposits now mint vault shares vs share price after fees.
  - First deposit only: 1:1 mint after entry fee (establishes initial price).
  - Subsequent deposits: mintedShares = floor(netDeposit * 10^decimals / sharePrice).
- Redeems withdraw underlying pro‑rata by supply, swap to USDC via Jupiter, then finalize to burn shares and pay net USDC after exit fee.
- Share price is provided by the client for deposits; for redeem it’s a UX input to decide how many shares to redeem, but on-chain payout is based on NAV per share (total_assets / total_supply).

## Units

- Stablecoin (USDC) decimals: 6
- Vault token decimals: 6
- Share price is expressed in raw stablecoin units per 1 share.
  - Example: 0.5635 USDC/share → 563500

## Deposit Flow

On-chain instruction: `deposit(vault_index, amount, etf_share_price)`

1) Validate: vault and factory are Active; amount > 0.
2) Accrue management fees for the vault.
3) Calculate entry fee: `entry_fee = amount * entry_fee_bps / 10000`.
4) Net deposit: `deposit_after_fees = amount - entry_fee`.
5) Mint shares:
   - First deposit (`total_supply == 0`): `vault_tokens = deposit_after_fees` (1:1 after fees)
   - Otherwise: `vault_tokens = floor(deposit_after_fees * 10^decimals / etf_share_price)`
6) Transfer `entry_fee` from user → factory fee recipient.
7) Transfer `deposit_after_fees` from user → vault USDC PDA.
8) Update state: `total_assets += deposit_after_fees`, `total_supply += vault_tokens`.
9) Mint `vault_tokens` to user.

### Deposit Examples

Assumptions: entry fee = 25 bps (0.25%), decimals = 6.

- First deposit (1:1 after fees)
  - Input: amount = 10,000,000 (10 USDC)
  - Entry fee: 10,000,000 × 25 / 10,000 = 25,000
  - Net deposit: 9,975,000
  - total_supply before = 0 → minted = 9,975,000 (9.975000 shares)

- Subsequent deposit (vs share price)
  - Input: amount = 10,000,000 (10 USDC), share price = 563,500 (0.5635 USDC/share)
  - Entry fee: 25,000 → net deposit: 9,975,000
  - Minted: floor(9,975,000 × 1,000,000 / 563,500) = 17,701,863 (≈ 17.701863 shares)

### CLI Usage (Program-Side Deposit)

- Script: `deposit_program_side.ts`
- Usage: `npx ts-node deposit_program_side.ts <vaultIndex> <amountRaw> <sharePriceRaw>`
- Example: `npx ts-node deposit_program_side.ts 11 10000000 563500`
  - 10 USDC deposit with share price 0.5635 USDC/share

Other callers were updated as well:
- `deposit_jup.ts` now accepts an optional share price
- `deposit.ts` updated method signature accordingly

## Redeem Flow (Program-Side)

Redeem is executed by the client in three steps:

1) Withdraw underlying pro‑rata:
   - For each asset: `amount = vault_token_amount * vault_asset_balance / total_supply`
   - Use on-chain instruction `withdrawUnderlyingToUser` per asset.
2) Swap withdrawn assets to USDC via Jupiter (destination = vault USDC PDA).
3) Finalize:
   - Call `finalizeRedeem(vault_index, vault_token_amount)`
   - On-chain computes NAV share: `user_share_usdc = vault_token_amount * total_assets / total_supply`
   - Applies exit fee; transfers net USDC to user; burns vault tokens; updates state.

### Redeem Example

Assumptions:
- exit fee = 25 bps; decimals = 6
- User wants to redeem 17.701863 shares → 17,701,863 raw
- Current share price (UX estimate) = 0.5635 USDC/share → target ≈ 9.975 USDC
- Vault state (illustrative):
  - total_supply = 100,000,000
  - vault USDC-equivalent NAV (total_assets) = 100,000,000
  - Balances:
    - WSOL: 30,000,000
    - USDT: 50,000,000
    - ETH: 20,000,000

Steps:
- Pro‑rata amounts to withdraw:
  - WSOL: 17,701,863 × 30,000,000 / 100,000,000 = 5,310,558
  - USDT: 17,701,863 × 50,000,000 / 100,000,000 = 8,850,931
  - ETH: 17,701,863 × 20,000,000 / 100,000,000 = 3,540,374
- Swap each to USDC via Jupiter, destination = vault USDC PDA.
- Finalize:
  - user_share_usdc ≈ 9,975,000 (pre-fee)
  - exit fee: 9,975,000 × 25 / 10,000 = 24,937
  - net to user ≈ 9,950,063 USDC

Note: Final payout is determined by on-chain NAV per share at finalize time, not by the client-provided share price. The share price is a UX aid to choose how many shares to redeem to target a USDC outcome.

### CLI Usage (Program-Side Redeem)

- Script: `redeem_program_side.ts`
- Usage: `npx ts-node redeem_program_side.ts <vault_index> <vault_token_amount_raw>`
- Example: `npx ts-node redeem_program_side.ts 11 17701863`

The script:
- Fetches the vault’s `underlyingAssets` dynamically
- Withdraws each underlying pro‑rata
- Swaps assets → USDC (to the vault USDC PDA)
- Calls `finalizeRedeem` to burn and pay the user

## Dev Notes

- On-chain changes:
  - `deposit` signature: `(vault_index, amount, etf_share_price)`
  - First deposit remains 1:1 after fees; subsequent deposits use share price
- Client scripts updated:
  - `deposit_program_side.ts`, `deposit_jup.ts`, `deposit.ts`
  - `redeem_program_side.ts` uses dynamic underlying assets and the full redeem flow
