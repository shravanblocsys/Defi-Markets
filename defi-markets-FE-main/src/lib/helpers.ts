import { PublicKey } from "@solana/web3.js";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Settings,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format amount with specified decimal places
 * @param amount - The amount to format
 * @param decimals - Number of decimal places (default: 6)
 * @returns Formatted amount string
 */
export const formatAmount = (amount: number, decimals: number = 6): string => {
  return (amount / Math.pow(10, decimals)).toFixed(2);
};

/**
 * Format currency amount with proper formatting
 * @param amount - The amount to format
 * @param currency - Currency symbol (default: '$')
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export const formatCurrency = (
  amount: number,
  currency: string = "$",
  decimals: number = 2
): string => {
  return `${currency}${amount.toFixed(decimals)}`;
};

/**
 * Format large numbers with K, M, B suffixes
 * @param num - The number to format
 * @returns Formatted number string
 */
export const formatLargeNumber = (num: number): string => {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
};

/**
 * Format percentage with specified decimal places
 * @param value - The percentage value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const formatPercentage = (
  value: number,
  decimals: number = 2
): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Convert basis points (bps) to percentage
 * @param bps - Basis points value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Percentage value
 */
export const bpsToPercentage = (bps: number, decimals: number = 2): number => {
  return parseFloat((bps / 100).toFixed(decimals));
};

/**
 * Convert basis points (bps) to formatted percentage string
 * @param bps - Basis points value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const bpsToPercentageString = (
  bps: number,
  decimals: number = 2
): string => {
  return `${bpsToPercentage(bps, decimals)}%`;
};

// ============================================================================
// DATE & TIME HELPERS
// ============================================================================

/**
 * Format date string to readable format
 * @param dateString - Date string to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string or "N/A" if invalid
 */
export const formatDate = (
  dateString?: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (!dateString) return "N/A";
  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...options,
    };
    return new Date(dateString).toLocaleDateString("en-US", defaultOptions);
  } catch (error) {
    return "N/A";
  }
};

/**
 * Format date and time string
 * @param dateString - Date string to format
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "N/A";
  }
};

/**
 * Get relative time (e.g., "2 hours ago", "3 days ago")
 * @param dateString - Date string
 * @returns Relative time string
 */
export const getRelativeTime = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000)
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
};

// ============================================================================
// SOLANA HELPERS
// ============================================================================

/**
 * Validate if a string is a valid Solana public key
 * @param address - Address string to validate
 * @returns True if valid public key
 */
export const isValidPublicKey = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

/**
 * Shorten Solana address for display
 * @param address - Full address string
 * @param chars - Number of characters to show at start/end (default: 4)
 * @returns Shortened address string
 */
