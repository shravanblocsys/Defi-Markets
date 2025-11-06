# ETF Vaults - Solana Smart Contracts

A comprehensive DeFi ETF vault system built on Solana using the Anchor framework. This repository contains a single on-chain program that includes both the Vault Factory (global registry/configuration) and ETF Vaults (per‑vault logic). Supporting TypeScript scripts provide CLI workflows for creation, share‑price deposits, client-side Jupiter swaps, and redemption.

## 🏗️ Architecture

### Vault Factory (in-program module)
- Purpose: Manage global settings and creation of ETF vaults
- Features:
  - Initialize factory (admin, fee recipient, fee bounds/ratios)
  - Create vaults with underlying asset allocations
    - Returns the new Vault PDA (the on-chain “vault contract” address)
  - Update factory fee parameters
  - Pause/resume specific vaults
  - Track vault count

### ETF Vaults (created by the factory module; each vault is a PDA within the same program)
- Purpose: Per-vault accounting, deposits, and redemptions
- Features:
  - allocation BPS, management fee
  - Deposit stablecoins for ETF shares
    - First deposit: 1:1 after fees (price discovery)
    - Subsequent: share‑price based minting
  - Program-side redeem: withdraw pro‑rata → Jupiter swaps → finalize (NAV payout minus exit fee)
  - Continuous management fee accrual and distribution
  - Pause/unpause per vault

## 📁 Project Structure

```
defi-markets-contracts/
├── programs/vault-mvp/src/
│   ├── lib.rs            # Program entry
│   ├── contexts.rs       # Accounts
│   ├── instructions.rs   # Business logic
│   ├── state.rs          # Factory/Vault structs
│   ├── constants.rs      # Limits/constants
│   ├── errors.rs         # Errors
│   └── events.rs         # Events
├── script.ts             # CLI (create-token, init, create, deposit-simple, etc.)
├── deposit_program_side.ts
├── redeem_program_side.ts
├── deposit_jup.ts
├── TESTING-DEPOSIT-SHARE-PRICE.md
├── Anchor.toml
└── target/idl/vault_mvp.json
```

## 🚀 Getting Started

Prereqs: Rust toolchain, Solana CLI 1.18.x, Anchor CLI 0.31.1, Node.js 18+

Install & build:
```bash
npm install
anchor build
```

Optional deploy:
```bash
anchor deploy
```

## 🔧 Configuration

Anchor.toml provider example:
```toml
[provider]
cluster = "devnet"  # localnet | devnet | testnet | mainnet-beta
wallet  = "~/.config/solana/id.json"
```

