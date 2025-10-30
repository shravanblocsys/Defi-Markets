use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
use crate::{
    contexts::*,
    constants::*,
    errors::ErrorCode,
    events::*,
    state::*,
};

// ---------- Instructions ----------
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
    // Validations
    require!(
        entry_fee_bps <= MAX_ENTRY_EXIT_BPS_LIMIT && exit_fee_bps <= MAX_ENTRY_EXIT_BPS_LIMIT,
        ErrorCode::FeesTooHigh
    );
    require!(
        min_management_fee_bps <= max_management_fee_bps,
        ErrorCode::InvalidFeeRange
    );
    require!(
        max_management_fee_bps <= MAX_MANAGEMENT_BPS_LIMIT,
        ErrorCode::FeesTooHigh
    );
    
    // Validate fee distribution ratios
    require!(
        vault_creator_fee_ratio_bps + platform_fee_ratio_bps == MAX_BPS,
        ErrorCode::InvalidFeeRange
    );
    require!(
        vault_creator_fee_ratio_bps > 0 && platform_fee_ratio_bps > 0,
        ErrorCode::InvalidFeeRange
    );

    // Initialize factory account
    let factory = &mut ctx.accounts.factory;
    factory.bump = ctx.bumps.factory;
    factory.admin = ctx.accounts.admin.key();
    factory.fee_recipient = ctx.accounts.fee_recipient.key();
    factory.vault_count = 0_u32;
    factory.state = FactoryState::Active;

    // Fee params
    factory.entry_fee_bps = entry_fee_bps;
    factory.exit_fee_bps = exit_fee_bps;
    factory.vault_creation_fee_usdc = vault_creation_fee_usdc;
    factory.min_management_fee_bps = min_management_fee_bps;
    factory.max_management_fee_bps = max_management_fee_bps;
    factory.vault_creator_fee_ratio_bps = vault_creator_fee_ratio_bps;
    factory.platform_fee_ratio_bps = platform_fee_ratio_bps;

    // Emit event
    emit!(FactoryInitialized {
        admin: factory.admin,
        fee_recipient: factory.fee_recipient,
        entry_fee_bps,
        exit_fee_bps,
        vault_creation_fee_usdc,
        min_management_fee_bps,
        max_management_fee_bps,
        vault_creator_fee_ratio_bps,
        platform_fee_ratio_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn create_vault(
    ctx: Context<CreateVault>,
    vault_name: String,
    vault_symbol: String,
    underlying_assets: Vec<UnderlyingAsset>,
    management_fees: u16,
) -> Result<()> {
    msg!("📝 Vault Name: {}", vault_name);
    msg!("🏷️ Vault Symbol: {}", vault_symbol);
    msg!("💰 Management Fees: {} bps", management_fees);
    msg!(
        "📊 Number of underlying assets: {}",
        underlying_assets.len()
    );

    // Log underlying assets details
    for (i, asset) in underlying_assets.iter().enumerate() {
        msg!(
            "Asset {}: Mint={}, BPS={}",
            i + 1,
            asset.mint_address,
            asset.mint_bps
        );
    }

    // Validations
    require!(
        vault_name.len() <= MAX_VAULT_NAME_LENGTH,
        ErrorCode::VaultNameTooLong
    );
    require!(
        vault_symbol.len() <= MAX_VAULT_SYMBOL_LENGTH,
        ErrorCode::VaultSymbolTooLong
    );
    // Dynamic validation based on account size
    let num_assets = underlying_assets.len();
    let required_space = Vault::calculate_space(num_assets);
    
    require!(
        num_assets >= MIN_UNDERLYING_ASSETS && num_assets <= MAX_UNDERLYING_ASSETS,
        ErrorCode::InvalidUnderlyingAssets
    );
    
    require!(
        required_space <= MAX_ACCOUNT_SIZE,
        ErrorCode::AccountTooLarge
    );
    require!(
        management_fees >= ctx.accounts.factory.min_management_fee_bps
            && management_fees <= ctx.accounts.factory.max_management_fee_bps,
        ErrorCode::InvalidManagementFees
    );


    // Validate underlying assets BPS sum to 100%
    let total_bps: u16 = underlying_assets.iter().map(|asset| asset.mint_bps).sum();
    msg!("📈 Total BPS allocation: {} (should be 10000)", total_bps);
    require!(total_bps == MAX_BPS, ErrorCode::InvalidBpsSum);

    // Get factory and increment vault count
    let factory = &mut ctx.accounts.factory;
    let vault_index = factory.vault_count;
    let factory_key = factory.key();
    msg!("🏭 Factory key: {}", factory_key);
    msg!(
        "🔢 Current vault count: {}, creating vault #{}",
        vault_index,
        vault_index + 1
    );

    factory.vault_count = factory.vault_count.checked_add(1).unwrap();


    // Charge one-time creation fee: fixed 10 USDC (6 decimals)
    // 10 USDC = 10_000_000 in raw units for 6 decimals
    let creation_fee_amount: u64 = 10_000_000;
    let fee_cpi_accounts = token::Transfer {
        from: ctx.accounts.admin_stablecoin_account.to_account_info(),
        to: ctx
            .accounts
            .factory_admin_stablecoin_account
            .to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let fee_cpi_program = ctx.accounts.token_program.to_account_info();
    let fee_cpi_ctx = CpiContext::new(fee_cpi_program, fee_cpi_accounts);
    token::transfer(fee_cpi_ctx, creation_fee_amount)?;

    // Initialize vault account
    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;
    vault.vault_index = vault_index;
    vault.factory = factory_key;
    vault.admin = ctx.accounts.admin.key();
    vault.vault_name = vault_name.clone();
    vault.vault_symbol = vault_symbol.clone();
    vault.underlying_assets = underlying_assets.clone();
    vault.management_fees = management_fees;
    vault.state = VaultState::Active;
    vault.total_assets = 0_u64;
    vault.total_supply = 0_u64;
    vault.created_at = Clock::get()?.unix_timestamp;
    vault.last_fee_accrual_ts = vault.created_at;
    vault.accrued_management_fees_usdc = 0;

    msg!("🔑 Vault PDA: {}", vault.key());
    msg!("👑 Vault Admin: {}", vault.admin);
    msg!("🪙 Vault Mint PDA: {}", ctx.accounts.vault_mint.key());
    msg!(
        "💳 Vault Token Account PDA: {}",
        ctx.accounts.vault_token_account.key()
    );
    msg!("📅 Created at: {}", vault.created_at);

    // Emit event
    emit!(VaultCreated {
        vault: vault.key(),
        factory: factory_key,
        admin: ctx.accounts.admin.key(),
        vault_index,
        vault_name: vault_name.clone(),
        vault_symbol: vault_symbol.clone(),
        underlying_assets: underlying_assets.clone(),
        management_fees,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}


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
    // Validations
    require!(
        entry_fee_bps <= MAX_ENTRY_EXIT_BPS_LIMIT && exit_fee_bps <= MAX_ENTRY_EXIT_BPS_LIMIT,
        ErrorCode::FeesTooHigh
    );
    require!(
        min_management_fee_bps <= max_management_fee_bps,
        ErrorCode::InvalidFeeRange
    );
    require!(
        max_management_fee_bps <= MAX_MANAGEMENT_BPS_LIMIT,
        ErrorCode::FeesTooHigh
    );
    
    // Validate fee distribution ratios
    require!(
        vault_creator_fee_ratio_bps + platform_fee_ratio_bps == MAX_BPS,
        ErrorCode::InvalidFeeRange
    );
    require!(
        vault_creator_fee_ratio_bps > 0 && platform_fee_ratio_bps > 0,
        ErrorCode::InvalidFeeRange
    );

    // Update factory fees
    let factory = &mut ctx.accounts.factory;
    factory.entry_fee_bps = entry_fee_bps;
    factory.exit_fee_bps = exit_fee_bps;
    factory.vault_creation_fee_usdc = vault_creation_fee_usdc;
    factory.min_management_fee_bps = min_management_fee_bps;
    factory.max_management_fee_bps = max_management_fee_bps;
    factory.vault_creator_fee_ratio_bps = vault_creator_fee_ratio_bps;
    factory.platform_fee_ratio_bps = platform_fee_ratio_bps;

    // Emit event
    emit!(FactoryFeesUpdated {
        admin: factory.admin,
        entry_fee_bps,
        exit_fee_bps,
        vault_creation_fee_usdc,
        min_management_fee_bps,
        max_management_fee_bps,
        vault_creator_fee_ratio_bps,
        platform_fee_ratio_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn get_factory_info(ctx: Context<GetFactoryInfo>) -> Result<FactoryInfo> {
    let factory = &ctx.accounts.factory;

    Ok(FactoryInfo {
        factory_address: factory.key(),
        admin: factory.admin,
        fee_recipient: factory.fee_recipient,
        vault_count: factory.vault_count,
        state: factory.state,
        entry_fee_bps: factory.entry_fee_bps,
        exit_fee_bps: factory.exit_fee_bps,
        vault_creation_fee_usdc: factory.vault_creation_fee_usdc,
        min_management_fee_bps: factory.min_management_fee_bps,
        max_management_fee_bps: factory.max_management_fee_bps,
        vault_creator_fee_ratio_bps: factory.vault_creator_fee_ratio_bps,
        platform_fee_ratio_bps: factory.platform_fee_ratio_bps,
    })
}

/// Accrues management fees based on elapsed time since last accrual.
fn accrue_management_fees(vault: &mut Account<Vault>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    if now <= vault.last_fee_accrual_ts { return Ok(()); }

    const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;
    let elapsed = now - vault.last_fee_accrual_ts;
    if elapsed <= 0 { return Ok(()); }

    let annual_bps = vault.management_fees as u128;
    if annual_bps == 0 || vault.total_assets == 0 {
        vault.last_fee_accrual_ts = now;
        return Ok(());
    }

    let fee_numerator: u128 = (vault.total_assets as u128)
        .checked_mul(annual_bps).unwrap()
        .checked_mul(elapsed as u128).unwrap();
    let fee_denominator: u128 = (MAX_BPS as u128)
        .checked_mul(SECONDS_PER_YEAR as u128).unwrap();
    let accrued = fee_numerator.checked_div(fee_denominator).unwrap() as u64;

    if accrued > 0 {
        vault.total_assets = vault.total_assets.checked_sub(accrued).unwrap_or(vault.total_assets);
        vault.accrued_management_fees_usdc = vault.accrued_management_fees_usdc.checked_add(accrued).unwrap();
    }
    vault.last_fee_accrual_ts = now;
    Ok(())
}

pub fn collect_weekly_management_fees(
    ctx: Context<CollectWeeklyManagementFees>,
    vault_index: u32,
) -> Result<()> {
    // Accrue and read required values while holding a short mutable borrow
    let (amount, vault_bump) = {
        let vault = &mut ctx.accounts.vault;
        accrue_management_fees(vault)?;
        (vault.accrued_management_fees_usdc, vault.bump)
    };
    if amount == 0 { return Ok(()); }

    // Calculate fee distribution using configurable ratios from factory
    let factory = &ctx.accounts.factory;
    let vault_creator_share: u64 = ((amount as u128)
        .checked_mul(factory.vault_creator_fee_ratio_bps as u128)
        .unwrap()
        .checked_div(MAX_BPS as u128)
        .unwrap()) as u64;
    let platform_share: u64 = amount.checked_sub(vault_creator_share).unwrap();

    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];

    if vault_creator_share > 0 {
        let transfer = token::Transfer {
            from: ctx.accounts.vault_stablecoin_account.to_account_info(),
            to: ctx.accounts.vault_admin_stablecoin_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), transfer, &binding),
            vault_creator_share,
        )?;
    }

    if platform_share > 0 {
        let transfer = token::Transfer {
            from: ctx.accounts.vault_stablecoin_account.to_account_info(),
            to: ctx.accounts.fee_recipient_stablecoin_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), transfer, &binding),
            platform_share,
        )?;
    }

    // Reset accrued amount in a new short mutable scope
    {
        let vault = &mut ctx.accounts.vault;
        vault.accrued_management_fees_usdc = 0;
    }
    Ok(())
}

pub fn deposit(ctx: Context<Deposit>, vault_index: u32, amount: u64, etf_share_price: u64) -> Result<()> {
    // Accrue management fees before accounting changes
    accrue_management_fees(&mut ctx.accounts.vault)?;
    msg!("💰 Starting deposit process for vault #{}", vault_index);
    msg!("💵 Deposit amount: {} raw units", amount);

    let factory = &ctx.accounts.factory;

    msg!("🏦 Vault: {} ({})", ctx.accounts.vault.vault_name, ctx.accounts.vault.vault_symbol);
    msg!("👤 User: {}", ctx.accounts.user.key());

    // Validations
    require!(ctx.accounts.vault.state == VaultState::Active, ErrorCode::VaultNotActive);
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        factory.state == FactoryState::Active,
        ErrorCode::FactoryNotActive
    );

    // Calculate entry fee
    let entry_fee = (amount as u128)
        .checked_mul(factory.entry_fee_bps as u128)
        .unwrap()
        .checked_div(MAX_BPS as u128)
        .unwrap() as u64;

    // Calculate net deposit amount (only entry fee is deducted)
    let deposit_amount_after_fees = amount.checked_sub(entry_fee).unwrap();

    // Calculate vault tokens to mint based on share price (except first deposit which is 1:1)
    let vault_total_supply_before = ctx.accounts.vault.total_supply;
    let vault_tokens_to_mint: u64 = if vault_total_supply_before == 0 {
        // First deposit initializes price 1:1
        deposit_amount_after_fees
    } else {
        require!(etf_share_price > 0, ErrorCode::InvalidAmount);
        // Price is expressed in stablecoin smallest units per 1 whole share
        // minted = (net_deposit * 10^vault_decimals) / price
        let scale: u128 = 10u128.pow(ctx.accounts.vault_mint.decimals as u32);
        ((deposit_amount_after_fees as u128)
            .checked_mul(scale).unwrap()
            .checked_div(etf_share_price as u128).unwrap()) as u64
    };

    msg!("💸 Fee calculations:");
    msg!(
        "  Entry fee: {} raw units ({} bps)",
        entry_fee,
        factory.entry_fee_bps
    );
    msg!("  Net deposit: {} raw units", deposit_amount_after_fees);
    if vault_total_supply_before > 0 {
        msg!("  Share price (stablecoin units per share): {}", etf_share_price);
    }
    msg!("  Vault tokens to mint: {} raw units", vault_tokens_to_mint);

    // Get stablecoin mint before any mutable borrows
    let _stablecoin_mint = ctx.accounts.user_stablecoin_account.mint;

    // STEP 1: Deduct and distribute fees from the deposited tokens
    msg!("💸 Step 1: Deducting and distributing fees");
    
    // Transfer entry fee to factory fee recipient
    if entry_fee > 0 {
        msg!(
            "🔄 Transferring entry fee: {} raw units to factory fee recipient",
            entry_fee
        );
        let entry_fee_cpi_accounts = token::Transfer {
            from: ctx.accounts.user_stablecoin_account.to_account_info(),
            to: ctx
                .accounts
                .fee_recipient_stablecoin_account
                .to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let entry_fee_cpi_program = ctx.accounts.token_program.to_account_info();
        let entry_fee_cpi_ctx = CpiContext::new(entry_fee_cpi_program, entry_fee_cpi_accounts);
        token::transfer(entry_fee_cpi_ctx, entry_fee)?;
        msg!("✅ Entry fee transfer completed");
    }


    // STEP 2: Transfer remaining USDC to vault for internal swapping
    msg!(
        "🔄 Step 2: Transferring {} USDC to vault for internal swapping",
        deposit_amount_after_fees
    );
    
    let transfer_cpi_accounts = token::Transfer {
        from: ctx.accounts.user_stablecoin_account.to_account_info(),
        to: ctx.accounts.vault_stablecoin_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let transfer_cpi_program = ctx.accounts.token_program.to_account_info();
    let transfer_cpi_ctx = CpiContext::new(transfer_cpi_program, transfer_cpi_accounts);
    token::transfer(transfer_cpi_ctx, deposit_amount_after_fees)?;
    msg!("✅ USDC transfer to vault completed");

    // STEP 3: Update vault state
    msg!("📊 Step 3: Updating vault state");
    
    // Get vault bump and key before updating vault state
    let vault_bump = ctx.accounts.vault.bump;
    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];

    msg!("  Previous total assets: {}", ctx.accounts.vault.total_assets);
    msg!("  Previous total supply: {}", ctx.accounts.vault.total_supply);

    let vault = &mut ctx.accounts.vault;
    vault.total_assets = vault
        .total_assets
        .checked_add(deposit_amount_after_fees)
        .unwrap();
    vault.total_supply = vault
        .total_supply
        .checked_add(vault_tokens_to_mint)
        .unwrap();

    msg!("  New total assets: {}", vault.total_assets);
    msg!("  New total supply: {}", vault.total_supply);

    // STEP 4: Mint vault tokens to user
    msg!("🪙 Step 4: Minting {} vault tokens to user", vault_tokens_to_mint);
    let mint_cpi_accounts = token::MintTo {
        mint: ctx.accounts.vault_mint.to_account_info(),
        to: ctx.accounts.user_vault_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let mint_cpi_program = ctx.accounts.token_program.to_account_info();
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];
    let mint_cpi_ctx =
        CpiContext::new_with_signer(mint_cpi_program, mint_cpi_accounts, &binding);
    token::mint_to(mint_cpi_ctx, vault_tokens_to_mint)?;
    msg!("✅ Vault tokens minted successfully");

    // Emit event
    emit!(DepositEvent {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        stablecoin_mint: ctx.accounts.user_stablecoin_account.mint,
        amount,
        entry_fee,
        vault_tokens_minted: vault_tokens_to_mint,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("🎉 Deposit completed successfully!");
    Ok(())
}


pub fn get_deposit_details(
    ctx: Context<GetDepositDetails>,
    vault_index: u32,
) -> Result<DepositDetails> {
    let vault = &ctx.accounts.vault;
    let factory = &ctx.accounts.factory;
    let user_vault_account = &ctx.accounts.user_vault_account;
    let vault_stablecoin_account = &ctx.accounts.vault_stablecoin_account;

    // Validate vault index
    require!(vault_index < factory.vault_count, ErrorCode::VaultNotFound);

    Ok(DepositDetails {
        vault_address: vault.key(),
        vault_index,
        vault_name: vault.vault_name.clone(),
        vault_symbol: vault.vault_symbol.clone(),
        user_address: ctx.accounts.user.key(),
        user_vault_token_balance: user_vault_account.amount,
        vault_total_assets: vault.total_assets,
        vault_total_supply: vault.total_supply,
        vault_stablecoin_balance: vault_stablecoin_account.amount,
        stablecoin_mint: vault_stablecoin_account.mint,
        vault_state: vault.state,
        created_at: vault.created_at,
    })
}

pub fn execute_swaps(
    ctx: Context<ExecuteSwaps>,
    vault_index: u32,
) -> Result<()> {
    msg!("🔄 Starting swap execution for vault #{}", vault_index);

    let vault = &ctx.accounts.vault;
    let factory = &ctx.accounts.factory;
    let vault_stablecoin_account = &ctx.accounts.vault_stablecoin_account;

    // Validations
    require!(vault.state == VaultState::Active, ErrorCode::VaultNotActive);
    require!(
        factory.state == FactoryState::Active,
        ErrorCode::FactoryNotActive
    );

    // Check if executor is authorized (vault admin or factory admin)
    require!(
        ctx.accounts.executor.key() == vault.admin || ctx.accounts.executor.key() == factory.admin,
        ErrorCode::Unauthorized
    );

    // Check if vault has USDC to swap
    require!(vault_stablecoin_account.amount > 0, ErrorCode::InsufficientFunds);

    msg!("🏦 Vault: {} ({})", vault.vault_name, vault.vault_symbol);
    msg!("👤 Executor: {}", ctx.accounts.executor.key());
    msg!("💰 USDC available for swapping: {}", vault_stablecoin_account.amount);

    // Log underlying assets
    msg!("📊 Underlying assets to swap into:");
    for (i, asset) in vault.underlying_assets.iter().enumerate() {
        msg!(
            "  Asset {}: {} ({} bps)",
            i + 1,
            asset.mint_address,
            asset.mint_bps
        );
    }

    // Note: Jupiter CPI execution will be handled by the client
    // This instruction serves as a placeholder and validation step
    // The actual Jupiter swaps will be executed via CPI in a separate transaction
    // with the Jupiter instructions provided by the client

    msg!("✅ Swap execution validation completed");
    msg!("ℹ️ Note: Actual Jupiter swaps will be executed via CPI with client-provided instructions");

    Ok(())
}

pub fn transfer_vault_to_user(
    ctx: Context<TransferVaultToUser>,
    vault_index: u32,
    amount: u64,
) -> Result<()> {
    msg!("🔄 Transferring {} USDC from vault to user", amount);

    let vault = &ctx.accounts.vault;
    let factory = &ctx.accounts.factory;
    let vault_stablecoin_account = &ctx.accounts.vault_stablecoin_account;

    // Validations
    require!(vault.state == VaultState::Active, ErrorCode::VaultNotActive);
    require!(
        factory.state == FactoryState::Active,
        ErrorCode::FactoryNotActive
    );

    // Check if user is authorized (vault admin or factory admin)
    require!(
        ctx.accounts.user.key() == vault.admin || ctx.accounts.user.key() == factory.admin,
        ErrorCode::Unauthorized
    );

    // Check if vault has enough USDC
    require!(vault_stablecoin_account.amount >= amount, ErrorCode::InsufficientFunds);

    msg!("🏦 Vault: {} ({})", vault.vault_name, vault.vault_symbol);
    msg!("👤 User: {}", ctx.accounts.user.key());
    msg!("💰 Transferring: {} USDC", amount);

    // Transfer USDC from vault to user
    let transfer_cpi_accounts = token::Transfer {
        from: ctx.accounts.vault_stablecoin_account.to_account_info(),
        to: ctx.accounts.user_stablecoin_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let transfer_cpi_program = ctx.accounts.token_program.to_account_info();
    
    // Create signer seeds for vault authority
    let vault_bump = ctx.accounts.vault.bump;
    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];
    let transfer_cpi_ctx = CpiContext::new_with_signer(transfer_cpi_program, transfer_cpi_accounts, &binding);
    
    token::transfer(transfer_cpi_ctx, amount)?;
    msg!("✅ USDC transfer completed");

    Ok(())
}

pub fn withdraw_underlying_to_user(
    ctx: Context<WithdrawUnderlyingToUser>,
    vault_index: u32,
    amount: u64,
) -> Result<()> {
    msg!("🔄 Withdrawing {} tokens of underlying from vault to user", amount);

    let vault_bump = ctx.accounts.vault.bump;
    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];

    // PDA-signed transfer from vault asset ATA to user's ATA
    let transfer_cpi_accounts = token::Transfer {
        from: ctx.accounts.vault_asset_account.to_account_info(),
        to: ctx.accounts.user_asset_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let transfer_cpi_program = ctx.accounts.token_program.to_account_info();
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];
    let transfer_cpi_ctx =
        CpiContext::new_with_signer(transfer_cpi_program, transfer_cpi_accounts, &binding);
    token::transfer(transfer_cpi_ctx, amount)?;

    msg!("✅ Underlying transfer completed");
    Ok(())
}

pub fn finalize_redeem(
    ctx: Context<FinalizeRedeem>,
    vault_index: u32,
    vault_token_amount: u64,
) -> Result<()> {
    // Accrue management fees before settling
    accrue_management_fees(&mut ctx.accounts.vault)?;
    msg!("🧾 Finalizing redeem for {} vault tokens", vault_token_amount);

    // Capture all needed AccountInfos/keys BEFORE mutable borrow to avoid E0502
    let factory = &ctx.accounts.factory;
    let factory_key = factory.key();
    let vault_ai = ctx.accounts.vault.to_account_info();
    let vault_bump = ctx.accounts.vault.bump;
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let vault_stablecoin_ai = ctx.accounts.vault_stablecoin_account.to_account_info();
    let fee_recipient_stablecoin_ai = ctx
        .accounts
        .fee_recipient_stablecoin_account
        .to_account_info();
    let user_stablecoin_ai = ctx.accounts.user_stablecoin_account.to_account_info();
    let vault_mint_ai = ctx.accounts.vault_mint.to_account_info();
    let user_vault_ai = ctx.accounts.user_vault_account.to_account_info();
    let stablecoin_mint_key = ctx.accounts.vault_stablecoin_account.mint;

    let vault_total_assets_pre = ctx.accounts.vault.total_assets;
    let vault_total_supply_pre = ctx.accounts.vault.total_supply;

    // Validations
    require!(vault_token_amount > 0, ErrorCode::InvalidAmount);
    require!(ctx.accounts.vault.state == VaultState::Active, ErrorCode::VaultNotActive);
    require!(
        factory.state == FactoryState::Active,
        ErrorCode::FactoryNotActive
    );
    require!(
        ctx.accounts.user_vault_account.amount >= vault_token_amount,
        ErrorCode::InsufficientVaultTokens
    );

    let total_assets = vault_total_assets_pre;
    let total_supply = vault_total_supply_pre;
    require!(total_supply > 0, ErrorCode::InvalidAmount);

    // User's share in USDC terms
    let user_share_usdc = (vault_token_amount as u128)
        .checked_mul(total_assets as u128)
        .unwrap()
        .checked_div(total_supply as u128)
        .unwrap() as u64;

    // Calculate exit fee
    let exit_fee = (user_share_usdc as u128)
        .checked_mul(factory.exit_fee_bps as u128)
        .unwrap()
        .checked_div(MAX_BPS as u128)
        .unwrap() as u64;
    let net_to_user = user_share_usdc.checked_sub(exit_fee).unwrap();

    msg!("Fees: exit={}, net_to_user={}", exit_fee, net_to_user);

    // Burn user's vault tokens
    let burn_cpi_accounts = token::Burn {
        mint: vault_mint_ai.clone(),
        from: user_vault_ai.clone(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let burn_cpi_ctx = CpiContext::new(token_program_ai.clone(), burn_cpi_accounts);
    token::burn(burn_cpi_ctx, vault_token_amount)?;

    // Transfer fees from vault USDC to recipients
    if exit_fee > 0 {
        let fee_transfer = token::Transfer {
            from: vault_stablecoin_ai.clone(),
            to: fee_recipient_stablecoin_ai.clone(),
            authority: vault_ai.clone(),
        };
        let seeds: &[&[u8]] = &[
            b"vault",
            factory_key.as_ref(),
            &vault_index.to_le_bytes(),
            &[vault_bump],
        ];
        let binding = [seeds];
        token::transfer(CpiContext::new_with_signer(token_program_ai.clone(), fee_transfer, &binding), exit_fee)?;
    }


    // Transfer net USDC to user from vault USDC
    if net_to_user > 0 {
        let net_transfer = token::Transfer {
            from: vault_stablecoin_ai.clone(),
            to: user_stablecoin_ai.clone(),
            authority: vault_ai.clone(),
        };
        let seeds: &[&[u8]] = &[
            b"vault",
            factory_key.as_ref(),
            &vault_index.to_le_bytes(),
            &[vault_bump],
        ];
        let binding = [seeds];
        token::transfer(CpiContext::new_with_signer(token_program_ai.clone(), net_transfer, &binding), net_to_user)?;
    }

    // Update vault supply and assets (now take mutable borrow safely)
    let vault = &mut ctx.accounts.vault;
    vault.total_supply = vault.total_supply.checked_sub(vault_token_amount).unwrap();
    vault.total_assets = vault.total_assets.checked_sub(user_share_usdc).unwrap();

    emit!(RedeemEvent {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        stablecoin_mint: stablecoin_mint_key,
        vault_tokens_burned: vault_token_amount,
        exit_fee,
        stablecoin_amount_redeemed: net_to_user,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("✅ Finalize redeem completed");
    Ok(())
}

pub fn redeem(
    ctx: Context<Redeem>,
    vault_index: u32,
    vault_token_amount: u64,
) -> Result<()> {
    // Accrue management fees before redeem path
    accrue_management_fees(&mut ctx.accounts.vault)?;
    msg!("🔄 Starting redeem process for vault #{}", vault_index);
    msg!("🪙 Vault tokens to redeem: {} raw units", vault_token_amount);

    // Get vault account info and values before creating any mutable references
    let _vault_account_info = ctx.accounts.vault.to_account_info().clone();
    let factory = &ctx.accounts.factory;
    
    // Get all values we need before mutable borrow
    let vault_name = ctx.accounts.vault.vault_name.clone();
    let vault_symbol = ctx.accounts.vault.vault_symbol.clone();
    let vault_state = ctx.accounts.vault.state;
    let vault_total_assets = ctx.accounts.vault.total_assets;
    let vault_total_supply = ctx.accounts.vault.total_supply;
    let _underlying_assets = ctx.accounts.vault.underlying_assets.clone();
    let _vault_bump = ctx.accounts.vault.bump;
    let _factory_key = ctx.accounts.factory.key();
    let _stablecoin_mint = ctx.accounts.user_stablecoin_account.mint;
    
    // Get vault authority before mutable borrow
    let vault_authority = ctx.accounts.vault.to_account_info();
    
    let vault = &mut ctx.accounts.vault;

    msg!("🏦 Vault: {} ({})", vault_name, vault_symbol);
    msg!("👤 User: {}", ctx.accounts.user.key());

    // Validations
    require!(vault_token_amount > 0, ErrorCode::InvalidAmount);
    require!(vault_state == VaultState::Active, ErrorCode::VaultNotActive);
    require!(
        factory.state == FactoryState::Active,
        ErrorCode::FactoryNotActive
    );
    require!(
        ctx.accounts.user_vault_account.amount >= vault_token_amount,
        ErrorCode::InsufficientVaultTokens
    );

    // Calculate the market value of the user's vault tokens
    // This should be based on the current value of the underlying assets, not the vault's total assets
    // For now, we'll use a simple calculation based on the vault's total assets
    // TODO: Implement proper market value calculation based on underlying asset prices
    let total_stablecoin_amount = (vault_token_amount as u128)
        .checked_mul(vault_total_assets as u128)
        .unwrap()
        .checked_div(vault_total_supply as u128)
        .unwrap() as u64;

    // Calculate exit fee based on the stablecoin amount
    let exit_fee = (total_stablecoin_amount as u128)
        .checked_mul(factory.exit_fee_bps as u128)
        .unwrap()
        .checked_div(MAX_BPS as u128)
        .unwrap() as u64;

    // Calculate net redeem amount (only exit fee is deducted)
    let stablecoin_amount_after_fees = total_stablecoin_amount.checked_sub(exit_fee).unwrap();

    msg!("💸 Fee calculations:");
    msg!("  Total stablecoin amount: {} raw units", total_stablecoin_amount);
    msg!(
        "  Exit fee: {} raw units ({} bps)",
        exit_fee,
        factory.exit_fee_bps
    );
    msg!("  Net stablecoin amount: {} raw units", stablecoin_amount_after_fees);

    // Get all required data for CPI calls
    let vault_bump = vault.bump;
    let vault_key = vault.key();
    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];
    
    // Prepare seeds for CPI calls
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let _binding = [seeds];

    
    // STEP 1: Transfer tokens from vault to user
    msg!("🔄 Step 1: Transferring tokens from vault to user");
    
    let transfer_cpi_accounts = token::Transfer {
        from: ctx.accounts.vault_stablecoin_account.to_account_info(),
        to: ctx.accounts.user_stablecoin_account.to_account_info(),
        authority: vault_authority,
    };
    let transfer_cpi_program = ctx.accounts.token_program.to_account_info();
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];
    let transfer_cpi_ctx = CpiContext::new_with_signer(transfer_cpi_program, transfer_cpi_accounts, &binding);
    token::transfer(transfer_cpi_ctx, total_stablecoin_amount)?;
    msg!("✅ Token transfer to user completed");

    // STEP 2: Update vault state
    msg!("📊 Step 2: Updating vault state");
    msg!("  Previous total assets: {}", vault_total_assets);
    msg!("  Previous total supply: {}", vault_total_supply);

    vault.total_assets = vault_total_assets
        .checked_sub(total_stablecoin_amount)
        .unwrap();
    vault.total_supply = vault_total_supply
        .checked_sub(vault_token_amount)
        .unwrap();

    msg!("  New total assets: {}", vault.total_assets);
    msg!("  New total supply: {}", vault.total_supply);

    // STEP 3: Burn vault tokens from user
    msg!("🔥 Step 3: Burning {} vault tokens from user", vault_token_amount);
    let burn_cpi_accounts = token::Burn {
        mint: ctx.accounts.vault_mint.to_account_info(),
        from: ctx.accounts.user_vault_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let burn_cpi_program = ctx.accounts.token_program.to_account_info();
    let burn_cpi_ctx = CpiContext::new(burn_cpi_program, burn_cpi_accounts);
    token::burn(burn_cpi_ctx, vault_token_amount)?;
    msg!("✅ Vault tokens burned successfully");

    // STEP 4: Transfer exit fee to factory fee recipient
    if exit_fee > 0 {
        msg!(
            "🔄 Step 4: Transferring exit fee: {} raw units to factory fee recipient",
            exit_fee
        );
        let exit_fee_cpi_accounts = token::Transfer {
            from: ctx.accounts.user_stablecoin_account.to_account_info(),
            to: ctx
                .accounts
                .fee_recipient_stablecoin_account
                .to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let exit_fee_cpi_program = ctx.accounts.token_program.to_account_info();
        let exit_fee_cpi_ctx = CpiContext::new(exit_fee_cpi_program, exit_fee_cpi_accounts);
        token::transfer(exit_fee_cpi_ctx, exit_fee)?;
        msg!("✅ Exit fee transfer completed");
    }


    // Emit event
    emit!(RedeemEvent {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        stablecoin_mint: ctx.accounts.vault_stablecoin_account.mint,
        vault_tokens_burned: vault_token_amount,
        exit_fee,
        stablecoin_amount_redeemed: stablecoin_amount_after_fees,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("🎉 Redeem completed successfully!");
    Ok(())
}


pub fn set_vault_paused(ctx: Context<SetVaultPaused>, _vault_index: u32, paused: bool) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let prev_state = vault.state;

    if paused {
        // Allow pausing from any state except Closed
        require!(vault.state != VaultState::Closed, ErrorCode::VaultNotActive);
        if vault.state != VaultState::Paused {
            vault.state = VaultState::Paused;
            emit!(VaultPaused {
                vault: vault.key(),
                admin: ctx.accounts.admin.key(),
                timestamp: Clock::get()?.unix_timestamp,
            });
        }
    } else {
        // Allow resuming from Paused state
        require!(vault.state == VaultState::Paused, ErrorCode::FactoryNotActive);
        vault.state = VaultState::Active;
        emit!(VaultResumed {
            vault: vault.key(),
            admin: ctx.accounts.admin.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
    }

    msg!("Vault state changed from {:?} to {:?}", prev_state, vault.state);
    Ok(())
}

pub fn get_vault_fees(ctx: Context<GetVaultFees>, _vault_index: u32) -> Result<VaultFees> {
    let factory = &ctx.accounts.factory;
    let vault = &ctx.accounts.vault;

    Ok(VaultFees {
        // Factory fees
        entry_fee_bps: factory.entry_fee_bps,
        exit_fee_bps: factory.exit_fee_bps,
        vault_creation_fee_usdc: factory.vault_creation_fee_usdc,
        min_management_fee_bps: factory.min_management_fee_bps,
        max_management_fee_bps: factory.max_management_fee_bps,
        
        // Vault-specific fees
        vault_management_fees: vault.management_fees,
        
        // Vault info
        vault_index: vault.vault_index,
        vault_name: vault.vault_name.clone(),
        vault_symbol: vault.vault_symbol.clone(),
        vault_admin: vault.admin,
    })
}

pub fn get_accrued_management_fees<'info>(
    ctx: Context<'_, '_, 'info, 'info, GetAccruedManagementFees<'info>>,
    vault_index: u32,
    asset_prices: Vec<AssetPrice>,
) -> Result<AccruedManagementFees> {
    let vault = &mut ctx.accounts.vault;
    let now = Clock::get()?.unix_timestamp;
    
    // Store the previously accrued fees before updating
    let previously_accrued_fees = vault.accrued_management_fees_usdc;
    
    // Calculate elapsed time since last accrual
    let elapsed = if now > vault.last_fee_accrual_ts {
        now - vault.last_fee_accrual_ts
    } else {
        0
    };
    
    // Validate that asset_prices matches vault's underlying assets
    require!(
        asset_prices.len() == vault.underlying_assets.len(),
        ErrorCode::InvalidUnderlyingAssets
    );
    
    // Calculate GAV (Gross Asset Value) from live asset balances and prices
    let mut asset_balances = Vec::new();
    let mut gav_usd: u64 = 0;
    
    // Add stablecoin balance to GAV
    let stablecoin_balance = ctx.accounts.vault_stablecoin_account.amount;
    gav_usd = gav_usd.checked_add(stablecoin_balance).unwrap();
    
    asset_balances.push(AssetBalance {
        mint_address: ctx.accounts.vault_stablecoin_account.mint,
        balance: stablecoin_balance,
        price_usd: 1_000_000, // 1 USD with 6 decimals
        value_usd: stablecoin_balance,
    });
    
    // Validate that remaining accounts match the number of underlying assets
    require!(
        ctx.remaining_accounts.len() == vault.underlying_assets.len(),
        ErrorCode::InvalidUnderlyingAssets
    );
    
    // Calculate value of underlying assets using remaining accounts
    for (i, underlying_asset) in vault.underlying_assets.iter().enumerate() {
        // Find corresponding price
        let asset_price = asset_prices.iter()
            .find(|price| price.mint_address == underlying_asset.mint_address)
            .ok_or(ErrorCode::InvalidUnderlyingAssets)?;
        
        // Get asset balance from vault's token account (from remaining accounts)
        let asset_account_info = &ctx.remaining_accounts[i];
        let asset_account = Account::<TokenAccount>::try_from(asset_account_info)
            .map_err(|_| ErrorCode::InvalidUnderlyingAssets)?;
        
        // Validate that this account's mint matches the expected asset mint
        require!(
            asset_account.mint == underlying_asset.mint_address,
            ErrorCode::InvalidUnderlyingAssets
        );
        
        let asset_balance = asset_account.amount;
        
        // Calculate USD value: balance * price (both with 6 decimals)
        let value_usd = (asset_balance as u128)
            .checked_mul(asset_price.price_usd as u128)
            .unwrap()
            .checked_div(1_000_000) // Divide by 1e6 to handle decimal precision
            .unwrap() as u64;
        
        gav_usd = gav_usd.checked_add(value_usd).unwrap();
        
        asset_balances.push(AssetBalance {
            mint_address: underlying_asset.mint_address,
            balance: asset_balance,
            price_usd: asset_price.price_usd,
            value_usd,
        });
    }
    
    // Calculate newly accrued fees using GAV
    let newly_accrued_fees = if elapsed > 0 && vault.management_fees > 0 && gav_usd > 0 {
        const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;
        let annual_bps = vault.management_fees as u128;
        
        let fee_numerator: u128 = (gav_usd as u128)
            .checked_mul(annual_bps).unwrap()
            .checked_mul(elapsed as u128).unwrap();
        let fee_denominator: u128 = (MAX_BPS as u128)
            .checked_mul(SECONDS_PER_YEAR as u128).unwrap();
        
        let accrued = fee_numerator.checked_div(fee_denominator).unwrap() as u64;
        
        // Update vault state with newly accrued fees
        if accrued > 0 {
            vault.accrued_management_fees_usdc = vault.accrued_management_fees_usdc.checked_add(accrued).unwrap();
        }
        vault.last_fee_accrual_ts = now;
        
        accrued
    } else {
        0
    };
    
    // NAV (Net Asset Value) = GAV - total accrued fees
    let total_accrued_fees = vault.accrued_management_fees_usdc;
    let nav_usd = gav_usd.checked_sub(total_accrued_fees).unwrap_or(0);

    msg!("NAV: {}", nav_usd);
    msg!("GAV: {}", gav_usd);
    msg!("Total Accrued Fees: {}", total_accrued_fees);
    msg!("Newly Accrued Fees: {}", newly_accrued_fees);
    msg!("Previously Accrued Fees: {}", previously_accrued_fees);
    msg!("Elapsed: {}", elapsed);
    msg!("Current Timestamp: {}", now);
    msg!("Last Fee Accrual Timestamp: {}", vault.last_fee_accrual_ts);
    msg!("Vault Index: {}", vault_index);
    msg!("Vault Name: {}", vault.vault_name);
    msg!("Vault Admin: {}", vault.admin);
    msg!("Management Fee Bps: {}", vault.management_fees);
    msg!("Done");
    
    Ok(AccruedManagementFees {
        vault_index,
        vault_name: vault.vault_name.clone(),
        vault_symbol: vault.vault_symbol.clone(),
        vault_admin: vault.admin,
        management_fee_bps: vault.management_fees,
        nav: nav_usd,                              // Net Asset Value (GAV - accrued fees)
        gav: gav_usd,                              // Gross Asset Value (calculated from live prices)
        last_fee_accrual_ts: vault.last_fee_accrual_ts,
        current_timestamp: now,
        elapsed_seconds: elapsed,
        previously_accrued_fees,
        newly_accrued_fees,
        total_accrued_fees,
        asset_balances,
    })
}

pub fn distribute_accrued_fees(
    ctx: Context<DistributeAccruedFees>,
    vault_index: u32,
) -> Result<()> {
    msg!("💰 Starting accrued fees distribution for vault #{}", vault_index);

    // Accrue and read required values while holding a short mutable borrow
    let (total_accrued_fees, vault_bump, vault_key, factory_key) = {
        let vault = &mut ctx.accounts.vault;
        accrue_management_fees(vault)?;
        (vault.accrued_management_fees_usdc, vault.bump, vault.key(), ctx.accounts.factory.key())
    };

    if total_accrued_fees == 0 {
        msg!("ℹ️ No accrued fees to distribute");
        return Ok(());
    }

    msg!("💵 Total accrued fees to distribute: {} USDC", total_accrued_fees);

    // Calculate fee distribution using configurable ratios from factory
    let factory = &ctx.accounts.factory;
    let vault_creator_share_usdc: u64 = ((total_accrued_fees as u128)
        .checked_mul(factory.vault_creator_fee_ratio_bps as u128)
        .unwrap()
        .checked_div(MAX_BPS as u128)
        .unwrap()) as u64;
    let platform_share_usdc: u64 = total_accrued_fees.checked_sub(vault_creator_share_usdc).unwrap();

    msg!("📊 Fee distribution:");
    msg!("  Vault creator share: {} USDC ({} bps)", vault_creator_share_usdc, factory.vault_creator_fee_ratio_bps);
    msg!("  Platform share: {} USDC ({} bps)", platform_share_usdc, factory.platform_fee_ratio_bps);

    // Calculate equivalent vault tokens to mint
    // We use the vault's total supply and total assets to determine the token amount
    let vault_total_supply = ctx.accounts.vault.total_supply;
    let vault_total_assets = ctx.accounts.vault.total_assets;

    if vault_total_supply == 0 || vault_total_assets == 0 {
        msg!("⚠️ Vault has no supply or assets, cannot calculate token equivalents");
        return Ok(());
    }

    // Calculate vault tokens equivalent to the USDC amounts
    // Formula: vault_tokens = (usdc_amount * total_supply) / total_assets
    let vault_creator_share_tokens: u64 = if vault_creator_share_usdc > 0 {
        ((vault_creator_share_usdc as u128)
            .checked_mul(vault_total_supply as u128)
            .unwrap()
            .checked_div(vault_total_assets as u128)
            .unwrap()) as u64
    } else {
        0
    };

    let platform_share_tokens: u64 = if platform_share_usdc > 0 {
        ((platform_share_usdc as u128)
            .checked_mul(vault_total_supply as u128)
            .unwrap()
            .checked_div(vault_total_assets as u128)
            .unwrap()) as u64
    } else {
        0
    };

    msg!("🪙 Vault token distribution:");
    msg!("  Vault creator tokens: {} (equivalent to {} USDC)", vault_creator_share_tokens, vault_creator_share_usdc);
    msg!("  Platform tokens: {} (equivalent to {} USDC)", platform_share_tokens, platform_share_usdc);

    // Prepare signer seeds for vault authority
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];
    let seeds: &[&[u8]] = &[
        b"vault",
        factory_key.as_ref(),
        &vault_index_bytes,
        &bump_array,
    ];
    let binding = [seeds];

    // Mint vault tokens to vault creator
    if vault_creator_share_tokens > 0 {
        msg!("🪙 Minting {} vault tokens to vault creator", vault_creator_share_tokens);
        let mint_cpi_accounts = token::MintTo {
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.vault_admin_vault_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let mint_cpi_program = ctx.accounts.token_program.to_account_info();
        let mint_cpi_ctx = CpiContext::new_with_signer(mint_cpi_program, mint_cpi_accounts, &binding);
        token::mint_to(mint_cpi_ctx, vault_creator_share_tokens)?;
        msg!("✅ Vault creator tokens minted successfully");
    }

    // Mint vault tokens to platform
    if platform_share_tokens > 0 {
        msg!("🪙 Minting {} vault tokens to platform", platform_share_tokens);
        let mint_cpi_accounts = token::MintTo {
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.fee_recipient_vault_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let mint_cpi_program = ctx.accounts.token_program.to_account_info();
        let mint_cpi_ctx = CpiContext::new_with_signer(mint_cpi_program, mint_cpi_accounts, &binding);
        token::mint_to(mint_cpi_ctx, platform_share_tokens)?;
        msg!("✅ Platform tokens minted successfully");
    }

    // Update vault state: reset accrued fees and update total supply
    {
        let vault = &mut ctx.accounts.vault;
        vault.accrued_management_fees_usdc = 0;
        vault.total_supply = vault.total_supply
            .checked_add(vault_creator_share_tokens)
            .unwrap()
            .checked_add(platform_share_tokens)
            .unwrap();
    }

    // Emit event
    emit!(AccruedFeesDistributed {
        vault: vault_key,
        collector: ctx.accounts.collector.key(),
        vault_index,
        total_accrued_fees_usdc: total_accrued_fees,
        vault_creator_share_tokens,
        platform_share_tokens,
        vault_creator_fee_ratio_bps: factory.vault_creator_fee_ratio_bps,
        platform_fee_ratio_bps: factory.platform_fee_ratio_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("🎉 Accrued fees distribution completed successfully!");
    msg!("📊 Summary:");
    msg!("  Total fees distributed: {} USDC", total_accrued_fees);
    msg!("  Vault creator received: {} vault tokens", vault_creator_share_tokens);
    msg!("  Platform received: {} vault tokens", platform_share_tokens);
    msg!("  New total supply: {}", ctx.accounts.vault.total_supply);

    Ok(())
}


