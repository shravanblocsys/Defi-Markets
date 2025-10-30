import { Idl, BorshInstructionCoder } from "@coral-xyz/anchor";
import * as bs58 from "bs58";
import { VAULT_FACTORY_IDL } from "./idls/idls";

export function decodeVaultInstruction(rawData: string) {
  // 1. Convert base58 → buffer
  const data = bs58.decode(rawData);

  const coder = new BorshInstructionCoder(VAULT_FACTORY_IDL as Idl);

  // 3. Decode instruction - convert Uint8Array to Buffer
  const decoded = coder.decode(Buffer.from(data));

  if (!decoded) {
    throw new Error("Failed to decode instruction");
  }

  // 4. Format result
  return decoded;
}

export interface AuthenticatedRequest extends Request {
  raw: {
    user?: {
      _id: string;       // Profile ID used for createdBy field
      email?: string;    // User email
      username?: string; // Username
      walletAddress?: string; // Wallet address if authenticated via wallet
      profileId?: string; // Alternative profile ID field
      [key: string]: any; // Allow for additional properties
    };
  };
  user?: {
    _id?: string;       // Profile ID
    email?: string;     // User email
    username?: string;  // Username
    walletAddress?: string; // Wallet address if authenticated via wallet
    profileId: string;  // Required profile ID field
    [key: string]: any; // Allow for additional properties
  };
}

/**
 * Utility function to sanitize user input for regex queries
 * Prevents ReDoS (Regular Expression Denial of Service) attacks by:
 * 1. Limiting input length to prevent overly complex patterns
 * 2. Escaping special regex characters to treat them as literal strings
 * 3. Validating input type and handling edge cases
 * 
 * @param input - User input string to sanitize
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Sanitized string safe for regex use, empty string if invalid input
 */
export function sanitizeRegexInput(input: string, maxLength: number = 100): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Limit input length to prevent overly complex patterns that could cause ReDoS
  const trimmedInput = input.trim().substring(0, maxLength);

  // Return empty string if input becomes empty after trimming
  if (!trimmedInput) {
    return '';
  }

  // Escape all special regex characters to treat them as literal strings
  // This prevents malicious regex patterns from being executed
  return trimmedInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a number from smallest unit to base 10 decimal with 6 decimal places
 * @param value - The number in smallest unit (e.g., lamports, wei)
 * @returns The number converted to decimal format with 6 decimal places
 */
export function toBase10Decimal(value: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('Invalid input: value must be a valid number');
  }
  
  // Convert from smallest unit to decimal by dividing by 10^6
  const decimalValue = value / 1000000;
  
  return parseFloat(decimalValue.toFixed(6));
}

/**
 * Calculate weighted basket price using asset allocations and token prices
 * @param underlyingAssets - Array of assets with pct_bps and assetAllocation
 * @param tokenPrices - Map of mintAddress to price
 * @returns Weighted basket price per share
 */
export function calculateWeightedBasketPrice(
  underlyingAssets: Array<{ pct_bps: number; assetAllocation: { mintAddress: string } }>,
  tokenPrices: Map<string, number>
): number {
  let basketPrice = 0;
  
  for (const asset of underlyingAssets) {
    const weight = typeof asset.pct_bps === 'number' ? asset.pct_bps / 10000 : 0;
    const price = tokenPrices.get(asset.assetAllocation?.mintAddress) || 0;
    console.log("weight", weight);
    console.log("price", price);
    basketPrice += weight * price;
  }
  console.log("basketPrice", basketPrice);
  return Math.round(basketPrice * 100) / 100;
}

/**
 * Calculate Gross Asset Value (GAV) using user shares and basket price
 * @param totalUserShares - Total shares held by user (converted from 6 decimals)
 * @param basketPrice - Weighted basket price per share
 * @returns Gross Asset Value
 */
export function calculateGrossAssetValue(totalUserShares: number, basketPrice: number): number {
  const gav = totalUserShares * basketPrice;
  console.log("gav", gav);
  return Math.round(gav * 100) / 100;
}

/**
 * Calculate Net Asset Value (NAV) from GAV and fee percentage
 * @param grossAssetValue - The gross asset value
 * @param feePercentage - The fee percentage to apply
 * @returns Net Asset Value
 */
export function calculateNetAssetValue(grossAssetValue: number, feePercentage: number): number {
  const feeAmount = (grossAssetValue * feePercentage) / 100;
  const netAssetValue = grossAssetValue - feeAmount;
  console.log("netAssetValue", netAssetValue);
  return Math.round(netAssetValue * 100) / 100;
}

/**
 * Calculate total fees from GAV and NAV
 * @param grossAssetValue - The gross asset value
 * @param netAssetValue - The net asset value
 * @returns Total fees
 */
export function calculateTotalFees(grossAssetValue: number, netAssetValue: number): number {
  console.log("grossAssetValue", grossAssetValue);
  console.log("netAssetValue", netAssetValue);
  return Math.round((grossAssetValue - netAssetValue) * 100) / 100;
}