Program IDs:
- Vault MVP Program: `BHTRWbEGRfJZSVXkJXj1Cv48knuALpUvijJwvuobyvvB`
- Jupiter (client swaps): `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
## 1) High-Level Architecture

- Factory (PDA): Global registry and fee configuration.
- Vault (PDA): One per product; owns a mint (vault token) and treasuries (stablecoin and asset ATAs).
- Vault Token Mint (PDA): SPL mint for ETF shares (6 decimals).
- Vault Stablecoin Account (PDA): SPL token account for deposits/redemptions (USDC-like, 6 decimals).
- Underlying Asset ATAs (vault-owned): One per configured asset.

Files in `programs/vault-mvp/src/`:
- `lib.rs`: Program entry; exports instructions.
- `instructions.rs`: Business logic for all instructions.
- `contexts.rs`: Accounts for each instruction (seeds, constraints).
- `state.rs`: Persistent data structures (Factory, Vault, etc.).
- `constants.rs`: Limits and numeric constants.
- `errors.rs`: Custom error codes.
- `events.rs`: Emitted events (create, deposit, redeem, fees, etc.).

PDA seeds:
- Factory: `["factory_v2"]`
- Vault: `["vault", factory, vault_index_le_bytes]`
- Vault Mint: `["vault_mint", vault]`
- Vault Stablecoin: `["vault_stablecoin_account", vault]`
- Vault Token Account (internal): `["vault_token_account", vault]`

## 2) Core Data Structures (state.rs)

- Factory
  - `admin`, `fee_recipient`, `vault_count`, `state`
  - Fee params: `entry_fee_bps`, `exit_fee_bps`, `vault_creation_fee_usdc`
  - Management fee bounds: `min_management_fee_bps`, `max_management_fee_bps`
  - Fee distribution ratios: `vault_creator_fee_ratio_bps`, `platform_fee_ratio_bps`

- Vault
  - `factory`, `vault_index`, `admin`, `vault_name`, `vault_symbol`
  - `underlying_assets: Vec<UnderlyingAsset> { mint_address, mint_bps }`
  - `management_fees` (bps), `state`
  - Accounting: `total_assets`, `total_supply`
  - Fee accrual: `last_fee_accrual_ts`, `accrued_management_fees_usdc`

## 3) Instruction Catalog (lib.rs + instructions.rs)

Factory lifecycle
- `initialize_factory(...)`: Configure admin, fee recipient, fee ranges and ratios.
- `update_factory_fees(...)`: Update factory fee parameters.
- `get_factory_info() -> FactoryInfo`: Read-only snapshot.

Vault lifecycle
- `create_vault(vault_name, vault_symbol, underlying_assets, management_fees)`
  - Validates BPS sum = 10_000; sets fees/metadata; creates PDAs; charges creation fee.
  - Outputs/derives:
    - Vault PDA (acts as the vault contract address)
    - Vault Mint PDA (ETF share mint)
    - Vault Stablecoin PDA (created lazily on first deposit)
- `set_vault_paused(vault_index, paused)`

Deposits (share-price aware)
- `deposit(vault_index, amount, etf_share_price)`
  - Accrues management fees.
  - Entry fee `entry_fee = amount * entry_fee_bps / 10_000`.
  - Net = `amount - entry_fee`.
  - Mint calculation:
    - First deposit (`total_supply == 0`): mint `net` (1:1 after fees).
    - Subsequent deposits: `minted = floor(net * 10^decimals / etf_share_price)`.
  - Transfers `entry_fee` to factory fee recipient; transfers `net` to vault stablecoin PDA; updates `total_assets`/`total_supply`; mints `minted` to user; emits `DepositEvent`.
- `get_deposit_details(vault_index) -> DepositDetails` (read-only)

Swaps & flows
- `execute_swaps(vault_index)` – placeholder validator (Jupiter swaps are executed by the client).
- `transfer_vault_to_user(vault_index, amount)` – moves USDC from vault PDA to authorized user (admin/factory) for off-program swap workflows.
- `withdraw_underlying_to_user(vault_index, amount)` – vault → user transfer for a specified asset ATA (per-asset withdraws).

Redemption
- Program-side recommended flow (client orchestrated):
  1) For each asset: compute pro‑rata = `user_tokens * vault_asset_balance / total_supply`, call `withdraw_underlying_to_user`, then Jupiter swap asset→USDC with destination = vault USDC PDA.
  2) `finalize_redeem(vault_index, vault_token_amount)` computes NAV payout: `user_share_usdc = (vault_tokens * total_assets) / total_supply`, applies exit fee, burns tokens, updates totals, pays net USDC to user, emits `RedeemEvent`.
- `redeem(...)` (single-instruction path) exists but program-side flow is preferred for large/complex swaps.

Fee accrual & distribution
- Continuous accrual captured in `accrue_management_fees(vault)` (time-based proportion of NAV; accounting done in USDC terms).
- `collect_weekly_management_fees(vault_index)` – transfers accrued USDC from vault stablecoin PDA according to configured ratios (creator/platform), using signer seeds.
- `get_accrued_management_fees(vault_index, asset_prices[])` – calculates GAV/NAV from live balances and provided prices, updates accrual.
- `distribute_accrued_fees(vault_index)` – mints vault tokens to fee recipients in proportion to accrued fees (aligning incentives), updates `total_supply`, resets accrued.

## 4) Account Contexts (contexts.rs)

Each instruction defines a typed accounts struct with:
- PDA derivations (`seeds`, `bump`), mutability, and basic constraints.
- Stablecoin/vault token accounts and required signers.
- Optional `jupiter_program` account in deposit/redeem contexts (for client CPI compatibility or validations).

## 5) End-to-End Flows

Deposit (no swaps)
1) User calls `deposit(vault_index, amount, etf_share_price)`.
2) Program deducts entry fee, transfers net to vault stablecoin PDA, calculates minted per rules, updates totals, mints shares, emits event.
3) Optionally later, admin runs swaps (off-program) to purchase underlying.

Deposit (program-side with Jupiter)
1) User deposits (as above).
2) Client builds Jupiter routes per asset BPS; either:
   - Uses `transfer_vault_to_user` to retrieve USDC then swap (result to vault ATAs), or
   - Prepares CPI-compatible accounts and swaps directly to vault ATAs.

Redeem (program-side)
1) Client computes and withdraws pro‑rata underlying with `withdraw_underlying_to_user`.
2) Client swaps underlying→USDC via Jupiter with destination = vault USDC PDA.
3) Client calls `finalize_redeem(vault_index, vault_token_amount)` to burn and pay user (NAV-based; exit fee applied).

## 6) Fees & Token Economics

- Decimals: stablecoin and vault token use 6 decimals.
- Entry fee: deducted on deposit; sent to factory fee recipient.
- Exit fee: deducted on redemption; sent to fee recipient.
- Management fees: accrued over time against NAV; collected periodically or distributed as vault tokens.
- First deposit: price discovery; 1:1 mint after fees.
- Subsequent deposits: minted vs provided share price (`minted = floor(net * 10^6 / price_raw)`).

## 7) Events (events.rs)

Key events include: `FactoryInitialized`, `VaultCreated`, `FactoryFeesUpdated`, `DepositEvent`, `RedeemEvent`, `AccruedFeesDistributed`, `VaultPaused/Resumed`. Use logs to audit state transitions and amounts.

## 8) Scripts & Testing

Top-level scripts (TypeScript):
- `script.ts` – utility CLI (create-token, init, create, deposit-simple, fees, etc.).
- `deposit_program_side.ts` – deposit then program-side swaps per allocation (Jupiter).
- `redeem_program_side.ts` – withdraw pro‑rata, Jupiter swaps to USDC (to vault PDA), finalize redeem.
- `deposit_jup.ts` – alternative deposit+Jupiter helper.

Quick validation (no swaps):
- First deposit (price=0): `npx ts-node script.ts deposit-simple <vault_index> 10000000 0`
- Later deposits (price>0): `npx ts-node script.ts deposit-simple <vault_index> 10000000 563500`

See `TESTING-DEPOSIT-SHARE-PRICE.md` for worked examples and tx hashes.

## 9) Configuration & Limits (constants.rs)

- `MAX_BPS = 10_000` (100%).
- Fee limits: `MAX_ENTRY_EXIT_BPS_LIMIT`, `MAX_MANAGEMENT_BPS_LIMIT`.
- Name/symbol max lengths; underlying assets count bounds.

## 10) Security Model

- PDA authority for sensitive transfers and minting.
- State gating (`Active`/`Paused`/`Closed`) on factory and vault.
- BPS sum validation for asset allocations.
- Authorization checks (factory/vault admin where applicable).

## 11) Deployment & Tooling

Build/deploy with Anchor:
```bash
anchor build
anchor deploy
```
Scripts:
```bash
npx ts-node script.ts <command>
```

## 12) Troubleshooting

- Invalid public key: verify hardcoded program IDs (e.g., Jupiter: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`).
- TokenAccountNotFound: run `create-token` first to ensure a funded stablecoin ATA before `create`.
- First deposit must pass `etf_share_price = 0`; subsequent deposits must pass a positive price.