export const shortenAddress = (address: string, chars: number = 4): string => {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

/**
 * Get the current Solana network from environment
 * @returns Solana network string
 */
export const getCurrentNetwork = (): string => {
  const envNetwork = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
  // Convert mainnet-beta to mainnet for Solscan URLs
  return envNetwork === "mainnet-beta" ? "mainnet" : envNetwork;
};

/**
 * Generate Solscan explorer URL for transaction
 * @param signature - Transaction signature
 * @param cluster - Solana cluster (optional, uses env if not provided)
 * @returns Solscan URL
 */
export const getSolscanUrl = (signature: string, cluster?: string): string => {
  const network = cluster || getCurrentNetwork();
  return `https://solscan.io/tx/${signature}?cluster=${network}`;
};

/**
 * Generate Solscan explorer URL for account
 * @param address - Account address
 * @param cluster - Solana cluster (optional, uses env if not provided)
 * @returns Solscan URL
 */
export const getSolscanAccountUrl = (
  address: string,
  cluster?: string
): string => {
  const network = cluster || getCurrentNetwork();
  return `https://solscan.io/account/${address}?cluster=${network}`;
};

// ============================================================================
// STRING HELPERS
// ============================================================================

/**
 * Generate initials from name
 * @param name - Full name string
 * @param username - Username as fallback
 * @returns Initials string
 */
export const getInitials = (name?: string, username?: string): string => {
  if (name) {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return "U";
};

/**
 * Capitalize first letter of string
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Convert string to title case
 * @param str - String to convert
 * @returns Title case string
 */
export const toTitleCase = (str: string): string => {
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

/**
 * Generate symbol from name (for vault creation)
 * @param name - Vault name
 * @returns Generated symbol
 */
export const generateSymbol = (name: string): string => {
  if (!name.trim()) return "";
  // Split the name into words and get first letter of each word
  const words = name.trim().split(/\s+/);
  const initials = words
    .map((word) => word.charAt(0).toUpperCase())
    .join("")
    .slice(0, 3); // Take first 3 letters maximum

  // Add -ETF suffix
  return `${initials}-ETF`;
};
/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate email format
 * @param email - Email string to validate
 * @returns True if valid email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate URL format
 * @param url - URL string to validate
 * @returns True if valid URL
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate if string is a valid number
 * @param str - String to validate
 * @returns True if valid number
 */
export const isValidNumber = (str: string): boolean => {
  return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
};

/**
 * Validate if number is positive
 * @param num - Number to validate
 * @returns True if positive
 */
export const isPositiveNumber = (num: number): boolean => {
  return num > 0 && !isNaN(num) && isFinite(num);
};

// ============================================================================
// ARRAY HELPERS
// ============================================================================

/**
 * Remove duplicates from array
 * @param array - Array to deduplicate
 * @returns Array without duplicates
 */
export const removeDuplicates = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

/**
 * Group array by key
 * @param array - Array to group
 * @param key - Key to group by
 * @returns Grouped object
 */
export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
};

/**
 * Sort array by key
 * @param array - Array to sort
 * @param key - Key to sort by
 * @param direction - Sort direction (default: 'asc')
 * @returns Sorted array
 */
export const sortBy = <T>(
  array: T[],
  key: keyof T,
  direction: "asc" | "desc" = "asc"
): T[] => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
};

// ============================================================================
// OBJECT HELPERS
// ============================================================================

/**
 * Deep clone object
 * @param obj - Object to clone
 * @returns Cloned object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Check if object is empty
 * @param obj - Object to check
 * @returns True if empty
 */
export const isEmpty = (obj: any): boolean => {
  if (obj == null) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === "object") return Object.keys(obj).length === 0;
  return false;
};

/**
 * Get nested object property safely
 * @param obj - Object to access
 * @param path - Property path (e.g., 'user.profile.name')
 * @param defaultValue - Default value if property doesn't exist
 * @returns Property value or default
 */
export const getNestedProperty = (
  obj: any,
  path: string,
  defaultValue: any = undefined
): any => {
  return (
    path.split(".").reduce((current, key) => current?.[key], obj) ??
    defaultValue
  );
};

// ============================================================================
// DEBOUNCE & THROTTLE HELPERS
// ============================================================================

/**
 * Debounce function execution
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Throttle function execution
 * @param func - Function to throttle
 * @param delay - Delay in milliseconds
 * @returns Throttled function
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
};

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Anchor error code to user-friendly message mapping
 */
