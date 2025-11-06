use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::*;
use crate::errors::ErrorCode;

// ---------- Accounts ----------
#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    /// Admin who pays rent and becomes the factory admin
    #[account(mut, signer)]
    pub admin: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        init,
        payer = admin,
        space = Factory::INIT_SPACE,
        seeds = [b"factory_v2"],
        bump
    )]
    pub factory: Account<'info, Factory>,

    /// Fee recipient pubkey
    /// CHECK: only storing as Pubkey
    pub fee_recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    /// Admin who creates the vault
    #[account(mut, signer)]
    pub admin: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        mut,
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        init,
        payer = admin,
        space = Vault::INIT_SPACE,
        seeds = [b"vault", factory.key().as_ref(), &factory.vault_count.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault token mint (SPL token)
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"vault_mint", vault.key().as_ref()],
        bump
    )]
    pub vault_mint: Account<'info, Mint>,

    /// Vault token account for holding vault tokens
    #[account(
        init,
        payer = admin,
        token::mint = vault_mint,
        token::authority = vault,
        seeds = [b"vault_token_account", vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Stablecoin mint used to pay creation fee (e.g. USDC)
    pub stablecoin_mint: Account<'info, Mint>,

    /// Admin's stablecoin token account (payer of creation fee)
    #[account(
        mut,
        constraint = admin_stablecoin_account.owner == admin.key(),
        constraint = admin_stablecoin_account.mint == stablecoin_mint.key()
    )]
    pub admin_stablecoin_account: Account<'info, TokenAccount>,

    /// Factory admin's stablecoin token account (recipient of creation fee)
    #[account(
        mut,
        constraint = factory_admin_stablecoin_account.owner == factory.admin,
        constraint = factory_admin_stablecoin_account.mint == stablecoin_mint.key()
    )]
    pub factory_admin_stablecoin_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}


#[derive(Accounts)]
pub struct UpdateFactoryFees<'info> {
    /// Admin who can update factory fees
    #[account(mut, signer)]
    pub admin: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        mut,
        seeds = [b"factory_v2"],
        bump = factory.bump,
        constraint = factory.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub factory: Account<'info, Factory>,
}

#[derive(Accounts)]
pub struct UpdateFactoryAdmin<'info> {
    /// Current factory admin
    #[account(mut, signer)]
    pub admin: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        mut,
        seeds = [b"factory_v2"],
        bump = factory.bump,
        constraint = factory.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub factory: Account<'info, Factory>,

    /// New admin to set on the factory
    /// CHECK: only the pubkey is stored
    pub new_admin: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct GetFactoryInfo<'info> {
    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,
}