### 1. Factory Management

#### `initialize_factory`
Initializes the factory with fee parameters and admin settings.

**Parameters:**
- `entry_fee_bps`: Entry fee in basis points (0-10000)
- `exit_fee_bps`: Exit fee in basis points (0-10000)
- `vault_creation_fee_usdc`: Fee for creating new vaults
- `min_management_fee_bps`: Minimum management fee
- `max_management_fee_bps`: Maximum management fee

**Accounts:**
- `admin`: Factory admin (signer)
- `factory`: Factory PDA
- `fee_recipient`: Address to receive fees
- `system_program`: System program

#### `update_factory_fees`
Updates factory fee parameters (only admin can call this).

**Parameters:**
- `entry_fee_bps`: New entry fee in basis points (0-10000)
- `exit_fee_bps`: New exit fee in basis points (0-10000)
- `vault_creation_fee_usdc`: New vault creation fee in USDC
- `min_management_fee_bps`: New minimum management fee in basis points
- `max_management_fee_bps`: New maximum management fee in basis points

**Accounts:**
- `admin`: Factory admin (signer, must match factory admin)
- `factory`: Factory PDA (mutable)

**Validation:**
- Entry and exit fees must be ≤ 1000 basis points (10%)
- Min management fee must be ≤ max management fee
- Max management fee must be ≤ 2000 basis points (20%)
- Admin must match factory admin (authorization check)

**Process:**
1. Validates all fee parameters within limits
2. Updates factory fee parameters
3. Emits `FactoryFeesUpdated` event with new parameters
4. Returns success

#### `get_factory_info`
Retrieves comprehensive factory information.

**Returns:** `FactoryInfo` struct with:
- Factory address, admin, fee recipient
- Vault count and state
- All fee parameters

### 2. Vault Management

#### `create_vault`
Creates a new vault with specified underlying assets and management fees.

**Parameters:**
- `vault_name`: Name of the vault (max 50 chars)
- `vault_symbol`: Symbol of the vault (max 10 chars)
- `underlying_assets`: Array of underlying assets with allocation percentages
- `management_fees`: Management fee in basis points

**Accounts:**
- `admin`: Vault creator (signer)
- `factory`: Factory PDA
- `vault`: Vault PDA
- `vault_mint`: Vault token mint PDA
- `vault_token_account`: Vault's token account PDA
- `token_program`: SPL Token program
- `system_program`: System program
- `rent`: Rent sysvar

