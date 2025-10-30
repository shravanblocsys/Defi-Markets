# Factory Setup Guide - Vault MVP

## Overview

This guide documents the process of setting up and initializing the Factory for the Vault MVP program on Solana mainnet. It includes troubleshooting steps for version mismatch issues and the solution implemented.

## Problem Encountered

### Initial Issue: AccountNotFound Error
When running `npx ts-node script.ts info`, the following error occurred:
```
❌ Factory info error: SimulateError: 
simulationResponse: {
  accounts: null,
  err: 'AccountNotFound',
  ...
}
```

### Root Cause: Version Mismatch
The deployed program had a different account structure than the current IDL:
- **Deployed factory account**: 94 bytes
- **Current IDL expects**: 98 bytes
- **Difference**: 4 bytes (likely missing fields in the deployed version)

This caused a buffer decoding error when trying to read the factory account:
```
RangeError: The value of "offset" is out of range. It must be >= 0 and <= 84. Received 86
```

## Solution Implemented

### 1. Program Upgrade with New Factory Seed

Instead of trying to fix the existing factory account, we implemented a clean solution:

#### Changed Factory Seed
- **Old seed**: `"factory_v2"`
- **New seed**: `"factory_v2"`

This creates a completely new factory PDA address, avoiding conflicts with the old account structure.

#### Files Modified
1. **`script.ts`**: Updated all factory PDA calculations
2. **`programs/vault-mvp/src/contexts.rs`**: Updated all factory seed references

### 2. Deployment Process

```bash
# 1. Build the program with new seed
anchor build

# 2. Deploy/upgrade the program
anchor deploy

# 3. Initialize the new factory
npx ts-node script.ts init
```

### 3. Cost Analysis

- **Program upgrade**: ~0.003 SOL
- **Factory initialization**: ~0.002 SOL
- **Total cost**: ~0.005 SOL
- **Remaining balance**: 4.409 SOL

## Factory Configuration

### Initialized Factory Details
- **Factory PDA**: `8zYMfc9osGMnFp1XNkqA7cZ6adVMc4YbXoyby1Lfu62j`
- **Admin**: `CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY`
- **Fee Recipient**: `CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY`
- **Account Size**: 98 bytes (matches current IDL)

### Fee Structure
- **Entry Fee**: 25 bps (0.25%)
- **Exit Fee**: 25 bps (0.25%)
- **Vault Creation Fee**: 10 USDC (10,000,000 raw units)
- **Min Management Fee**: 50 bps (0.5%)
- **Max Management Fee**: 300 bps (3%)
- **Vault Creator Fee Ratio**: 7000 bps (70%)
- **Platform Fee Ratio**: 3000 bps (30%)

## Verification Commands

### Check Factory Status
```bash
npx ts-node script.ts info
```

Expected output:
```
🏭 Factory Information: {
  factoryAddress: '8zYMfc9osGMnFp1XNkqA7cZ6adVMc4YbXoyby1Lfu62j',
  admin: 'CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY',
  feeRecipient: 'CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY',
  vaultCount: 0,
  state: { active: {} },
  entryFeeBps: 25,
  exitFeeBps: 25,
  vaultCreationFeeUsdc: '10000000',
  minManagementFeeBps: 50,
  maxManagementFeeBps: 300,
  vaultCreatorFeeRatioBps: 7000,
  platformFeeRatioBps: 3000
}
```

### Check Account Size
```bash
solana account 8zYMfc9osGMnFp1XNkqA7cZ6adVMc4YbXoyby1Lfu62j --url https://api.mainnet-beta.solana.com
```

Expected: 98 bytes account size

## Available Commands

### Factory Management
- `npx ts-node script.ts init` - Initialize factory
- `npx ts-node script.ts info` - Get factory information
- `npx ts-node script.ts update-fees [params]` - Update factory fees

### Vault Management
- `npx ts-node script.ts create` - Create a new vault
- `npx ts-node script.ts list` - List all vaults
- `npx ts-node script.ts pause <vault_index>` - Pause a vault
- `npx ts-node script.ts resume <vault_index>` - Resume a vault

### Vault Operations
- `npx ts-node script.ts deposit <vault_index> <amount>` - Deposit into vault
- `npx ts-node script.ts redeem <vault_index> <amount>` - Redeem from vault
- `npx ts-node script.ts deposit-details <vault_index>` - Get deposit details
- `npx ts-node script.ts fees <vault_index>` - Get vault fees

## Key Learnings

1. **Version Mismatch Handling**: When encountering account structure mismatches, creating a new PDA with a different seed is often cleaner than trying to migrate existing data.

2. **Cost Efficiency**: Program upgrades are much cheaper than new deployments, especially when using the same program ID.

3. **Account Size Validation**: Always verify that deployed account sizes match the current IDL expectations.

4. **Clean Slate Approach**: When no critical data exists (like vaults), starting fresh with a new factory is often the best approach.

## Transaction Signatures

- **Program Upgrade**: `VRAuwaZtyjd1mnWcY1cty9jsR9z67pS4TEggYThwU43VuPZTP4cT17nb2tykDmWP9edhKceZ4N5D9z59ZmXRHp9`
- **Factory Initialization**: `3M2MnSda3wkLwShfJPs2reJ473HpQBawybg9dhCQmkoTALcvFiGJBMwqNR2PpFRwUAkUNL6ssqKc6157R3KEcJew`

## Next Steps

1. ✅ Factory initialized and verified
2. 🔄 Test vault creation functionality
3. 🔄 Test deposit/redeem operations
4. 🔄 Test fee collection mechanisms

---

**Date**: December 2024  
**Program ID**: `CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs`  
**Factory PDA**: `8zYMfc9osGMnFp1XNkqA7cZ6adVMc4YbXoyby1Lfu62j`  
**Admin Wallet**: `CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY`
