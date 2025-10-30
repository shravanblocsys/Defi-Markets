export interface UnderlyingAsset {
  assetAllocationId?: string; // Reference to AssetAllocation document ID (optional for blockchain events)
  pct_bps: number;        // Percentage allocation in basis points
  totalAssetLocked?: number; // Total amount of asset locked (optional)
}


export interface FeeConfig {
  managementFeeBps: number;  // Management fee in basis points (e.g., 150 = 1.5%)
}


export interface VaultCreationParams {
  vaultName: string; // Max 32 characters
  vaultSymbol: string; // Max 8 characters
  underlyingAssets: UnderlyingAsset[]; // Max 10 assets
  feeConfig: FeeConfig;
}

// New interface for blockchain vault creation events
export interface VaultCreationEvent {
  event_type: string;
  program_id: string;
  instruction_index: number;
  transaction_signature: string;
  slot: number;
  block_time: number;
  accounts: {
    factory: string;
    vault: string;
    creator: string;
    etf_vault_program: string;
    system_program: string;
    etf_vault_pda?: string;
    etf_mint?: string;
    vault_treasury?: string;
  };
  vault_data: {
    vault_name: string;
    vault_symbol: string;
    management_fee_bps: number;
    vault_index?: number;
    underlying_assets: UnderlyingAsset[];
  };
  metadata: {
    network: string;
    instruction_name: string;
    compute_units_consumed: number;
    fee: number;
  };
}