**Validation:**
- Vault name/symbol length limits
- Underlying assets BPS sum must equal 10000 (100%)
- Management fees within allowed range

#### `get_vault_by_index`
Retrieves vault information by index.

**Parameters:**
- `vault_index`: Index of the vault to retrieve

**Returns:** `VaultInfo` struct with:
- Vault address, index, name, symbol
- Admin, state, total assets/supply
- Creation timestamp

#### `update_vault_management_fees`
Updates vault management fees (only vault admin can call this).

**Parameters:**
- `vault_index`: Index of the vault to update
- `new_management_fees`: New management fee in basis points

**Accounts:**
- `admin`: Vault admin (signer, must match vault admin)
- `factory`: Factory PDA
- `vault`: Vault PDA (mutable)
- `system_program`: System program

**Validation:**
- New management fees must be within factory limits (min ≤ fees ≤ max)
- Factory and vault must be active
- Admin must match vault admin (authorization check)

**Process:**
1. Validates new management fees are within factory limits
2. Ensures factory and vault are active
3. Updates vault management fees
4. Emits `VaultManagementFeesUpdated` event with old and new fees
5. Returns success

#### `update_vault_underlying_assets`
Updates vault underlying assets (only vault admin can call this).

**Parameters:**
- `vault_index`: Index of the vault to update
- `new_underlying_assets`: Array of new underlying assets with allocation percentages

**Accounts:**
- `admin`: Vault admin (signer, must match vault admin)
- `factory`: Factory PDA
- `vault`: Vault PDA (mutable)
- `system_program`: System program

**Validation:**
- New assets must be 1-10 assets (within limits)
- Asset allocation BPS must sum to 10000 (100%)
- Factory and vault must be active
- Admin must match vault admin (authorization check)

**Process:**
1. Validates new underlying assets configuration
2. Ensures asset allocation sums to 100%
3. Ensures factory and vault are active
4. Updates vault underlying assets
5. Emits `VaultUnderlyingAssetsUpdated` event with old and new assets
6. Returns success

### 3. Deposit System (Share-Price Aware)

#### `deposit`
Deposits stablecoin tokens into a vault and mints vault tokens based on share-price logic.

**Parameters:**
- `vault_index`: Index of the target vault
- `amount`: Amount of stablecoin to deposit (raw units)
- `etf_share_price`: Stablecoin units per 1 share (raw units; 0 for first deposit)

**Accounts:**
- `user`: Depositor (signer)
- `factory`: Factory PDA
- `vault`: Vault PDA
- `vault_mint`: Vault token mint PDA
- `user_stablecoin_account`: User's stablecoin token account
- `stablecoin_mint`: Stablecoin mint account
- `vault_stablecoin_account`: Vault's stablecoin token account PDA
- `user_vault_account`: User's vault token account
- `fee_recipient_stablecoin_account`: Fee recipient's stablecoin account
- `vault_admin_stablecoin_account`: Vault admin's stablecoin account (for management fees)
- `token_program`: SPL Token program
- `system_program`: System program

**Process:**
1. Accrues management fees on the vault.
2. Validates vault and factory are active; `amount > 0`.
3. Calculates entry fee; `net = amount - entry_fee`.
4. Transfers entry fee to factory fee recipient.
5. Transfers `net` stablecoin to the vault stablecoin PDA.
6. Mint calculation:
   - If `total_supply == 0`: mint `net` (1:1 after fees).
   - Else: `minted = floor(net * 10^decimals / etf_share_price)`.
7. Updates vault: `total_assets += net`, `total_supply += minted`.
8. Mints `minted` vault tokens to user.
9. Emits `DepositEvent` with amounts and minted tokens.

#### `get_deposit_details`
Retrieves comprehensive deposit information for a user and vault.

**Parameters:**
- `vault_index`: Index of the vault

**Returns:** `DepositDetails` struct with:
- Vault information (address, name, symbol, state)
- User information (address, vault token balance)
- Vault balances (total assets, total supply, stablecoin balance)
- Stablecoin mint information
- Creation timestamp

### 4. Redeem System (Program-Side Flow)

#### Program-side redeem (recommended)
Client orchestrates withdraw and swaps, then finalizes on-chain.

High-level steps:
- Compute pro‑rata for each underlying: `amount = user_vault_tokens * vault_asset_balance / total_supply`.
- Call `withdrawUnderlyingToUser` per asset, then swap to USDC via Jupiter with destination set to vault USDC PDA.
- Call on-chain `finalize_redeem(vault_index, vault_token_amount)` to burn tokens, apply exit fee, and pay net USDC to user.

