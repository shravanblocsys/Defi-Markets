import { PublicKey } from "@solana/web3.js";

// Solana Network Configuration
export const SOLANA_NETWORKS = {
  MAINNET: "mainnet-beta",
  DEVNET: "devnet",
} as const;

export const SOLANA_RPC_URLS = {
  [SOLANA_NETWORKS.MAINNET]:
    (import.meta.env.VITE_MAINNET_RPC_URL as string | undefined) ||
    (import.meta.env.VITE_HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${
          import.meta.env.VITE_HELIUS_API_KEY
        }`
      : "https://api.mainnet-beta.solana.com"),
  [SOLANA_NETWORKS.DEVNET]:
    (import.meta.env.VITE_DEVNET_RPC_URL as string | undefined) ||
    "https://api.devnet.solana.com",
} as const;

// Re-export common helper functions from helpers.ts
export { isValidPublicKey, shortenAddress } from "./helpers";

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

export function validateAssetAllocation(
  assets: Array<{ allocation: number }>
): boolean {
  const total = assets.reduce((sum, asset) => sum + asset.allocation, 0);
  return Math.abs(total - 100) < 0.01; // Allow for small floating point errors
}
