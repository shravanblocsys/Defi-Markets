use anchor_lang::prelude::*;

// ---------- Errors ----------
#[error_code]
pub enum ErrorCode {
    #[msg("Fees are too high")]
    FeesTooHigh,
    #[msg("Invalid fee range (min > max)")]
    InvalidFeeRange,
    #[msg("Vault name is too long")]
    VaultNameTooLong,
    #[msg("Vault symbol is too long")]
    VaultSymbolTooLong,
    #[msg("Invalid underlying assets configuration")]
    InvalidUnderlyingAssets,
    #[msg("Account size exceeds maximum allowed")]
    AccountTooLarge,
    #[msg("Invalid management fees")]
    InvalidManagementFees,
    #[msg("Invalid BPS sum - must equal 10000 (100%)")]
    InvalidBpsSum,
    #[msg("Vault not found")]
    VaultNotFound,
    #[msg("Vault is not active")]
    VaultNotActive,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Factory is not active")]
    FactoryNotActive,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Insufficient vault tokens")]
    InsufficientVaultTokens,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid metadata program")]
    InvalidMetadataProgram,
}
