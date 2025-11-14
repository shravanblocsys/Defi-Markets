/**
 * Fee calculation helper functions
 * These functions handle conversions between different fee formats
 */

/**
 * Convert percentage to basis points
 * @param percentage - The percentage value (e.g., 2.5 for 2.5%)
 * @returns The equivalent value in basis points (e.g., 250 for 2.5%)
 */
export const percentageToBps = (percentage: number): number => {
  return Math.round(percentage * 100);
};

/**
 * Convert basis points to percentage
 * @param bps - The basis points value (e.g., 250 for 2.5%)
 * @returns The equivalent percentage value (e.g., 2.5 for 2.5%)
 */
export const bpsToPercentage = (bps: number): number => {
  return bps / 100;
};

/**
 * Format basis points as percentage string
 * @param bps - The basis points value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "2.50%")
 */
export const formatBpsAsPercentage = (bps: number, decimals: number = 2): string => {
  return `${bpsToPercentage(bps).toFixed(decimals)}%`;
};

/**
 * Convert USDC amount to lamports (for Solana)
 * @param usdcAmount - The USDC amount (e.g., 10.5 for 10.5 USDC)
 * @returns The equivalent value in lamports (assuming 6 decimals for USDC)
 */
export const usdcToLamports = (usdcAmount: number): number => {
  return Math.round(usdcAmount * 1e6);
};

/**
 * Convert lamports to USDC amount
 * @param lamports - The lamports value
 * @returns The equivalent USDC amount (assuming 6 decimals for USDC)
 */
export const lamportsToUsdc = (lamports: number): number => {
  return lamports / 1e6;
};

/**
 * Format USDC amount as string
 * @param usdcAmount - The USDC amount
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted USDC string (e.g., "10.50 USDC")
 */
export const formatUsdcAmount = (usdcAmount: number, decimals: number = 2): string => {
  return `${usdcAmount.toFixed(decimals)} USDC`;
};

/**
 * Validate fee range (min should be less than or equal to max)
 * @param minFee - Minimum fee value
 * @param maxFee - Maximum fee value
 * @returns True if valid, false otherwise
 */
export const validateFeeRange = (minFee: number, maxFee: number): boolean => {
  return minFee <= maxFee;
};

/**
 * Clamp fee value within valid range
 * @param value - The fee value to clamp
 * @param min - Minimum allowed value (default: 0)
 * @param max - Maximum allowed value (default: 100)
 * @returns Clamped value
 */
export const clampFeeValue = (value: number, min: number = 0, max: number = 100): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Calculate fee amount from principal
 * @param principal - The principal amount
 * @param feePercentage - The fee percentage (e.g., 2.5 for 2.5%)
 * @returns The calculated fee amount
 */
export const calculateFeeAmount = (principal: number, feePercentage: number): number => {
  return (principal * feePercentage) / 100;
};

/**
 * Calculate net amount after fee deduction
 * @param principal - The principal amount
 * @param feePercentage - The fee percentage (e.g., 2.5 for 2.5%)
 * @returns The net amount after fee deduction
 */
export const calculateNetAmount = (principal: number, feePercentage: number): number => {
  return principal - calculateFeeAmount(principal, feePercentage);
};

/**
 * Get fee type display name
 * @param feeType - The fee type string
 * @returns Human-readable fee type name
 */
export const getFeeTypeDisplayName = (feeType: string): string => {
  const typeMap: Record<string, string> = {
    'entry_fee': 'Entry Fee',
    'exit_fee': 'Exit Fee',
    'vault_creation_fee': 'Vault Creation Fee',
    'management': 'Management Fee',
    'management_min': 'Management Fee (Min)',
    'management_max': 'Management Fee (Max)',
    'vault_creator_management_fee': 'Vault Creator Management Fee',
    'platform_owner_management_fee': 'Platform Owner Management Fee',
  };
  
  return typeMap[feeType] || feeType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Get fee unit for display
 * @param feeType - The fee type
 * @returns The appropriate unit string
 */
export const getFeeUnit = (feeType: string): string => {
  const unitMap: Record<string, string> = {
    'entry_fee': '%',
    'exit_fee': '%',
    'vault_creation_fee': ' USDC', // vault_creation_fee is stored as USDC amount, not percentage
    'management': '%',
    'management_min': '%',
    'management_max': '%',
    'vault_creator_management_fee': '%',
    'platform_owner_management_fee': '%',
  };
  
  return unitMap[feeType] || '%';
};

/**
 * Format fee value for display
 * @param feeType - The fee type
 * @param value - The fee value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted fee string
 */
export const formatFeeValue = (feeType: string, value: number, decimals: number = 2): string => {
  const unit = getFeeUnit(feeType);
  return `${value.toFixed(decimals)}${unit}`;
};

/**
 * Parse fee value from string input
 * @param input - The input string
 * @returns Parsed number or undefined if invalid
 */
export const parseFeeInput = (input: string): number | undefined => {
  const value = parseFloat(input);
  return isNaN(value) ? undefined : value;
};

/**
 * Validate fee input
 * @param value - The fee value
 * @param min - Minimum allowed value (default: 0)
 * @param max - Maximum allowed value (default: 100)
 * @returns Validation result with error message if invalid
 */
export const validateFeeInput = (value: number, min: number = 0, max: number = 100): { isValid: boolean; error?: string } => {
  if (isNaN(value)) {
    return { isValid: false, error: 'Invalid number' };
  }
  
  if (value < min) {
    return { isValid: false, error: `Value must be at least ${min}` };
  }
  
  if (value > max) {
    return { isValid: false, error: `Value cannot exceed ${max}` };
  }
  
  return { isValid: true };
};