**Accounts:**
- `user`: Redeemer (signer)
- `factory`: Factory PDA
- `vault`: Vault PDA
- `vault_mint`: Vault token mint PDA
- `user_vault_account`: User's vault token account (to burn tokens from)
- `user_stablecoin_account`: User's stablecoin token account (to receive stablecoin)
- `stablecoin_mint`: Stablecoin mint account
- `vault_stablecoin_account`: Vault's stablecoin token account PDA
- `fee_recipient_stablecoin_account`: Fee recipient's stablecoin account
- `vault_admin_stablecoin_account`: Vault admin's stablecoin account (for management fees)
- `token_program`: SPL Token program
- `system_program`: System program

On-chain `finalize_redeem` computes payout by NAV: `user_share_usdc = vault_tokens * total_assets / total_supply`, applies exit fee, transfers net USDC, burns tokens, updates state, and emits event.

**Fee Calculation:**
- **Exit Fee**: `(vault_token_amount * factory.exit_fee_bps) / 10000`
- **Management Fee**: `(vault_token_amount * vault.management_fees) / 10000`
- **Total Fees**: `exit_fee + management_fee`
- **Net Stablecoin**: `vault_token_amount - total_fees`

## 🛠️ Script Functions (script.ts)

### 1. Token Management

#### `createStablecoinToken()`
Creates a new stablecoin token (like USDC) for testing.

**Features:**
- Creates mint with 6 decimals
- Mints 100,000,000 tokens
- Creates token account for admin
- Returns mint and token account addresses

### 2. Factory Operations

#### `initializeFactory()`
Initializes the factory with default parameters.

**Default Settings:**
- Entry fee: 25 basis points (0.25%)
- Exit fee: 25 basis points (0.25%)
- Vault creation fee: 10 USDC
- Management fee range: 50-300 basis points

#### `getFactoryInfo(factoryPDA)`
Retrieves and displays factory information.

#### `updateFactoryFees(factoryPDA, newFees)`
Updates factory fee parameters (admin only).

**Parameters:**
- `factoryPDA`: Factory PDA address
- `newFees`: Object containing new fee parameters:
  - `entry_fee_bps`: New entry fee in basis points
  - `exit_fee_bps`: New exit fee in basis points
  - `vault_creation_fee_usdc`: New vault creation fee in USDC
  - `min_management_fee_bps`: New minimum management fee
  - `max_management_fee_bps`: New maximum management fee

**Features:**
- Validates all fee parameters within allowed limits
- Updates factory state with new fees
- Emits `FactoryFeesUpdated` event
- Only factory admin can call this function

### 3. Vault Operations

#### `createVault(factoryPDA)`
Creates a new vault with random name and symbol.

**Features:**
- Generates random vault name and symbol
- Uses 60% SOL, 40% USDC allocation
- Sets 1% management fee
- Returns vault PDA

#### `getVaultByIndex(factoryPDA, vaultIndex)`
Retrieves specific vault information by index.

#### `getAllVaults(factoryPDA)`
Retrieves information for all vaults in the factory.

### 4. Deposit Operations

#### `depositIntoVault(factoryPDA, vaultIndex, amount)`
Handles the complete deposit process.

**Process:**
1. **Account Setup:**
   - Gets/creates user's stablecoin token account
   - Gets/creates user's vault token account
   - Calculates vault's stablecoin token account PDA
   - Gets/creates fee recipient's stablecoin token account
   - Gets/creates vault admin's stablecoin token account

2. **Validation:**
   - Checks user has sufficient stablecoin balance
   - Validates deposit amount

3. **Deposit Execution:**
   - Calls program's deposit function
   - Program creates vault's stablecoin account if needed
   - Transfers net stablecoin amount to vault (after all fees)
   - Transfers entry fees to factory fee recipient
   - Transfers management fees to vault admin (if applicable)
   - Mints vault tokens to user (1:1 ratio after all fees)

4. **Post-Deposit:**
   - Retrieves updated vault information
   - Shows user's new vault token balance

#### `getDepositDetails(factoryPDA, vaultIndex)`
Retrieves comprehensive deposit details for a user and vault.

### 5. Vault Management Operations

#### `updateVaultManagementFees(factoryPDA, vaultIndex, newManagementFees)`
Updates vault management fees (vault admin only).

**Parameters:**
- `factoryPDA`: Factory PDA address
- `vaultIndex`: Index of the vault to update
- `newManagementFees`: New management fee in basis points

**Features:**
- Validates new fees are within factory limits
- Ensures vault and factory are active
- Updates vault management fees
- Verifies the update by fetching vault info
- Comprehensive error handling and logging

#### `updateVaultUnderlyingAssets(factoryPDA, vaultIndex, newUnderlyingAssets)`
Updates vault underlying assets (vault admin only).

