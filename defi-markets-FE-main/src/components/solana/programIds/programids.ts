import { PublicKey } from "@solana/web3.js";

// Program IDs
export const VAULT_FACTORY_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_VAULT_FACTORY_PROGRAM_ID ||
    "CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs"
);

export const ETF_VAULT_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_ETF_VAULT_PROGRAM_ID ||
    "11111111111111111111111111111111"
);

// Metaplex Token Metadata Program ID
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// Common token mint addresses (Solana devnet/mainnet)
export const TOKEN_MINTS = {
  // Devnet
  DEVNET: {
    USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    USDT: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    SOL: new PublicKey("So11111111111111111111111111111111111111112"),
    BTC: new PublicKey("9n4nM48XwJ4x3bP1Z36Nydq4ijMkofCL1MoDc64vvL1W"),
    ETH: new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"),
  },
  // Mainnet
  MAINNET: {
    USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    USDT: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    SOL: new PublicKey("So11111111111111111111111111111111111111112"),
    BTC: new PublicKey("9n4nM48XwJ4x3bP1Z36Nydq4ijMkofCL1MoDc64vvL1W"),
    ETH: new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"),
  },
};
