use anchor_lang::prelude::*;
use crate::state::UnderlyingAsset;

// ---------- Events ----------
#[event]
pub struct FactoryInitialized {
    pub admin: Pubkey,
    pub fee_recipient: Pubkey,
    pub entry_fee_bps: u16,
    pub exit_fee_bps: u16,
    pub vault_creation_fee_usdc: u64,
    pub min_management_fee_bps: u16,
    pub max_management_fee_bps: u16,
    pub vault_creator_fee_ratio_bps: u16,
    pub platform_fee_ratio_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub factory: Pubkey,
    pub admin: Pubkey,
    pub vault_index: u32,
    pub vault_name: String,
    pub vault_symbol: String,
    pub underlying_assets: Vec<UnderlyingAsset>,
    pub management_fees: u16,
    pub timestamp: i64,
}

#[event]
pub struct FactoryFeesUpdated {
    pub admin: Pubkey,
    pub entry_fee_bps: u16,
    pub exit_fee_bps: u16,
    pub vault_creation_fee_usdc: u64,
    pub min_management_fee_bps: u16,
    pub max_management_fee_bps: u16,
    pub vault_creator_fee_ratio_bps: u16,
    pub platform_fee_ratio_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct DepositEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub amount: u64,
    pub entry_fee: u64,
    pub vault_tokens_minted: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub vault_tokens_burned: u64,
    pub exit_fee: u64,
    pub stablecoin_amount_redeemed: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultPaused {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultResumed {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AccruedFeesDistributed {
    pub vault: Pubkey,
    pub collector: Pubkey,
    pub vault_index: u32,
    pub total_accrued_fees_usdc: u64,
    pub vault_creator_share_tokens: u64,
    pub platform_share_tokens: u64,
    pub vault_creator_fee_ratio_bps: u16,
    pub platform_fee_ratio_bps: u16,
    pub timestamp: i64,
}

