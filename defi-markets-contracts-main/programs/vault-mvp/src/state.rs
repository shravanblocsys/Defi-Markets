use anchor_lang::prelude::*;
use crate::constants::*;

// ---------- State ----------
#[account]
pub struct Factory {
    pub bump: u8,
    pub admin: Pubkey,
    pub fee_recipient: Pubkey,
    pub vault_count: u32,
    pub state: FactoryState,

    // Fee params
    pub entry_fee_bps: u16,
    pub exit_fee_bps: u16,
    pub vault_creation_fee_usdc: u64,
    pub min_management_fee_bps: u16,
    pub max_management_fee_bps: u16,
    
    // Fee distribution ratios (in basis points, must sum to 10000)
    pub vault_creator_fee_ratio_bps: u16,  // Vault creator's share of management fees
    pub platform_fee_ratio_bps: u16,      // Platform's share of management fees

}

impl Factory {
    pub const INIT_SPACE: usize = 8 + // discriminator
        1 +  // bump
        32 + // admin
        32 + // fee_recipient
        4 +  // vault_count
        1 +  // state (enum as u8)
        2 +  // entry_fee_bps
        2 +  // exit_fee_bps
        8 +  // vault_creation_fee_usdc
        2 +  // min_management_fee_bps
        2 +  // max_management_fee_bps
        2 +  // vault_creator_fee_ratio_bps
        2;   // platform_fee_ratio_bps
}

#[account]
pub struct Vault {
    pub bump: u8,
    pub vault_index: u32,
    pub factory: Pubkey,
    pub admin: Pubkey,
    pub vault_name: String,
    pub vault_symbol: String,
    pub underlying_assets: Vec<UnderlyingAsset>,
    pub management_fees: u16,
    pub state: VaultState,
    pub total_assets: u64,
    pub total_supply: u64,
    pub created_at: i64,
    // Management fee accrual state
    pub last_fee_accrual_ts: i64,
    pub accrued_management_fees_usdc: u64,
}

impl Vault {
    // Calculate space dynamically based on number of assets
    pub const fn calculate_space(num_assets: usize) -> usize {
        8 + // discriminator
        1 +  // bump
        4 +  // vault_index
        32 + // factory
        32 + // admin
        4 + 32 + // vault_name (String: 4 bytes length + data)
        4 + 32 + // vault_symbol (String: 4 bytes length + data)
        4 + (num_assets * UnderlyingAsset::SPACE) + // underlying_assets (Vec)
        2 +  // management_fees
        1 +  // state (enum as u8)
        8 +  // total_assets
        8 +  // total_supply
        8 +  // created_at
        8 +  // last_fee_accrual_ts
        8    // accrued_management_fees_usdc
    }
    
    // Maximum space for vaults - supports up to MAX_UNDERLYING_ASSETS (240) assets
    // This allows creating vaults with any number of assets from 1 to 240
    // Note: All vaults allocate space for 240 assets to ensure flexibility
    pub const INIT_SPACE: usize = Self::calculate_space(MAX_UNDERLYING_ASSETS); // Maximum space for full flexibility
}

// Stores serialized Jupiter instruction bytes per-asset per-deposit
// PDA seeds suggestion: ["jup_ix", vault.key(), asset_mint]
#[account]
pub struct JupiterIxData {
    pub bump: u8,
    pub vault: Pubkey,
    pub asset_mint: Pubkey,
    pub data_len: u32,
    // followed by variable-length bytes up to JUP_IX_MAX_LEN
}

impl JupiterIxData {
    pub const HEADER_SPACE: usize = 8 + // disc
        1 + // bump
        32 + // vault
        32 + // asset_mint
        4; // data_len

    pub const TOTAL_SPACE: usize = Self::HEADER_SPACE + JUP_IX_MAX_LEN;
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct UnderlyingAsset {
    pub mint_address: Pubkey,
    pub mint_bps: u16, // Basis points (0-10000)
}

impl UnderlyingAsset {
    pub const SPACE: usize = 32 + // mint_address
        2; // mint_bps
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
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
    pub vault_creator_fee_ratio_bps: u16,
    pub platform_fee_ratio_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum VaultState {
    Active,
    Paused,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum FactoryState {
    Active,
    Paused,
    Deprecated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct VaultFees {
    // Factory fees
    pub entry_fee_bps: u16,
    pub exit_fee_bps: u16,
    pub vault_creation_fee_usdc: u64,
    pub min_management_fee_bps: u16,
    pub max_management_fee_bps: u16,
    
    // Vault-specific fees
    pub vault_management_fees: u16,
    
    // Vault info
    pub vault_index: u32,
    pub vault_name: String,
    pub vault_symbol: String,
    pub vault_admin: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct AssetPrice {
    pub mint_address: Pubkey,
    pub price_usd: u64,                     // Price in USD with 6 decimals
}

impl AssetPrice {
    pub const SPACE: usize = 32 + // mint_address
        8; // price_usd
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct AccruedManagementFees {
    pub vault_index: u32,
    pub vault_name: String,
    pub vault_symbol: String,
    pub vault_admin: Pubkey,
    pub management_fee_bps: u16,
    pub nav: u64,                           // Net Asset Value (calculated from live prices)
    pub gav: u64,                           // Gross Asset Value (calculated from live prices)
    pub last_fee_accrual_ts: i64,
    pub current_timestamp: i64,
    pub elapsed_seconds: i64,
    pub previously_accrued_fees: u64,
    pub newly_accrued_fees: u64,
    pub total_accrued_fees: u64,
    pub asset_balances: Vec<AssetBalance>,  // Actual asset balances in vault
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct AssetBalance {
    pub mint_address: Pubkey,
    pub balance: u64,                       // Raw token balance
    pub price_usd: u64,                     // Price in USD with 6 decimals
    pub value_usd: u64,                     // balance * price_usd (with proper decimal handling)
}
