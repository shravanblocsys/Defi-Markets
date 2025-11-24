// Common types used across the store
export interface User {
  _id?: string;
  id?: string;
  address?: string;
  walletAddress?: string;
  email?: string;
  username?: string;
  name?: string;
  avatar?: string;
  roleId?: string;
  date?: string;
  socialLinks?: Array<{
    platform: string;
    url: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
  twitter_username?: string;
  isTwitterConnected?: boolean;
}

export interface Wallet {
  address: string;
  balance: number;
  network: string;
  isConnected: boolean;
  chainId?: string;
}

export interface VaultAsset {
  _id: string;
  pct_bps: number;
  assetAllocation?: {
    _id: string;
    mintAddress: string;
    name: string;
    symbol: string;
    type: string;
    decimals: number;
    logoUrl?: string;
    active: boolean;
  };
  // Legacy fields for backward compatibility
  mint?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
}

export interface VaultFeeConfig {
  _id: string;
  managementFeeBps: number;
}

export interface VaultParams {
  _id: string;
  minDeposit: number;
  maxDeposit: number;
  lockPeriod: number;
  rebalanceThreshold: number;
  maxSlippage: number;
  strategy: string;
}

export interface VaultCreator {
  _id: string;
  email: string;
  name: string;
  walletAddress: string;
  avatar?: string;
  twitter_username?: string;
}

export interface Vault {
  _id: string;
  apy: number;
  vaultName: string;
  vaultSymbol: string;
  underlyingAssets: VaultAsset[];
  paymentTokens: VaultAsset[];
  feeConfig: VaultFeeConfig;
  params: VaultParams;
  vaultAddress: string;
  creatorAddress: string;
  factoryAddress: string;
  vaultIndex?: number;
  totalSupply: string;
  nav: string;
  creator: VaultCreator | string | null;
  status: "active" | "pending" | "inactive";
  blockTime: string;
  originalTimestamp: string;
  network: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
  isFeaturedVault?: boolean;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  totalValueLocked?: number;
  miniDeposit?: number;
  miniRedeem?: number;
  sharePrice?: number;
  totalTokens?: number;
}

export interface Portfolio {
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  vaults: PortfolioVault[];
  transactions: Transaction[];
}

export interface PortfolioVault {
  vaultId: string;
  vaultName: string;
  investedAmount: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  shares: number;
  lastUpdated: string;
}

export interface Transaction {
  id: string;
  type: "deposit" | "withdraw" | "claim" | "stake" | "unstake";
  vaultId?: string;
  vaultName?: string;
  amount: number;
  token: string;
  status: "pending" | "completed" | "failed";
  hash?: string;
  timestamp: string;
  gasUsed?: number;
  gasPrice?: number;
}

export interface VaultDepositState {
  status: string;
  totalAssets: number;
  totalShares: number;
  nav: number;
  lastUpdated: string;
  _id: string;
}

export interface VaultDepositFeeConfig {
  entryFee: number;
  exitFee: number;
  performanceFee: number;
  protocolFee: number;
  _id: string;
}

export interface VaultDeposit {
  _id: string;
  vaultFactory: string;
  vaultAddress: string;
  feeConfig: VaultDepositFeeConfig;
  state: VaultDepositState;
  admin: string;
  factory: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface VaultDepositTransaction {
  _id: string;
  vaultDeposit: VaultDeposit;
  vaultFactory: Vault;
  vaultAddress: string;
  userProfile: User;
  userAddress: string;
  amount: number;
  sharesReceived: number;
  feePaid: number;
  timestamp: string;
  status: string;
  transactionSignature: string;
  blockNumber: number;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface VaultDepositsResponse {
  status: string;
  message: string;
  data: VaultDepositTransaction[];
}

export interface TransactionHistoryItem {
  _id: string;
  action: string;
  description: string;
  performedBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  };
  vaultId: {
    _id: string;
    vaultName: string;
    vaultSymbol: string;
  };
  relatedEntity: string;
  metadata: {
    [key: string]: string | number;
  };
  transactionSignature: string;
  signatureArray: string[];
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface TransactionHistoryResponse {
  data: TransactionHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  data: T;
  status: "success" | "error";
  message?: string;
  error?: string;
  nonce?: string;
  session?: {
    token: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Vault chart types
export interface VaultChartPoint {
  timestamp: string;
  gav: number;
  nav: number;
}

// Multi-vault chart types
export interface MultiVaultChartSeriesItem {
  vaultId: string;
  vaultName: string;
  series: VaultChartPoint[];
}

export interface MultiVaultChartData {
  interval: "minute" | "hour" | "day" | string;
  data: MultiVaultChartSeriesItem[];
}

// UI State types
export interface UIState {
  isLoading: boolean;
  sidebarOpen: boolean;
  theme: "dark" | "light";
  notifications: Notification[];
  modals: {
    connectWallet: boolean;
    createVault: boolean;
    confirmTransaction: boolean;
  };
}

export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// API Error types
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

// Transaction Event API response types
export interface RedeemSwapAdminData {
  vaultIndex?: number;
  vaultTokenAmount?: string;
  swaps?: Array<{
    mint: string;
    input: string;
    sig: string;
  }>;
  vaultUsdcBalance?: string;
  requiredUsdc?: string;
  adjustedVaultTokenAmount?: string; // vault-token amount after backend adjustments
}

// types for fees management
export interface FeeConfig {
  _id: string;
  fees: Array<{
    feeRate?: number;
    minFeeRate?: number;
    maxFeeRate?: number;
    description: string;
    type: string;
  }>;
  createdBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
}
