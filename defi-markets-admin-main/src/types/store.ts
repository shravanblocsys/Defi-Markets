// Common types used across the store
export interface User {
  id: string;
  address: string;
  email?: string;
  username?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Wallet {
  address: string;
  balance: number;
  network: string;
  isConnected: boolean;
  chainId?: string;
}

export interface Vault {
  _id: string;
  vaultName: string;
  vaultSymbol: string;
  underlyingAssets: {
    assetAllocation: {
      _id: string;
      mintAddress: string;
      name: string;
      symbol: string;
      type: string;
      decimals: number;
      logoUrl?: string;
      active: boolean;
    };
    pct_bps: number;
    _id: string;
  }[];
  feeConfig: {
    managementFeeBps: number;
    _id: string;
  };
  vaultAddress: string;
  creatorAddress: string;
  factoryAddress: string;
  vaultIndex: number;
  etfVaultPda: string;
  etfMint: string;
  vaultTreasury: string;
  totalSupply: string;
  nav: string;
  creator: {
    _id: string;
    email: string;
    name: string;
    walletAddress: string;
    socialLinks: {
      platform: string;
      url: string;
    }[];
  };
  status: 'pending' | 'active' | 'paused' | 'closed';
  blockTime: string;
  originalTimestamp: string;
  network: string;
  isFeaturedVault?: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
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
  type: 'deposit' | 'withdraw' | 'claim' | 'stake' | 'unstake';
  vaultId?: string;
  vaultName?: string;
  amount: number;
  token: string;
  status: 'pending' | 'completed' | 'failed';
  hash?: string;
  timestamp: string;
  gasUsed?: number;
  gasPrice?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
  error?: string;
  nonce?:string;
  session?:{
    token:string;
  }
  // Legacy support
  success?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VaultApiResponse {
  data: Vault[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// UI State types
export interface UIState {
  isLoading: boolean;
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  notifications: Notification[];
  modals: {
    connectWallet: boolean;
    createVault: boolean;
    confirmTransaction: boolean;
  };
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// API Error types
// Asset types
export interface Asset {
  _id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  type: string;
  decimals: number;
  logoUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface AssetApiResponse {
  data: Asset[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}