#[derive(Accounts)]
#[instruction(vault_index: u32, etf_share_price: u64)]
pub struct Deposit<'info> {
    /// User making the deposit
    #[account(mut, signer)]
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault token mint
    #[account(
        mut,
        seeds = [b"vault_mint", vault.key().as_ref()],
        bump
    )]
    pub vault_mint: Account<'info, Mint>,

    /// User's stablecoin token account (any stablecoin like USDC, USDT, etc.)
    #[account(
        mut,
        constraint = user_stablecoin_account.owner == user.key()
    )]
    pub user_stablecoin_account: Account<'info, TokenAccount>,

    /// Stablecoin mint (USDC, USDT, etc.)
    pub stablecoin_mint: Account<'info, Mint>,

    /// Vault's stablecoin token account (to receive deposits)
    #[account(
        init_if_needed,
        payer = user,
        token::mint = stablecoin_mint,
        token::authority = vault,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// User's vault token account (to receive vault tokens)
    #[account(
        mut,
        constraint = user_vault_account.owner == user.key(),
        constraint = user_vault_account.mint == vault_mint.key()
    )]
    pub user_vault_account: Account<'info, TokenAccount>,

    /// Fee recipient's stablecoin token account
    #[account(
        mut,
        constraint = fee_recipient_stablecoin_account.owner == factory.fee_recipient,
        constraint = fee_recipient_stablecoin_account.mint == user_stablecoin_account.mint
    )]
    pub fee_recipient_stablecoin_account: Account<'info, TokenAccount>,

    /// Vault admin's stablecoin token account (to receive management fees)
    /// CHECK: Only used if vault admin is different from user
    #[account(mut)]
    pub vault_admin_stablecoin_account: UncheckedAccount<'info>,

    /// Jupiter program account (optional - only needed if Jupiter swap is provided)
    /// CHECK: Verified in the instruction if provided
    #[account(mut)]
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PrepareJupiterIxData<'info> {
    /// Payer creating the ix data account
    #[account(mut, signer)]
    pub payer: Signer<'info>,

    /// Vault PDA (used for seeds reference)
    pub vault: Account<'info, Vault>,

    /// Jupiter ix data PDA
    #[account(
        init_if_needed,
        payer = payer,
        space = JupiterIxData::TOTAL_SPACE,
        seeds = [b"jup_ix", vault.key().as_ref(), asset_mint.key().as_ref()],
        bump
    )]
    pub jup_ix_data: Account<'info, JupiterIxData>,

    /// Asset mint this ix data corresponds to
    /// CHECK: used for PDA seeds only
    pub asset_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct GetDepositDetails<'info> {
    /// User to get deposit details for
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// User's vault token account
    #[account(
        constraint = user_vault_account.owner == user.key()
    )]
    pub user_vault_account: Account<'info, TokenAccount>,

    /// Vault's stablecoin token account
    #[account(
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct Redeem<'info> {
    /// User redeeming vault tokens
    #[account(mut, signer)]
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault token mint
    #[account(
        mut,
        seeds = [b"vault_mint", vault.key().as_ref()],
        bump
    )]
    pub vault_mint: Account<'info, Mint>,

    /// User's vault token account (to burn tokens from)
    #[account(
        mut,
        constraint = user_vault_account.owner == user.key(),
        constraint = user_vault_account.mint == vault_mint.key()
    )]
    pub user_vault_account: Account<'info, TokenAccount>,

    /// User's stablecoin token account (to receive stablecoin)
    #[account(mut)]
    pub user_stablecoin_account: Account<'info, TokenAccount>,

    /// Stablecoin mint (USDC, USDT, etc.)
    pub stablecoin_mint: Account<'info, Mint>,

    /// Vault's stablecoin token account (to send stablecoin from)
    #[account(
        mut,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// Fee recipient's stablecoin token account
    #[account(
        mut,
        constraint = fee_recipient_stablecoin_account.owner == factory.fee_recipient,
        constraint = fee_recipient_stablecoin_account.mint == stablecoin_mint.key()
    )]
    pub fee_recipient_stablecoin_account: Account<'info, TokenAccount>,

    /// Vault admin's stablecoin token account (to receive management fees)
    /// CHECK: Only used if vault admin is different from user
    #[account(mut)]
    pub vault_admin_stablecoin_account: UncheckedAccount<'info>,

    /// Jupiter program account (optional - only needed if Jupiter swap is provided)
    /// CHECK: Verified in the instruction if provided
    #[account(mut)]
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct SetVaultPaused<'info> {
    /// Admin updating paused state
    #[account(mut, signer)]
    pub admin: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump,
        constraint = factory.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct GetVaultFees<'info> {
    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct CollectWeeklyManagementFees<'info> {
    /// Any signer triggering collection (keeper/admin)
    #[account(mut, signer)]
    pub collector: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's USDC account to pay fees from
    #[account(
        mut,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// Vault admin USDC account (70%)
    #[account(mut)]
    pub vault_admin_stablecoin_account: Account<'info, TokenAccount>,

    /// Protocol fee recipient USDC account (30%)
    #[account(mut)]
    pub fee_recipient_stablecoin_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct ExecuteSwaps<'info> {
    /// Vault admin or authorized user executing swaps
    #[account(mut, signer)]
    pub executor: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's stablecoin token account (source of USDC for swaps)
    #[account(
        mut,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// Jupiter program account
    /// CHECK: Verified in the instruction
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32, amount: u64)]
pub struct TransferVaultToUser<'info> {
    /// User receiving the USDC from vault
    #[account(mut, signer)]
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's stablecoin token account (source)
    #[account(
        mut,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// User's stablecoin token account (destination)
    #[account(
        mut,
        constraint = user_stablecoin_account.owner == user.key()
    )]
    pub user_stablecoin_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32, amount: u64)]