const ANCHOR_ERROR_MESSAGES: Record<number, { title: string; description: string }> = {
  6000: {
    title: "Fees Too High",
    description: "The management fee you specified exceeds the maximum allowed. Please reduce the fee and try again.",
  },
  6001: {
    title: "Invalid Fee Range",
    description: "The fee configuration is invalid. Please check your fee settings.",
  },
  6002: {
    title: "Vault Name Too Long",
    description: "The vault name exceeds the maximum allowed length. Please use a shorter name (typically 32 characters or less).",
  },
  6003: {
    title: "Vault Symbol Too Long",
    description: "The vault symbol exceeds the maximum allowed length. Please use a shorter symbol (typically 10 characters or less).",
  },
  6004: {
    title: "Invalid Asset Configuration",
    description: "The underlying assets configuration is invalid. Please ensure all assets have valid mint addresses and allocations.",
  },
  6005: {
    title: "Account Size Exceeded",
    description: "The account size exceeds the maximum allowed. Please reduce the number of assets or simplify the configuration.",
  },
  6006: {
    title: "Invalid Management Fees",
    description: "The management fees value is invalid. Please check your fee configuration.",
  },
  6007: {
    title: "Invalid Allocation",
    description: "The total asset allocation must equal exactly 100% (10000 basis points). Please adjust your allocations.",
  },
  6008: {
    title: "Vault Not Found",
    description: "The specified vault could not be found.",
  },
  6009: {
    title: "Vault Not Active",
    description: "The vault is not currently active.",
  },
  6010: {
    title: "Invalid Amount",
    description: "The specified amount is invalid. Please check your input.",
  },
  6011: {
    title: "Factory Not Active",
    description: "The vault factory is not currently active. Please try again later.",
  },
  6012: {
    title: "Unauthorized Access",
    description: "You do not have permission to perform this action.",
  },
  6013: {
    title: "Insufficient Vault Tokens",
    description: "You do not have enough vault tokens to complete this transaction.",
  },
  6014: {
    title: "Insufficient Funds",
    description: "You do not have sufficient funds to complete this transaction. Please ensure you have enough SOL for transaction fees and USDC for the vault creation fee.",
  },
  6015: {
    title: "Invalid Metadata Program",
    description: "The metadata program configuration is invalid. Please contact support.",
  },
};

/**
 * Parse Anchor error from error object
 * @param error - Error object (can be AnchorError, Error, or any)
 * @returns Parsed error information
 */
export interface ParsedError {
  title: string;
  description: string;
  errorCode?: number;
  errorName?: string;
  isAnchorError: boolean;
  originalError: unknown;
}

export const parseAnchorError = (error: unknown): ParsedError => {
  const errorStr = JSON.stringify(error);
  const errorLower = errorStr.toLowerCase();

  // Try to extract Anchor error code and name
  // Anchor errors typically have format: "AnchorError thrown in ... Error Code: ErrorName. Error Number: 6003."
  const codeMatch = errorStr.match(/error number[:\s]+(\d+)/i) || 
                    errorStr.match(/code[:\s]+(\d+)/i) ||
                    errorStr.match(/(600\d+)/);
  
  const nameMatch = errorStr.match(/error code[:\s]+([a-z]+)/i) ||
                    errorStr.match(/code[:\s]+([a-z]+)/i) ||
                    errorStr.match(/(vaultSymbolTooLong|vaultNameTooLong|invalidBpsSum|feesTooHigh|invalidUnderlyingAssets|insufficientFunds|unauthorized|vaultNotFound|vaultNotActive|factoryNotActive|invalidAmount|insufficientVaultTokens|invalidManagementFees|invalidFeeRange|accountTooLarge|invalidMetadataProgram)/i);

  let errorCode: number | undefined;
  let errorName: string | undefined;

  if (codeMatch) {
    errorCode = parseInt(codeMatch[1], 10);
  }

  if (nameMatch) {
    errorName = nameMatch[1];
  }

  // If we found an error code, try to get the user-friendly message
  if (errorCode && ANCHOR_ERROR_MESSAGES[errorCode]) {
    return {
      title: ANCHOR_ERROR_MESSAGES[errorCode].title,
      description: ANCHOR_ERROR_MESSAGES[errorCode].description,
      errorCode,
      errorName,
      isAnchorError: true,
      originalError: error,
    };
  }

  // Check for common Solana/Anchor error patterns
  if (errorLower.includes("anchorerror") || errorLower.includes("anchor error")) {
    // Try to extract error message from Anchor error
    const msgMatch = errorStr.match(/error message[:\s]+"([^"]+)"/i) ||
                     errorStr.match(/msg[:\s]+"([^"]+)"/i);
    
    if (msgMatch) {
      return {
        title: "Vault Creation Failed",
        description: msgMatch[1],
        errorCode,
        errorName,
        isAnchorError: true,
        originalError: error,
      };
    }

    return {
      title: "Vault Creation Failed",
      description: "An error occurred while creating the vault on-chain. Please check your inputs and try again.",
      errorCode,
      errorName,
      isAnchorError: true,
      originalError: error,
    };
  }

  // Check for insufficient funds errors
  if (
    errorLower.includes("insufficient funds") ||
    errorLower.includes("insufficient sol") ||
    errorLower.includes("account has insufficient funds") ||
    errorLower.includes("not enough sol") ||
    errorLower.includes("insufficient balance") ||
    errorLower.includes("exceeded cus meter") ||
    errorLower.includes("0x1")
  ) {
    return {
      title: "Insufficient SOL Balance",
      description: "Please ensure you have enough SOL to cover transaction fees (typically 0.064 - 0.1 SOL) in addition to the 10 USDC vault creation fee.",
      isAnchorError: false,
      originalError: error,
    };
  }

  // Check for user rejection
  if (
    errorLower.includes("user rejected") ||
    errorLower.includes("user cancelled") ||
    errorLower.includes("transaction was cancelled")
  ) {
    return {
      title: "Transaction Cancelled",
      description: "The transaction was cancelled. Please try again when ready.",
      isAnchorError: false,
      originalError: error,
    };
  }

  // Check for network errors
  if (
    errorLower.includes("network") ||
    errorLower.includes("connection") ||
    errorLower.includes("timeout") ||
    errorLower.includes("fetch failed")
  ) {
    return {
      title: "Network Error",
      description: "A network error occurred. Please check your internet connection and try again.",
      isAnchorError: false,
      originalError: error,
    };
  }

  // Default error handling
  if (error instanceof Error) {
    return {
      title: "Vault Creation Failed",
      description: error.message || "An unexpected error occurred while creating the vault.",
      isAnchorError: false,
      originalError: error,
    };
  }

  if (typeof error === "string") {
    return {
      title: "Vault Creation Failed",
      description: error,
      isAnchorError: false,
      originalError: error,
    };
  }

  return {
    title: "Vault Creation Failed",
    description: "An unknown error occurred. Please try again or contact support if the issue persists.",
    isAnchorError: false,
    originalError: error,
  };
};

