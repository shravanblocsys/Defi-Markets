use anchor_lang::prelude::*;

declare_id!("BHTRWbEGRfJZSVXkJXj1Cv48knuALpUvijJwvuobyvvB");

// ---------- Module Declarations ----------
pub mod constants;
pub mod state;
pub mod contexts;
pub mod events;
pub mod errors;
pub mod instructions;

// Re-export commonly used items
pub use constants::*;
pub use state::*;
pub use contexts::*;
pub use events::*;

// ---------- Program ----------
#[program]
pub mod vault_mvp {
    use super::*;

    /// Update the factory admin (only current admin)
    pub fn update_factory_admin(
        ctx: Context<UpdateFactoryAdmin>,
    ) -> Result<()> {
        instructions::update_factory_admin(ctx)
    }

    /// Initialize the Factory PDA with fee params and admin
    pub fn initialize_factory(
        ctx: Context<InitializeFactory>,
        entry_fee_bps: u16,
        exit_fee_bps: u16,
        vault_creation_fee_usdc: u64,
        min_management_fee_bps: u16,
        max_management_fee_bps: u16,
        vault_creator_fee_ratio_bps: u16,
        platform_fee_ratio_bps: u16,
    ) -> Result<()> {
        instructions::initialize_factory(
            ctx,
            entry_fee_bps,
            exit_fee_bps,
            vault_creation_fee_usdc,
            min_management_fee_bps,
            max_management_fee_bps,
            vault_creator_fee_ratio_bps,
            platform_fee_ratio_bps,
        )
    }

    /// Create a new vault with underlying assets and management fees
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_name: String,
        vault_symbol: String,
        underlying_assets: Vec<UnderlyingAsset>,
        management_fees: u16,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::create_vault(ctx, vault_name, vault_symbol, underlying_assets, management_fees, metadata_uri)
    }


    /// Update factory fees (only admin can call this)
    pub fn update_factory_fees(
        ctx: Context<UpdateFactoryFees>,
        entry_fee_bps: u16,
        exit_fee_bps: u16,
        vault_creation_fee_usdc: u64,
        min_management_fee_bps: u16,
        max_management_fee_bps: u16,
        vault_creator_fee_ratio_bps: u16,
        platform_fee_ratio_bps: u16,
    ) -> Result<()> {
        instructions::update_factory_fees(
            ctx,
            entry_fee_bps,
            exit_fee_bps,
            vault_creation_fee_usdc,
            min_management_fee_bps,
            max_management_fee_bps,
            vault_creator_fee_ratio_bps,
            platform_fee_ratio_bps,
        )
    }

    /// Get factory information including vault count
    pub fn get_factory_info(ctx: Context<GetFactoryInfo>) -> Result<FactoryInfo> {
        instructions::get_factory_info(ctx)
    }

    /// Deposit any stablecoin into the vault and receive vault tokens
    pub fn deposit(ctx: Context<Deposit>, vault_index: u32, amount: u64, etf_share_price: u64) -> Result<()> {
        instructions::deposit(ctx, vault_index, amount, etf_share_price)
    }

    /// Get deposit details for a user and vault
    pub fn get_deposit_details(
        ctx: Context<GetDepositDetails>,
        vault_index: u32,
    ) -> Result<DepositDetails> {
        instructions::get_deposit_details(ctx, vault_index)
    }

    /// Execute Jupiter swaps for vault's USDC into underlying assets
    pub fn execute_swaps(ctx: Context<ExecuteSwaps>, vault_index: u32) -> Result<()> {
        instructions::execute_swaps(ctx, vault_index)
    }

    /// Transfer USDC from vault to user for swapping
    pub fn transfer_vault_to_user(
        ctx: Context<TransferVaultToUser>,
        vault_index: u32,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer_vault_to_user(ctx, vault_index, amount)
    }

    /// Withdraw underlying asset from vault to user (for client-side redeem swaps)
    pub fn withdraw_underlying_to_user(
        ctx: Context<WithdrawUnderlyingToUser>,
        vault_index: u32,
        amount: u64,
        decimals: u8,
    ) -> Result<()> {
        instructions::withdraw_underlying_to_user(ctx, vault_index, amount, decimals)
    }

    /// Finalize redeem: burn tokens and settle fees/net USDC
    pub fn finalize_redeem(
        ctx: Context<FinalizeRedeem>,
        vault_index: u32,
        vault_token_amount: u64,
        etf_share_price: u64,
    ) -> Result<()> {
        instructions::finalize_redeem(ctx, vault_index, vault_token_amount, etf_share_price)
    }


    /// Set vault paused or active (admin only)
    pub fn set_vault_paused(
        ctx: Context<SetVaultPaused>,
        vault_index: u32,
        paused: bool,
    ) -> Result<()> {
        instructions::set_vault_paused(ctx, vault_index, paused)
    }

    /// Get vault fees (factory fees + vault management fees)
    pub fn get_vault_fees(
        ctx: Context<GetVaultFees>,
        vault_index: u32,
    ) -> Result<VaultFees> {
        instructions::get_vault_fees(ctx, vault_index)
    }

    /// Collect accrued management fees from vault USDC and distribute 70/30
    pub fn collect_weekly_management_fees(
        ctx: Context<CollectWeeklyManagementFees>,
        vault_index: u32,
    ) -> Result<()> {
        instructions::collect_weekly_management_fees(ctx, vault_index)
    }

    /// Get and update accrued management fees for a vault
    /// This function calculates newly accrued fees using live asset prices and balances
    /// share_price: Current share price in raw stablecoin units per share (same format as deposit)
    pub fn get_accrued_management_fees<'info>(
        ctx: Context<'_, '_, 'info, 'info, GetAccruedManagementFees<'info>>,
        vault_index: u32,
        asset_prices: Vec<AssetPrice>,
        share_price: u64,
    ) -> Result<AccruedManagementFees> {
        instructions::get_accrued_management_fees(ctx, vault_index, asset_prices, share_price)
    }

    /// Distribute accrued management fees as vault tokens to vault creator and platform
    /// This aligns fee recipients with vault performance by giving them vault shares
    /// share_price: Current share price in raw stablecoin units per share (same format as deposit)
    /// management_fees_amount: Total accrued management fees in USDC (raw units, 6 decimals) calculated off-chain
    pub fn distribute_accrued_fees(
        ctx: Context<DistributeAccruedFees>,
        vault_index: u32,
        share_price: u64,
        management_fees_amount: u64,
    ) -> Result<()> {
        instructions::distribute_accrued_fees(ctx, vault_index, share_price, management_fees_amount)
    }

    /// Claim management fees directly by the vault creator (decentralized)
    /// Allows DTF creators to claim their accrued management fees without relying on admin/keeper
    /// Fees are distributed as vault tokens according to factory-configured ratios (creator share + platform share)
    /// This aligns fee recipients with vault performance by giving them vault shares
    /// share_price: Current share price in raw stablecoin units per share (same format as deposit)
    /// management_fees_amount: Total accrued management fees in USDC (raw units, 6 decimals) calculated off-chain
    pub fn claim_management_fee(
        ctx: Context<ClaimManagementFee>,
        vault_index: u32,
        share_price: u64,
        management_fees_amount: u64,
    ) -> Result<()> {
        instructions::claim_management_fee(ctx, vault_index, share_price, management_fees_amount)
    }

}
