use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
use anchor_spl::token_interface::{self as token_interface};
use mpl_token_metadata::{
    instructions::CreateMetadataAccountV3,
    types::DataV2,
};
use crate::{
    contexts::*,
    constants::*,
    errors::ErrorCode,
    events::*,
    state::*,
};

// ---------- Instructions ----------
pub fn update_factory_admin(
    ctx: Context<UpdateFactoryAdmin>,
) -> Result<()> {
    let factory = &mut ctx.accounts.factory;
    let previous_admin = factory.admin;
    factory.admin = ctx.accounts.new_admin.key();

    emit!(FactoryAdminUpdated {
        previous_admin,
        new_admin: factory.admin,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

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
    metadata_uri: String,
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
    let allocated_space = Vault::INIT_SPACE;
    
    require!(
        num_assets >= MIN_UNDERLYING_ASSETS && num_assets <= MAX_UNDERLYING_ASSETS,
        ErrorCode::InvalidUnderlyingAssets
    );
    
    require!(
        required_space <= MAX_ACCOUNT_SIZE,
        ErrorCode::AccountTooLarge
    );
    
    // Ensure the required space fits within the allocated space
    // INIT_SPACE is set to MAX_UNDERLYING_ASSETS (240) to support any number of assets
    require!(
        required_space <= allocated_space,
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

    // Charge one-time creation fee: use configurable fee from factory
    // Fee is stored in USDC with 6 decimals (e.g., 10 USDC = 10_000_000)
    // Fallback to default if somehow 0 (safety check)
    let creation_fee_amount: u64 = if factory.vault_creation_fee_usdc == 0 {
        DEFAULT_VAULT_CREATION_FEE_USDC
    } else {
        factory.vault_creation_fee_usdc
    };
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

    // Initialize vault account (short borrow scope)
    {
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
    }

    msg!("🔑 Vault PDA: {}", ctx.accounts.vault.key());
    msg!("👑 Vault Admin: {}", ctx.accounts.vault.admin);
    msg!("🪙 Vault Mint PDA: {}", ctx.accounts.vault_mint.key());
    msg!(
        "💳 Vault Token Account PDA: {}",
        ctx.accounts.vault_token_account.key()
    );
    msg!("📅 Created at: {}", ctx.accounts.vault.created_at);

    // Create token metadata for the vault token
    {
        let vault_bump = ctx.accounts.vault.bump;
        let vault_index_bytes = vault_index.to_le_bytes();
        let bump_array = [vault_bump];
        let seeds: &[&[u8]] = &[
            b"vault",
            factory_key.as_ref(),
            &vault_index_bytes,
            &bump_array,
        ];
        // Prepare metadata data
        let metadata_data = DataV2 {
            name: vault_name.clone(),
            symbol: vault_symbol.clone(),
            uri: metadata_uri.clone(), // URI pointing to JSON metadata file (e.g., IPFS)
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        // Create metadata account via CPI
        let create_metadata_ix = CreateMetadataAccountV3 {
            metadata: ctx.accounts.metadata_account.key(),
            mint: ctx.accounts.vault_mint.key(),
            mint_authority: ctx.accounts.vault.key(),
            payer: ctx.accounts.admin.key(),
            update_authority: (ctx.accounts.vault.key(), true),
            system_program: ctx.accounts.system_program.key(),
            rent: Some(ctx.accounts.rent.key()),
        };

        let create_metadata_args = mpl_token_metadata::instructions::CreateMetadataAccountV3InstructionArgs {
            data: metadata_data,
            is_mutable: true,
            collection_details: None,
        };

        let instruction = CreateMetadataAccountV3::instruction(
            &create_metadata_ix,
            create_metadata_args,
        );

        let account_infos = vec![
            ctx.accounts.metadata_account.to_account_info(),
            ctx.accounts.vault_mint.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
            ctx.accounts.token_metadata_program.to_account_info(),
        ];

        anchor_lang::solana_program::program::invoke_signed(
            &instruction,
            &account_infos,
            &[seeds],
        )?;
        msg!("📝 Created token metadata for vault token");
    }

    // Seed initial supply: mint 1 smallest unit of the vault token to the vault's own token account
    // This keeps supply > 0 while assets remain 0, avoiding divide-by-zero in future logic.
    {
        let vault_bump = ctx.accounts.vault.bump;
        let vault_index_bytes = vault_index.to_le_bytes();
        let bump_array = [vault_bump];
        let seeds: &[&[u8]] = &[
            b"vault",
            factory_key.as_ref(),
            &vault_index_bytes,
            &bump_array,
        ];
        let binding = [seeds];
        let mint_cpi_accounts = token::MintTo {
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let mint_cpi_program = ctx.accounts.token_program.to_account_info();
        let mint_cpi_ctx = CpiContext::new_with_signer(mint_cpi_program, mint_cpi_accounts, &binding);
        token::mint_to(mint_cpi_ctx, 1_000_000)?;
        {
            let vault = &mut ctx.accounts.vault;
            vault.total_supply = vault.total_supply.checked_add(1_000_000).unwrap();
        }
        msg!("🪙 Seeded initial vault supply with 1.000000 token (1_000_000 base units)");
    }

    // Emit event
    emit!(VaultCreated {
        vault: ctx.accounts.vault.key(),
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
/// Standardized formula: fee = (total_assets * annual_fee_bps * elapsed_seconds) / (MAX_BPS * SECONDS_PER_YEAR)
/// This function is called before any fee-related operations to ensure fees are up-to-date.
/// 
/// Fee accrual is based on:
/// - Total assets under management (AUM) - stored in vault.total_assets
/// - Annual fee rate in basis points - stored in vault.management_fees
/// - Time elapsed since last accrual - calculated from last_fee_accrual_ts
/// 
/// The accrued fees are deducted from total_assets (reducing NAV) and tracked in accrued_management_fees_usdc.
fn accrue_management_fees(vault: &mut Account<Vault>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    
    // Early return if no time has elapsed
    if now <= vault.last_fee_accrual_ts {
        return Ok(());
    }

    const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;
    let elapsed = now - vault.last_fee_accrual_ts;
    
    // Validate elapsed time is positive
    if elapsed <= 0 {
        return Ok(());
    }

    let annual_bps = vault.management_fees as u128;
    
    // Early return if no fees configured or no assets
    if annual_bps == 0 || vault.total_assets == 0 {
        vault.last_fee_accrual_ts = now;
        return Ok(());
    }

    // Standardized fee accrual formula:
    // fee = (total_assets * annual_fee_bps * elapsed_seconds) / (MAX_BPS * SECONDS_PER_YEAR)
    // This calculates the pro-rata fee based on:
    // - Total assets under management (AUM)
    // - Annual fee rate in basis points
    // - Time elapsed since last accrual
    let fee_numerator: u128 = (vault.total_assets as u128)
        .checked_mul(annual_bps).ok_or(ErrorCode::InvalidAmount)?
        .checked_mul(elapsed as u128).ok_or(ErrorCode::InvalidAmount)?;
    let fee_denominator: u128 = (MAX_BPS as u128)
        .checked_mul(SECONDS_PER_YEAR as u128).ok_or(ErrorCode::InvalidAmount)?;
    
    let accrued = fee_numerator.checked_div(fee_denominator).unwrap_or(0) as u64;

    if accrued > 0 {
        // Deduct accrued fees from total assets (reduces NAV)
        vault.total_assets = vault.total_assets.checked_sub(accrued).unwrap_or(vault.total_assets);
        // Add to accrued fees tracker
        vault.accrued_management_fees_usdc = vault.accrued_management_fees_usdc.checked_add(accrued).unwrap_or(vault.accrued_management_fees_usdc);
        
        msg!("📊 Fee accrual:");
        msg!("  Elapsed time: {} seconds", elapsed);
        msg!("  Total assets (AUM): {} USDC", vault.total_assets + accrued);
        msg!("  Annual fee rate: {} bps", annual_bps);
        msg!("  Accrued fees: {} USDC", accrued);
        msg!("  Total accrued fees: {} USDC", vault.accrued_management_fees_usdc);
    }
    
    // Update last accrual timestamp
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

    // Calculate vault tokens to mint based on provided share price (always price-based)
    // If share price is 0, treat as 1:1 ratio (deposit amount = vault tokens at same scale)
    let scale: u128 = 10u128.pow(ctx.accounts.vault_mint.decimals as u32);
    let vault_tokens_to_mint: u64 = if etf_share_price == 0 {
        // If share price is 0, use deposit amount directly (1:1 ratio)
        deposit_amount_after_fees
    } else {
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
    msg!("  Share price (stablecoin units per share): {}", etf_share_price);
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
    decimals: u8,
) -> Result<()> {
    msg!("🔄 Withdrawing {} tokens of underlying from vault to user", amount);

    let vault_bump = ctx.accounts.vault.bump;
    let factory_key = ctx.accounts.factory.key();
    let vault_index_bytes = vault_index.to_le_bytes();
    let bump_array = [vault_bump];

    // Validate token program ID - must be either SPL Token or Token-2022
    let token_program_key = ctx.accounts.token_program.key();
    
    // Hardcoded program IDs for validation
    let is_token_2022 = token_program_key == TOKEN_2022_PROGRAM_ID;
    let is_spl_token = token_program_key == TOKEN_PROGRAM_ID;
    
    require!(
        is_spl_token || is_token_2022,
        ErrorCode::InvalidAmount
    );
    
    msg!("📋 Token Program: {}", if is_token_2022 { "Token-2022" } else { "SPL Token" });
    msg!("🔢 Mint decimals: {} (passed as parameter)", decimals);

    // Validate account owners match the token program
    require!(
        ctx.accounts.vault_asset_account.owner == &token_program_key,
        ErrorCode::InvalidAmount
    );
    require!(
        ctx.accounts.user_asset_account.owner == &token_program_key,
        ErrorCode::InvalidAmount
    );
    
    // PDA-signed transfer from vault asset ATA to user's ATA
    // Using transfer_checked to support both SPL Token and Token-2022
    // Token-2022 requires transfer_checked with mint account
    let transfer_cpi_accounts = token_interface::TransferChecked {
        from: ctx.accounts.vault_asset_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
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
    
    // Execute transfer_checked (works for both SPL Token and Token-2022)
    token_interface::transfer_checked(transfer_cpi_ctx, amount, decimals)?;

    msg!("✅ Underlying transfer completed");
    Ok(())
}

pub fn finalize_redeem(
    ctx: Context<FinalizeRedeem>,
    vault_index: u32,
    vault_token_amount: u64,
    etf_share_price: u64,
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

    let total_supply = vault_total_supply_pre;
    require!(total_supply > 0, ErrorCode::InvalidAmount);

    // Compute gross payout from client-provided share price
    // If share price is 0, payout will be 0
    let scale: u128 = 10u128.pow(ctx.accounts.vault_mint.decimals as u32);
    let user_share_usdc = ((vault_token_amount as u128)
        .checked_mul(etf_share_price as u128).unwrap()
        .checked_div(scale).unwrap()) as u64;

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

    // Ensure vault has enough USDC to cover payouts
    require!(ctx.accounts.vault_stablecoin_account.amount >= net_to_user, ErrorCode::InsufficientFunds);

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
    share_price: u64,
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
    msg!("Provided Share Price: {} (raw units)", share_price);
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
    share_price: u64,
    management_fees_amount: u64,
) -> Result<()> {
    msg!("💰 Starting accrued fees distribution for vault #{}", vault_index);

    // Validate management fees amount
    require!(management_fees_amount > 0, ErrorCode::InvalidAmount);

    // Read required values (no fee accrual - fees calculated off-chain)
    let (vault_bump, vault_key, factory_key) = {
        let vault = &ctx.accounts.vault;
        (vault.bump, vault.key(), ctx.accounts.factory.key())
    };

    let total_accrued_fees = management_fees_amount;

    msg!("💵 Total accrued fees to distribute: {} USDC (from off-chain calculation)", total_accrued_fees);

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

    // Calculate equivalent vault tokens to mint using share price (same formula as deposit)
    // Vault tokens = (usdc_amount * scale) / share_price
    // If share price is 0, treat as 1:1 ratio (same as deposit)
    let vault_total_supply = ctx.accounts.vault.total_supply;
    let vault_total_assets = ctx.accounts.vault.total_assets;

    if vault_total_supply == 0 || vault_total_assets == 0 {
        msg!("⚠️ Vault has no supply or assets, cannot calculate token equivalents");
        return Ok(());
    }

    let scale: u128 = 10u128.pow(ctx.accounts.vault_mint.decimals as u32);
    
    msg!("📊 Share price:");
    msg!("  Provided share price: {} (raw units)", share_price);
    msg!("  Total assets: {} USDC", vault_total_assets);
    msg!("  Total supply: {} tokens", vault_total_supply);

    // Calculate vault tokens using the same formula as deposit: vault_tokens = (usdc_amount * scale) / share_price
    // If share price is 0, treat as 1:1 ratio (same as deposit)
    let vault_creator_share_tokens: u64 = if vault_creator_share_usdc > 0 {
        if share_price == 0 {
            // If share price is 0, use 1:1 ratio (same as deposit)
            vault_creator_share_usdc
        } else {
            ((vault_creator_share_usdc as u128)
                .checked_mul(scale)
                .ok_or(ErrorCode::InvalidAmount)?
                .checked_div(share_price as u128)
                .ok_or(ErrorCode::InvalidAmount)?) as u64
        }
    } else {
        0
    };

    let platform_share_tokens: u64 = if platform_share_usdc > 0 {
        if share_price == 0 {
            // If share price is 0, use 1:1 ratio (same as deposit)
            platform_share_usdc
        } else {
            ((platform_share_usdc as u128)
                .checked_mul(scale)
                .ok_or(ErrorCode::InvalidAmount)?
                .checked_div(share_price as u128)
                .ok_or(ErrorCode::InvalidAmount)?) as u64
        }
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

/// Claim management fees directly by the vault creator.
/// This allows DTF creators to claim their accrued management fees without relying on admin/keeper.
/// Fees are distributed as vault tokens according to factory-configured ratios (creator share + platform share).
/// This aligns fee recipients with vault performance by giving them vault shares.
/// share_price: Current share price in raw stablecoin units per share (same format as deposit)
pub fn claim_management_fee(
    ctx: Context<ClaimManagementFee>,
    vault_index: u32,
    share_price: u64,
    management_fees_amount: u64,
) -> Result<()> {
    msg!("💰 Starting management fee claim for vault #{}", vault_index);
    msg!("👤 Creator: {}", ctx.accounts.creator.key());
    
    // Validate management fees amount
    require!(management_fees_amount > 0, ErrorCode::InvalidAmount);

    // Read required values (no fee accrual - fees calculated off-chain)
    let (vault_bump, vault_key, factory_key, creator_key) = {
        let vault = &ctx.accounts.vault;
        (
            vault.bump,
            vault.key(),
            ctx.accounts.factory.key(),
            ctx.accounts.creator.key(),
        )
    };

    let total_accrued_fees = management_fees_amount;

    msg!("💵 Total accrued fees: {} USDC (from off-chain calculation)", total_accrued_fees);
    msg!("📅 Timestamp: {}", Clock::get()?.unix_timestamp);
    msg!("🏦 Vault: {} ({})", ctx.accounts.vault.vault_name, ctx.accounts.vault.vault_symbol);

    // Calculate fee distribution using configurable ratios from factory
    let factory = &ctx.accounts.factory;
    let creator_share_usdc: u64 = ((total_accrued_fees as u128)
        .checked_mul(factory.vault_creator_fee_ratio_bps as u128)
        .ok_or(ErrorCode::InvalidAmount)?
        .checked_div(MAX_BPS as u128)
        .ok_or(ErrorCode::InvalidAmount)?) as u64;
    let platform_share_usdc: u64 = total_accrued_fees
        .checked_sub(creator_share_usdc)
        .ok_or(ErrorCode::InvalidAmount)?;

    msg!("📊 Fee distribution:");
    msg!("  Creator share: {} USDC ({} bps)", creator_share_usdc, factory.vault_creator_fee_ratio_bps);
    msg!("  Platform share: {} USDC ({} bps)", platform_share_usdc, factory.platform_fee_ratio_bps);

    // Calculate equivalent vault tokens to mint using share price (same formula as deposit)
    // Vault tokens = (usdc_amount * scale) / share_price
    // If share price is 0, treat as 1:1 ratio (same as deposit)
    let vault_total_supply = ctx.accounts.vault.total_supply;
    let vault_total_assets = ctx.accounts.vault.total_assets;

    if vault_total_supply == 0 || vault_total_assets == 0 {
        msg!("⚠️ Vault has no supply or assets, cannot calculate token equivalents");
        return Ok(());
    }

    let scale: u128 = 10u128.pow(ctx.accounts.vault_mint.decimals as u32);
    
    msg!("📊 Share price:");
    msg!("  Provided share price: {} (raw units)", share_price);
    msg!("  Total assets: {} USDC", vault_total_assets);
    msg!("  Total supply: {} tokens", vault_total_supply);

    // Calculate vault tokens using the same formula as deposit: vault_tokens = (usdc_amount * scale) / share_price
    // If share price is 0, treat as 1:1 ratio (same as deposit)
    let creator_share_tokens: u64 = if creator_share_usdc > 0 {
        if share_price == 0 {
            // If share price is 0, use 1:1 ratio (same as deposit)
            creator_share_usdc
        } else {
            ((creator_share_usdc as u128)
                .checked_mul(scale)
                .ok_or(ErrorCode::InvalidAmount)?
                .checked_div(share_price as u128)
                .ok_or(ErrorCode::InvalidAmount)?) as u64
        }
    } else {
        0
    };

    let platform_share_tokens: u64 = if platform_share_usdc > 0 {
        if share_price == 0 {
            // If share price is 0, use 1:1 ratio (same as deposit)
            platform_share_usdc
        } else {
            ((platform_share_usdc as u128)
                .checked_mul(scale)
                .ok_or(ErrorCode::InvalidAmount)?
                .checked_div(share_price as u128)
                .ok_or(ErrorCode::InvalidAmount)?) as u64
        }
    } else {
        0
    };

    msg!("🪙 Vault token distribution:");
    msg!("  Creator tokens: {} (equivalent to {} USDC)", creator_share_tokens, creator_share_usdc);
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

    // Mint vault tokens to creator
    if creator_share_tokens > 0 {
        msg!("🪙 Minting {} vault tokens to creator", creator_share_tokens);
        let mint_cpi_accounts = token::MintTo {
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.creator_vault_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let mint_cpi_program = ctx.accounts.token_program.to_account_info();
        let mint_cpi_ctx = CpiContext::new_with_signer(mint_cpi_program, mint_cpi_accounts, &binding);
        token::mint_to(mint_cpi_ctx, creator_share_tokens)?;
        msg!("✅ Creator tokens minted successfully");
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
            .checked_add(creator_share_tokens)
            .ok_or(ErrorCode::InvalidAmount)?
            .checked_add(platform_share_tokens)
            .ok_or(ErrorCode::InvalidAmount)?;
    }

    // Emit event with comprehensive logging
    let timestamp = Clock::get()?.unix_timestamp;
    emit!(ManagementFeeClaimed {
        vault: vault_key,
        creator: creator_key,
        vault_index,
        total_accrued_fees_usdc: total_accrued_fees,
        creator_share_usdc,
        platform_share_usdc,
        vault_creator_fee_ratio_bps: factory.vault_creator_fee_ratio_bps,
        platform_fee_ratio_bps: factory.platform_fee_ratio_bps,
        timestamp,
    });

    msg!("🎉 Management fee claim completed successfully!");
    msg!("📊 Summary:");
    msg!("  Total fees claimed: {} USDC", total_accrued_fees);
    msg!("  Creator received: {} vault tokens (equivalent to {} USDC)", creator_share_tokens, creator_share_usdc);
    msg!("  Platform received: {} vault tokens (equivalent to {} USDC)", platform_share_tokens, platform_share_usdc);
    msg!("  New total supply: {}", ctx.accounts.vault.total_supply);
    msg!("  Timestamp: {}", timestamp);

    Ok(())
}