/**
 * Get error message from error object
 * @param error - Error object
 * @returns Error message string
 */
export const getErrorMessage = (error: unknown): string => {
  const parsed = parseAnchorError(error);
  return parsed.description;
};

/**
 * Create standardized API response
 * @param data - Response data
 * @param success - Success status (default: true)
 * @param message - Response message
 * @returns Standardized response object
 */
export const createApiResponse = <T>(
  data: T,
  success: boolean = true,
  message?: string
): { success: boolean; data: T; message?: string } => {
  return { success, data, ...(message && { message }) };
};

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

/**
 * Save data to localStorage with error handling
 * @param key - Storage key
 * @param data - Data to store
 * @returns Success status
 */
export const saveToStorage = (key: string, data: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
    return false;
  }
};

/**
 * Load data from localStorage with error handling
 * @param key - Storage key
 * @param defaultValue - Default value if not found
 * @returns Stored data or default value
 */
export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error("Failed to load from localStorage:", error);
    return defaultValue;
  }
};

/**
 * Remove data from localStorage
 * @param key - Storage key
 * @returns Success status
 */
export const removeFromStorage = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error("Failed to remove from localStorage:", error);
    return false;
  }
};

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Generate random ID
 * @param length - ID length (default: 8)
 * @returns Random ID string
 */
export const generateId = (length: number = 8): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Promise that resolves with function result
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i === maxRetries) break;

      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }

  throw lastError!;
};

export const getTransactionType = (action: string) => {
  if (action.includes("deposit")) {
    return {
      type: "deposit",
      icon: ArrowUpRight,
      color: "bg-success/20 text-success",
    };
  } else if (action.includes("redeem")) {
    return {
      type: "redeem",
      icon: ArrowDownRight,
      color: "bg-warning/20 text-warning",
    };
  } else if (action.includes("created")) {
    return {
      type: "Vault Created",
      icon: Plus,
      color: "bg-success/20 text-white",
    };
  }
  return {
    type: "transaction",
    icon: ArrowUpRight,
    color: "bg-info/20 text-info",
  };
};