**Parameters:**
- `factoryPDA`: Factory PDA address
- `vaultIndex`: Index of the vault to update
- `newUnderlyingAssets`: Array of new underlying assets with allocation percentages

**Features:**
- Validates new asset configuration (1-10 assets)
- Ensures asset allocation sums to 100%
- Updates vault underlying assets
- Verifies the update by fetching vault info
- Comprehensive error handling and logging

**Default Asset Allocation:**
- 50% SOL
- 30% USDC
- 20% Custom Stablecoin (as USDT equivalent)

### 6. Redeem Operations

#### `redeemFromVault(factoryPDA, vaultIndex, vaultTokenAmount)`
Handles the complete redeem process.

**Process:**
1. **Account Setup:**
   - Gets/creates user's vault token account
   - Gets/creates user's stablecoin token account
   - Calculates vault's stablecoin token account PDA
   - Gets/creates fee recipient's stablecoin token account
   - Gets/creates vault admin's stablecoin token account

2. **Validation:**
   - Checks user has sufficient vault token balance
   - Validates redeem amount

3. **Redeem Execution:**
   - Calls program's redeem function
   - Program burns vault tokens from user's account
   - Transfers net stablecoin amount to user (after all fees)
   - Transfers exit fees to factory fee recipient
   - Transfers management fees to vault admin (if applicable)
   - Updates vault total assets and supply

4. **Post-Redeem:**
   - Retrieves updated vault information
   - Shows user's remaining vault token balance
   - Shows user's updated stablecoin balance

## 🪙 Token Usage

### Vault Creation
**No tokens required for vault creation.** The `create_vault` function only requires:
- Admin signature (for rent payment in SOL)
- Vault configuration (name, symbol, underlying assets, management fees)
- No deposit or payment tokens needed

### User Deposits
**Users deposit stablecoins (USDC, USDT, etc.) - NOT SOL.** The system is designed for stablecoin deposits only.

**Supported Deposit Tokens:**
- USDC (6 decimals)
- USDT (6 decimals) 
- Any other stablecoin with 6 decimals
- **NOT SOL** - SOL is not accepted for deposits

**Underlying Assets vs Deposit Tokens:**
- **Deposit Tokens**: Stablecoins only (what users deposit)
- **Underlying Assets**: Can include SOL, USDC, or other tokens (what the vault invests in)

## 💰 How Deposits Work

### 1. Pre-Deposit Setup
```typescript
// User needs:
// - Stablecoin token account with sufficient balance
// - Vault token account (created automatically)
// - Vault's stablecoin account (created by program on first deposit)
```

### 2. Deposit Flow
```
User Deposit (1000 tokens)
    ↓
Entry Fee Calculation (25 bps = 2.5 tokens)
    ↓
Management Fee Calculation (100 bps = 10.0 tokens)
    ↓
Net Deposit (987.5 tokens)
    ↓
Transfer to Vault (987.5 tokens)
    ↓
Entry Fee Transfer (2.5 tokens to factory fee recipient)
    ↓
Management Fee Transfer (10.0 tokens to vault admin)
    ↓
Vault Token Minting (987.5 tokens to user)
    ↓
Vault State Update (total_assets += 987.5, total_supply += 987.5)
```

**Note:** Management fees are only transferred if the vault admin is different from the depositing user. If they are the same, management fees are effectively waived.

### 3. Account Relationships
```
User Stablecoin Account → Vault Stablecoin Account (PDA)
User Vault Account ← Vault Mint (PDA)
Factory Fee Recipient Account ← Entry Fees
Vault Admin Account ← Management Fees (if admin ≠ user)
```

### 4. Token Economics
- **First Deposit**: 1:1 after fees (price ignored)
- **Subsequent Deposits**: Mint vs share price (`net * 10^decimals / price`)
- **Entry Fees**: Configurable basis points deducted from deposit (goes to factory fee recipient)
- **Management Fees**: Configurable basis points deducted from deposit (goes to vault admin, waived if admin = user)
- **Vault Tokens**: Represent ownership share in the vault

## 🔄 How Redeems Work

### 1. Pre-Redeem Setup
```typescript
// User needs:
// - Vault token account with sufficient balance
// - Stablecoin token account (to receive stablecoin)
// - Vault must have sufficient stablecoin balance
```

### 2. Redeem Flow
```
User Redeem (100 vault tokens)
    ↓
Exit Fee Calculation (25 bps = 2.5 tokens)
    ↓
Management Fee Calculation (500 bps = 5.0 tokens)
    ↓
Total Fees (7.5 tokens)
    ↓
Net Stablecoin (92.5 tokens)
    ↓
Burn Vault Tokens (100 tokens from user)
    ↓
Transfer Stablecoin to User (92.5 tokens)
    ↓
Exit Fee Transfer (2.5 tokens to factory fee recipient)
    ↓
Management Fee Transfer (5.0 tokens to vault admin)
    ↓
Vault State Update (total_assets -= 92.5, total_supply -= 100)
```

