// ---------- Constants ----------
pub const MAX_BPS: u16 = 10_000; // 100%
pub const DEFAULT_ENTRY_EXIT_FEE_BPS: u16 = 25; // 0.25%
pub const DEFAULT_MIN_MANAGEMENT_FEE_BPS: u16 = 50; // 0.5%
pub const DEFAULT_MAX_MANAGEMENT_FEE_BPS: u16 = 300; // 3%
pub const DEFAULT_VAULT_CREATION_FEE_USDC: u64 = 10_000_000; // $10 with 6 decimals

// Default fee distribution ratios (must sum to 10000)
pub const DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS: u16 = 7_000; // 70% to vault creator
pub const DEFAULT_PLATFORM_FEE_RATIO_BPS: u16 = 3_000; // 30% to platform

// Limits used for validations
pub const MAX_ENTRY_EXIT_BPS_LIMIT: u16 = 1_000; // 10%
pub const MAX_MANAGEMENT_BPS_LIMIT: u16 = 2_000; // 20%
pub const MIN_UNDERLYING_ASSETS: usize = 1; // Minimum number of underlying assets
pub const MAX_UNDERLYING_ASSETS: usize = 240; // Practical limit due to Solana's reallocation limit (10,240 bytes)
pub const MAX_ACCOUNT_SIZE: usize = 10_240_000; // Solana's maximum account size limit (10MB)
pub const MAX_VAULT_NAME_LENGTH: usize = 50;
pub const MAX_VAULT_SYMBOL_LENGTH: usize = 30;

// Max serialized Jupiter instruction length to store in on-chain buffer
pub const JUP_IX_MAX_LEN: usize = 1024;

// Token Program IDs (hardcoded for validation)
use anchor_lang::solana_program::pubkey;

pub const TOKEN_PROGRAM_ID: anchor_lang::prelude::Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM_ID: anchor_lang::prelude::Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