pub struct WithdrawUnderlyingToUser<'info> {
    /// User redeeming (and receiving the asset)
    #[account(mut, signer)]
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Source: vault's ATA for the asset
    #[account(mut)]
    pub vault_asset_account: Account<'info, TokenAccount>,

    /// Destination: user's ATA for the asset
    #[account(mut)]
    pub user_asset_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32, vault_token_amount: u64)]
pub struct FinalizeRedeem<'info> {
    /// User redeeming
    #[account(mut, signer)]
    pub user: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault mint PDA
    #[account(
        mut,
        seeds = [b"vault_mint", vault.key().as_ref()],
        bump
    )]
    pub vault_mint: Account<'info, Mint>,

    /// User's vault token account (to burn from)
    #[account(mut)]
    pub user_vault_account: Account<'info, TokenAccount>,

    /// Vault USDC PDA account (source of USDC, filled by client swaps)
    #[account(
        mut,
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    /// User's USDC account (net proceeds destination)
    #[account(mut)]
    pub user_stablecoin_account: Account<'info, TokenAccount>,

    /// Fee recipient USDC account (factory)
    #[account(mut)]
    pub fee_recipient_stablecoin_account: Account<'info, TokenAccount>,

    /// Vault admin USDC account (management fee share)
    #[account(mut)]
    pub vault_admin_stablecoin_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct GetAccruedManagementFees<'info> {
    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault's stablecoin token account (USDC/USDT)
    #[account(
        seeds = [b"vault_stablecoin_account", vault.key().as_ref()],
        bump
    )]
    pub vault_stablecoin_account: Account<'info, TokenAccount>,

    // Remaining accounts: Vault's underlying asset token accounts
    // These accounts are provided dynamically based on vault's underlying assets
    // The number of accounts should match the number of assets in vault.underlying_assets
    // CHECK: Verified in instruction that these match vault's underlying assets
    // CHECK: Each account should be a TokenAccount owned by the vault
    // CHECK: Account order should match the order of assets in vault.underlying_assets
    // CHECK: Each account's mint should match the corresponding asset's mint_address
}

#[derive(Accounts)]
#[instruction(vault_index: u32)]
pub struct DistributeAccruedFees<'info> {
    /// Any signer triggering distribution (keeper/admin)
    #[account(mut, signer)]
    pub collector: Signer<'info>,

    /// Factory PDA - seeds: ["factory_v2"]
    #[account(
        seeds = [b"factory_v2"],
        bump = factory.bump
    )]
    pub factory: Account<'info, Factory>,

    /// Vault PDA - seeds: ["vault", factory.key(), vault_index]
    #[account(
        mut,
        seeds = [b"vault", factory.key().as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    /// Vault token mint (for minting fee shares)
    #[account(
        mut,
        seeds = [b"vault_mint", vault.key().as_ref()],
        bump
    )]
    pub vault_mint: Account<'info, Mint>,

    /// Vault admin's vault token account (receives vault creator share)
    #[account(mut)]
    pub vault_admin_vault_account: Account<'info, TokenAccount>,

    /// Platform fee recipient's vault token account (receives platform share)
    #[account(mut)]
    pub fee_recipient_vault_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