**Note:** Management fees are only transferred if the vault admin is different from the redeeming user. If they are the same, management fees are effectively waived.

### 3. Redeem Account Relationships
```
User Vault Account → Burn (tokens destroyed)
Vault Stablecoin Account (PDA) → User Stablecoin Account
Factory Fee Recipient Account ← Exit Fees
Vault Admin Account ← Management Fees (if admin ≠ user)
```

### 4. Redeem Token Economics
- **Fee Structure**: Exit fees + Management fees deducted from vault tokens
- **Net Stablecoin**: Vault tokens minus total fees
- **Token Burning**: Vault tokens are permanently destroyed (not transferred)
- **Vault Supply**: Total supply decreases by the amount of tokens burned
- **Vault Assets**: Total assets decrease by the net stablecoin amount transferred

## 🚀 Usage Examples

### Command Line Interface

```bash
# Create stablecoin token
npx ts-node script.ts create-token

# Initialize factory
npx ts-node script.ts init

# Create a new vault
npx ts-node script.ts create

# List all vaults
npx ts-node script.ts list

# Get factory information
npx ts-node script.ts info

# Update factory fees (admin only)
npx ts-node script.ts update-fees

# Get specific vault info
npx ts-node script.ts vault 0

# Deposit into vault
npx ts-node script.ts deposit 4 1000

# Redeem vault tokens
npx ts-node script.ts redeem 4 500

# Get deposit details
npx ts-node script.ts deposit-details 4

# Update vault management fees
npx ts-node script.ts update-vault-fees 0 150

# Update vault underlying assets
npx ts-node script.ts update-vault-assets 0

# Get vault fees information
npx ts-node script.ts fees 0
```

### Example Deposit Session
```bash
# Check current deposit details
npx ts-node script.ts deposit-details 4

# Make a deposit
npx ts-node script.ts deposit 4 1000

# Check updated details
npx ts-node script.ts deposit-details 4

# Make another deposit
npx ts-node script.ts deposit 4 500

# Final check
npx ts-node script.ts deposit-details 4
```

### Example Redeem Session
```bash
# Check current vault token balance
npx ts-node script.ts deposit-details 4

# Redeem some vault tokens
npx ts-node script.ts redeem 4 100

# Check updated details
npx ts-node script.ts deposit-details 4

# Redeem more vault tokens
npx ts-node script.ts redeem 4 200

# Final check
npx ts-node script.ts deposit-details 4
```

### Example Vault Management Session
```bash
# Check current vault fees
npx ts-node script.ts fees 0

# Update vault management fees to 150 bps (1.5%)
npx ts-node script.ts update-vault-fees 0 150

# Check updated vault fees
npx ts-node script.ts fees 0

# Update vault underlying assets to new allocation
npx ts-node script.ts update-vault-assets 0

# Check updated vault info
npx ts-node script.ts vault 0

# Verify the changes
npx ts-node script.ts fees 0
```

### Complete Deposit & Redeem Cycle
```bash
# 1. Create and setup
npx ts-node script.ts create-token  # Create stablecoin
npx ts-node script.ts init            # Initialize factory
npx ts-node script.ts create         # Create vault

# 2. Deposit cycle
npx ts-node script.ts deposit 0 1000  # Deposit 1000 tokens
npx ts-node script.ts deposit 0 500   # Deposit 500 more tokens

# 3. Redeem cycle
npx ts-node script.ts redeem 0 200    # Redeem 200 vault tokens
npx ts-node script.ts redeem 0 300    # Redeem 300 more vault tokens

# 4. Check final state
npx ts-node script.ts deposit-details 0
```

## 📊 Data Structures

### VaultInfo
```rust
pub struct VaultInfo {
    pub vault_address: Pubkey,
    pub vault_index: u32,
    pub vault_name: String,
    pub vault_symbol: String,
    pub admin: Pubkey,
    pub state: VaultState,
    pub total_assets: u64,
    pub total_supply: u64,
    pub created_at: i64,
}
```

### DepositDetails
```rust
pub struct DepositDetails {
    pub vault_address: Pubkey,
    pub vault_index: u32,
    pub vault_name: String,
    pub vault_symbol: String,
    pub user_address: Pubkey,
    pub user_vault_token_balance: u64,
    pub vault_total_assets: u64,
    pub vault_total_supply: u64,
    pub vault_stablecoin_balance: u64,
    pub stablecoin_mint: Pubkey,
    pub vault_state: VaultState,
    pub created_at: i64,
}
```

