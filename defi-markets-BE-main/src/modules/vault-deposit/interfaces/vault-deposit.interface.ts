export interface FeeConfig {
  entryFee: number;        // Basis points (e.g., 100 = 1%)
  exitFee: number;         // Basis points
  performanceFee: number;  // Basis points
  protocolFee: number;     // Basis points
}

export interface VaultParams {
  cap: number;                    // Maximum vault capacity
  maxAllocationTargets: number;   // Maximum number of allocation targets
  router: string;                 // Router program address
  oracle: string;                 // Oracle program address
}

export interface AllocationTarget {
  target: string;     // Target address
  percentage: number; // Percentage (0-100)
}

export interface DepositParams {
  amount: number;           // Amount of base tokens to deposit
  minSharesOut: number;     // Minimum shares expected in return
}

export interface RedeemParams {
  shares: number;    // Number of ETF shares to redeem
  toBase: boolean;   // Whether to redeem to base tokens
}

// New interfaces for blockchain program alignment
export interface EmergencyWithdrawParams {
  target: string;     // Target address for withdrawal
  amount: number;     // Amount to withdraw
  reason: string;     // Reason for emergency withdrawal
}

export interface VaultClosureParams {
  reason: string;     // Reason for closure
  finalDistribution: boolean; // Whether to distribute remaining assets
}

export interface InitializeVaultParams {
  feeConfig: FeeConfig;
  vaultParams: VaultParams;
  admin: string;
  guardian: string;
  factory: string;
  etfMint: string;
  vaultBaseTreasury: string;
  baseMint: string;
}

export interface VaultState {
  status: 'Active' | 'Paused' | 'Emergency' | 'Closed';
  totalAssets: number;
  totalShares: number;
  nav: number; // Net Asset Value
  lastUpdated: Date;
}

export interface VaultDepositTransaction {
  id: string;
  vaultAddress: string;
  userAddress: string;
  amount: number;
  sharesReceived: number;
  feePaid: number;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}

export interface VaultRedeemTransaction {
  id: string;
  vaultAddress: string;
  userAddress: string;
  shares: number;
  tokensReceived: number;
  feePaid: number;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}

// New transaction interfaces
export interface EmergencyWithdrawTransaction {
  id: string;
  vaultAddress: string;
  guardianAddress: string;
  target: string;
  amount: number;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}

export interface VaultClosureTransaction {
  id: string;
  vaultAddress: string;
  adminAddress: string;
  reason: string;
  finalDistribution: boolean;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}
