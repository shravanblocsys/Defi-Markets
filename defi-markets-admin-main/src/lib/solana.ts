
import { PublicKey } from '@solana/web3.js';

// Solana Network Configuration
export const SOLANA_NETWORKS = {
  MAINNET: 'mainnet-beta',
  DEVNET: 'devnet',
} as const;

export const SOLANA_RPC_URLS = {
  [SOLANA_NETWORKS.MAINNET]: 'https://mainnet.helius-rpc.com/?api-key=1780496b-33a2-4049-8f00-6a32d8aab573',
  [SOLANA_NETWORKS.DEVNET]: 'https://api.devnet.solana.com',
} as const;



// Helper Functions
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

export function solToLamports(sol: number): number {
  return sol * 1e9;
}

// Vault Factory specific helpers
export function calculateBpsFromPercentage(percentage: number): number {
  return Math.round(percentage * 100);
}

export function calculatePercentageFromBps(bps: number): number {
  return bps / 100;
}

export function validateVaultName(name: string): boolean {
  return name.length >= 1 && name.length <= 32;
}

export function validateVaultSymbol(symbol: string): boolean {
  return symbol.length >= 1 && symbol.length <= 10;
}

export function validateManagementFee(fee: number): boolean {
  return fee >= 0 && fee <= 5; // 0% to 5%
}

export function validateAssetAllocation(assets: Array<{ allocation: number }>): boolean {
  const total = assets.reduce((sum, asset) => sum + asset.allocation, 0);
  return Math.abs(total - 100) < 0.01; // Allow for small floating point errors
}

// Network detection and Solscan URL generation
export function getCurrentNetwork(): string {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return SOLANA_NETWORKS.DEVNET; // Default fallback
  }

  // Check for environment variable first
  const envNetwork = import.meta.env.VITE_SOLANA_NETWORK;
  if (envNetwork && Object.values(SOLANA_NETWORKS).includes(envNetwork as any)) {
    return envNetwork;
  }

  // Check for network in localStorage (set by wallet)
  const storedNetwork = localStorage.getItem('solana-network');
  if (storedNetwork && Object.values(SOLANA_NETWORKS).includes(storedNetwork as any)) {
    return storedNetwork;
  }

  // Check the current RPC URL to determine network
  const currentRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || SOLANA_RPC_URLS[SOLANA_NETWORKS.DEVNET];
  
  if (currentRpcUrl.includes('mainnet-beta')) {
    return SOLANA_NETWORKS.MAINNET;
  } else if (currentRpcUrl.includes('devnet')) {
    return SOLANA_NETWORKS.DEVNET;
  }

  // Default fallback
  return SOLANA_NETWORKS.DEVNET;
}

export function getSolscanUrl(transactionSignature: string, network?: string): string {
  const currentNetwork = network || getCurrentNetwork();
  
  // Map network names to Solscan cluster parameters
  const clusterMap = {
    [SOLANA_NETWORKS.MAINNET]: '', // Mainnet doesn't need cluster parameter
    [SOLANA_NETWORKS.DEVNET]: '?cluster=devnet',
  };

  const cluster = clusterMap[currentNetwork] || '?cluster=devnet';
  return `https://solscan.io/tx/${transactionSignature}${cluster}`;
}