### FactoryInfo
```rust
pub struct FactoryInfo {
    pub factory_address: Pubkey,
    pub admin: Pubkey,
    pub fee_recipient: Pubkey,
    pub vault_count: u32,
    pub state: FactoryState,
    pub entry_fee_bps: u16,
    pub exit_fee_bps: u16,
    pub vault_creation_fee_usdc: u64,
    pub min_management_fee_bps: u16,
    pub max_management_fee_bps: u16,
}
```

## 🔧 Configuration

### Constants
- `MAX_BPS`: 10,000 (100%)
- `DEFAULT_ENTRY_EXIT_FEE_BPS`: 25 (0.25%)
- `DEFAULT_VAULT_CREATION_FEE_USDC`: 10,000,000 (10 USDC)
- `MAX_UNDERLYING_ASSETS`: 10
- `MAX_VAULT_NAME_LENGTH`: 50
- `MAX_VAULT_SYMBOL_LENGTH`: 10

### Fee Limits
- `MAX_ENTRY_EXIT_BPS_LIMIT`: 1,000 (10%) - Maximum entry/exit fees
- `MAX_MANAGEMENT_BPS_LIMIT`: 2,000 (20%) - Maximum management fees
- Entry/exit fees: 0-1,000 basis points (0-10%)
- Management fees: 0-2,000 basis points (0-20%)
- Min management fee must be ≤ max management fee

### Program ID
```
4DdXmxXmHP1nroCARfU4cwewjxgUdMm3rxXMQFmpzBsx
```

## 🛡️ Security Features

- **PDA-based Architecture**: All critical accounts are PDAs
- **Authority Validation**: Proper authority checks for all operations
- **Fee Validation**: Configurable limits on all fees
- **State Validation**: Active state checks for factory and vaults
- **Amount Validation**: Positive amount requirements
- **BPS Validation**: Underlying asset allocation must sum to 100%
- **Admin Authorization**: Only factory admin can update fees
- **Fee Range Validation**: Min management fee must be ≤ max management fee
- **Fee Limit Enforcement**: All fees must be within predefined maximum limits

## 📝 Events

### FactoryInitialized
Emitted when factory is initialized with fee parameters.

### VaultCreated
Emitted when a new vault is created with underlying assets.

### FactoryFeesUpdated
Emitted when factory fees are updated by admin with:
- Admin address
- New entry fee, exit fee, and vault creation fee
- New minimum and maximum management fees
- Timestamp

### DepositEvent
Emitted on each deposit with:
- Vault and user addresses
- Deposit amount, entry fee, and management fee
- Vault tokens minted
- Timestamp

### RedeemEvent
Emitted on each redeem with:
- Vault and user addresses
- Vault tokens burned, exit fee, and management fee
- Stablecoin amount redeemed
- Timestamp

### VaultManagementFeesUpdated
Emitted when vault management fees are updated with:
- Vault and admin addresses
- Vault index
- Old and new management fees
- Timestamp

### VaultUnderlyingAssetsUpdated
Emitted when vault underlying assets are updated with:
- Vault and admin addresses
- Vault index
- Old and new underlying assets arrays
- Timestamp

## 🔮 Future Enhancements

- **Periodic Management Fee Collection**: Implement annual/periodic management fee collection
- **Dynamic Asset Rebalancing**: Automatic rebalancing of underlying assets based on market conditions
- **Multiple Stablecoins**: Support for various stablecoin types in deposits
- **Governance**: Community governance for vault parameters and asset allocation
- **Analytics**: Detailed performance tracking and reporting
- **Advanced Fee Structures**: Time-based fees, tiered fees, or performance-based fees
- **Liquidity Pools**: Integration with DEX liquidity pools for underlying assets
- **Cross-Chain Support**: Multi-chain vault operations
- **Vault Strategies**: Pre-defined investment strategies with automated asset allocation
- **Risk Management**: Automated risk assessment and asset allocation adjustments
- **Yield Farming**: Integration with yield farming protocols for underlying assets

## 📚 Dependencies

### Rust (Cargo.toml)
- `anchor-lang`: 0.31.1 (with init-if-needed feature)
- `anchor-spl`: 0.31.1

### TypeScript (package.json)
- `@coral-xyz/anchor`: Anchor framework
- `@solana/web3.js`: Solana Web3 library
- `@solana/spl-token`: SPL Token library

## 🏃‍♂️ Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build Program**
   ```bash
   anchor build
   ```

3. **Deploy Program**
   ```bash
   anchor deploy
   ```

4. **Run Scripts**
   ```bash
   npx ts-node script.ts <command>
   ```

## 📄 License

This project is licensed under the MIT License.
