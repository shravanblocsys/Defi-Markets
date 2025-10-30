import { PublicKey, Connection, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

// Raydium CPMM constants
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");

// Pool IDs for specific token pairs
const TETH_POOL_ID = new PublicKey("8g2uew22JxhStC5QArvGT5wUmG9oZVYzcYACCAbpStmR"); // SOL/TETH pool
const TUSDT_POOL_ID = new PublicKey("9yGB6NGsZLYrZTCciUTBBAGuPK9vibC2jQZSKyLPEHMk"); // SOL/TUSDT pool

// Known Raydium program IDs on devnet
const RAYDIUM_CPMM_PROGRAM = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"); // CPMM (cpmm-cpi crate)
const RAYDIUM_ALT_PROGRAM = new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"); // Other Raydium deployment

export interface DiscoveredPool {
  programId: PublicKey;
  ammConfig: PublicKey;
  pool: PublicKey;
  vaultIn: PublicKey;
  vaultOut: PublicKey;
  observation: PublicKey;
  authority: PublicKey;
}

export interface DiscoveredPools {
  [key: string]: DiscoveredPool;
}

export interface BuildBlockArgs {
  inMint: PublicKey;
  outMint: PublicKey;
  inVaultOnPool: PublicKey;
  outVaultOnPool: PublicKey;
}

/**
 * Hook for Raydium CPMM pool discovery and account building
 */
export const useRaydium = () => {
  /**
   * Discover Raydium CPMM pools for TETH and TUSDT
   */
  const discoverRaydiumPools = async (connection: Connection): Promise<DiscoveredPools> => {
    const AMM_CONFIG_SEED = Buffer.from("amm_config");
    const POOL_SEED = Buffer.from("pool");
    const POOL_VAULT_SEED = Buffer.from("pool_vault");
    const ORACLE_SEED = Buffer.from("observation");
    const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");

    const inputMint = WRAPPED_SOL;
    
    // Define both output mints and their corresponding pools
    const pools = [
      { outputMint: TETH_MINT, poolId: TETH_POOL_ID, name: "TETH" },
      { outputMint: TUSDT_MINT, poolId: TUSDT_POOL_ID, name: "TUSDT" }
    ];

    const candidatePrograms = [RAYDIUM_CPMM_PROGRAM, RAYDIUM_ALT_PROGRAM];
    let discoveredPools: DiscoveredPools = {};

    // Discover both pools
    for (const poolInfo of pools) {
      const { outputMint, poolId, name } = poolInfo;
      let discovered: DiscoveredPool | null = null;

      // Try to discover the specific pool
      for (const programId of candidatePrograms) {
        const [authority] = PublicKey.findProgramAddressSync([AUTH_SEED], programId);
        for (let idx = 0; idx < 32; idx++) {
          const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, Uint8Array.of((idx >> 8) & 0xff, idx & 0xff)], programId);
          const [poolAB] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), inputMint.toBuffer(), outputMint.toBuffer()], programId);
          const [poolBA] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), outputMint.toBuffer(), inputMint.toBuffer()], programId);
          if (poolAB.equals(poolId) || poolBA.equals(poolId)) {
            const chosen = poolAB.equals(poolId) ? poolAB : poolBA;
            const [vaultIn] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, chosen.toBuffer(), inputMint.toBuffer()], programId);
            const [vaultOut] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, chosen.toBuffer(), outputMint.toBuffer()], programId);
            const [observation] = PublicKey.findProgramAddressSync([ORACLE_SEED, chosen.toBuffer()], programId);
            discovered = { programId, ammConfig, pool: chosen, vaultIn, vaultOut, observation, authority };
            break;
          }
        }
        if (discovered) break;
      }

      if (discovered) {
        discoveredPools[name] = discovered;
        // console.log(`Discovered ${name} pool: ${poolId.toBase58()}`);
      } else {
        // console.log(`Failed to discover ${name} pool: ${poolId.toBase58()}`);
      }
    }

    return discoveredPools;
  };

  /**
   * Discover pools for redeem (X -> WSOL), auto-detecting direction per redeem.ts
   */
  const discoverRedeemPools = async (connection: Connection): Promise<DiscoveredPools> => {
    const AMM_CONFIG_SEED = Buffer.from("amm_config");
    const POOL_SEED = Buffer.from("pool");
    const POOL_VAULT_SEED = Buffer.from("pool_vault");
    const ORACLE_SEED = Buffer.from("observation");
    const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");

    const outputMint = WRAPPED_SOL; // target WSOL
    const inputMints = [TUSDT_MINT, TETH_MINT];
    const candidatePrograms = [RAYDIUM_CPMM_PROGRAM, RAYDIUM_ALT_PROGRAM];

    const discoveredPools: DiscoveredPools = {};

    for (const inputMint of inputMints) {
      let discovered: DiscoveredPool | null = null;
      for (const programId of candidatePrograms) {
        const [authority] = PublicKey.findProgramAddressSync([AUTH_SEED], programId);
        for (let idx = 0; idx < 32; idx++) {
          const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, Uint8Array.of((idx >> 8) & 0xff, idx & 0xff)], programId);
          const [poolAB] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), inputMint.toBuffer(), outputMint.toBuffer()], programId);
          const [poolBA] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), outputMint.toBuffer(), inputMint.toBuffer()], programId);
          for (const candidate of [poolAB, poolBA]) {
            const acc = await connection.getAccountInfo(candidate);
            if (acc) {
              const [vaultIn] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, candidate.toBuffer(), inputMint.toBuffer()], programId);
              const [vaultOut] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, candidate.toBuffer(), outputMint.toBuffer()], programId);
              const [observation] = PublicKey.findProgramAddressSync([ORACLE_SEED, candidate.toBuffer()], programId);
              discovered = { programId, ammConfig, pool: candidate, vaultIn, vaultOut, observation, authority };
              break;
            }
          }
          if (discovered) break;
        }
        if (discovered) break;
      }
      if (discovered) {
        const key = inputMint.equals(TUSDT_MINT) ? "TUSDT" : "TETH";
        discoveredPools[key] = discovered;
        // console.log(`Discovered redeem pool for ${key}: ${discovered.pool.toBase58()}`);
      } else {
        // console.log(`Failed to discover redeem pool for ${inputMint.toBase58()}`);
      }
    }

    return discoveredPools;
  };

  /**
   * Discover redeem pools using hardcoded pool IDs (same as deposit)
   */
  const discoverRedeemPoolsHardcoded = async (connection: Connection): Promise<DiscoveredPools> => {
    const AMM_CONFIG_SEED = Buffer.from("amm_config");
    const POOL_SEED = Buffer.from("pool");
    const POOL_VAULT_SEED = Buffer.from("pool_vault");
    const ORACLE_SEED = Buffer.from("observation");
    const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");

    const outputMint = WRAPPED_SOL; // target WSOL
    // Map input mints to the known pool IDs used for deposit
    const pools = [
      { name: "TUSDT", inputMint: TUSDT_MINT, poolId: TUSDT_POOL_ID },
      { name: "TETH",  inputMint: TETH_MINT,  poolId: TETH_POOL_ID  },
    ];

    const candidatePrograms = [RAYDIUM_CPMM_PROGRAM, RAYDIUM_ALT_PROGRAM];
    const discovered: DiscoveredPools = {};

    for (const p of pools) {
      let found: DiscoveredPool | null = null;
      for (const programId of candidatePrograms) {
        const [authority] = PublicKey.findProgramAddressSync([AUTH_SEED], programId);
        for (let idx = 0; idx < 32; idx++) {
          const [ammConfig] = PublicKey.findProgramAddressSync([AMM_CONFIG_SEED, Uint8Array.of((idx >> 8) & 0xff, idx & 0xff)], programId);
          const [poolAB] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), p.inputMint.toBuffer(), outputMint.toBuffer()], programId);
          const [poolBA] = PublicKey.findProgramAddressSync([POOL_SEED, ammConfig.toBuffer(), outputMint.toBuffer(), p.inputMint.toBuffer()], programId);
          if (poolAB.equals(p.poolId) || poolBA.equals(p.poolId)) {
            const chosen = poolAB.equals(p.poolId) ? poolAB : poolBA;
            const [vaultIn] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, chosen.toBuffer(), p.inputMint.toBuffer()], programId);
            const [vaultOut] = PublicKey.findProgramAddressSync([POOL_VAULT_SEED, chosen.toBuffer(), outputMint.toBuffer()], programId);
            const [observation] = PublicKey.findProgramAddressSync([ORACLE_SEED, chosen.toBuffer()], programId);
            found = { programId, ammConfig, pool: chosen, vaultIn, vaultOut, observation, authority };
            break;
          }
        }
        if (found) break;
      }
      if (found) {
        discovered[p.name] = found;
        // console.log(`Discovered redeem pool (hardcoded) for ${p.name}: ${p.poolId.toBase58()}`);
      } else {
        // console.log(`Failed to discover hardcoded redeem pool for ${p.name}: ${p.poolId.toBase58()}`);
      }
    }

    return discovered;
  };

  /**
   * Build Raydium CPMM account block for a specific pool
   */
  const buildRaydiumBlock = async (
    poolName: string,
    args: BuildBlockArgs,
    discoveredPools: DiscoveredPools,
    vault: PublicKey,
    vaultStable: PublicKey
  ): Promise<any[]> => {
    const { inMint, outMint, inVaultOnPool, outVaultOnPool } = args;
    const poolInfo = discoveredPools[poolName];
    if (!poolInfo) throw new Error(`Pool ${poolName} not discovered`);
    
    // For Raydium CPI, payer must be the owner of input/output token accounts (vault PDA)
    // Use the program's declared vaultStable (matches PDA created on-chain) for input
    const vaIn = vaultStable;
    const vaOut = outMint.equals(TETH_MINT) ? 
      await getAssociatedTokenAddress(TETH_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID) :
      outMint.equals(TUSDT_MINT) ? 
      await getAssociatedTokenAddress(TUSDT_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID) :
      await getAssociatedTokenAddress(outMint, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    
    return [
      { pubkey: poolInfo.programId, isSigner: false, isWritable: false },
      { pubkey: vault,             isSigner: false, isWritable: false },
      { pubkey: poolInfo.authority, isSigner: false, isWritable: false },
      { pubkey: poolInfo.ammConfig, isSigner: false, isWritable: false },
      { pubkey: poolInfo.pool,      isSigner: false, isWritable: true  },
      { pubkey: vaIn,               isSigner: false, isWritable: true  },
      { pubkey: vaOut,              isSigner: false, isWritable: true  },
      { pubkey: inVaultOnPool,      isSigner: false, isWritable: true  },
      { pubkey: outVaultOnPool,     isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: inMint,             isSigner: false, isWritable: false },
      { pubkey: outMint,            isSigner: false, isWritable: false },
      { pubkey: poolInfo.observation, isSigner: false, isWritable: true },
    ];
  };

  /**
   * Build Raydium CPMM account block for redeem (reverse direction: TETH/TUSDT -> WSOL)
   */
  const buildRaydiumBlockRedeem = async (
    poolName: string,
    args: BuildBlockArgs,
    discoveredPools: DiscoveredPools,
    vault: PublicKey,
    userStableAta: PublicKey
  ): Promise<any[]> => {
    const { inMint, outMint, inVaultOnPool, outVaultOnPool } = args;
    const poolInfo = discoveredPools[poolName];
    if (!poolInfo) throw new Error(`Pool ${poolName} not discovered`);

    // For redeem: input is underlying mint (TETH/TUSDT) from vault ATA, output is WSOL to user's WSOL ATA
    const vaultInputAta = await getAssociatedTokenAddress(inMint, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const vaultOutputAta = userStableAta;

    return [
      { pubkey: poolInfo.programId, isSigner: false, isWritable: false },
      { pubkey: vault,             isSigner: false, isWritable: false },
      { pubkey: poolInfo.authority, isSigner: false, isWritable: false },
      { pubkey: poolInfo.ammConfig, isSigner: false, isWritable: false },
      { pubkey: poolInfo.pool,      isSigner: false, isWritable: true  },
      { pubkey: vaultInputAta,      isSigner: false, isWritable: true  },
      { pubkey: vaultOutputAta,     isSigner: false, isWritable: true  },
      { pubkey: inVaultOnPool,      isSigner: false, isWritable: true  },
      { pubkey: outVaultOnPool,     isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: inMint,             isSigner: false, isWritable: false },
      { pubkey: outMint,            isSigner: false, isWritable: false },
      { pubkey: poolInfo.observation, isSigner: false, isWritable: true },
    ];
  };

  /**
   * Ensure vault-owned ATA exists for a given mint
   */
  const ensureVaultAta = async (
    mint: PublicKey,
    vault: PublicKey,
    connection: Connection,
    payer: PublicKey
  ): Promise<{ ata: PublicKey; createIx?: TransactionInstruction }> => {
    const ata = await getAssociatedTokenAddress(
      mint,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const ix = createAssociatedTokenAccountInstruction(
        payer,
        ata,
        vault,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      return { ata, createIx: ix };
    }
    return { ata };
  };

  /**
   * Build all remaining accounts for Raydium swap
   */
  const buildRemainingAccounts = async (
    discoveredPools: DiscoveredPools,
    vault: PublicKey,
    vaultStable: PublicKey
  ): Promise<any[]> => {
    const remaining: any[] = [];
    
    // Add TETH pool block if discovered
    if (discoveredPools.TETH) {
      const blockTETH = await buildRaydiumBlock("TETH", {
        inMint: WRAPPED_SOL,
        outMint: TETH_MINT,
        inVaultOnPool: discoveredPools.TETH.vaultIn,
        outVaultOnPool: discoveredPools.TETH.vaultOut,
      }, discoveredPools, vault, vaultStable);
      remaining.push(...blockTETH);
      // console.log(`Added TETH pool block (${blockTETH.length} accounts)`);
    }

    // Add TUSDT pool block if discovered
    if (discoveredPools.TUSDT) {
      const blockTUSDT = await buildRaydiumBlock("TUSDT", {
        inMint: WRAPPED_SOL,
        outMint: TUSDT_MINT,
        inVaultOnPool: discoveredPools.TUSDT.vaultIn,
        outVaultOnPool: discoveredPools.TUSDT.vaultOut,
      }, discoveredPools, vault, vaultStable);
      remaining.push(...blockTUSDT);
      // console.log(`Added TUSDT pool block (${blockTUSDT.length} accounts)`);
    }

    // console.log(`Constructed remaining accounts (${remaining.length})`);
    return remaining;
  };

  /**
   * Build all remaining accounts for Raydium redeem (reverse direction: TETH/TUSDT -> WSOL)
   */
  const buildRedeemRemainingAccounts = async (
    discoveredPools: DiscoveredPools,
    vault: PublicKey,
    userStableAta: PublicKey
  ): Promise<any[]> => {
    const remaining: any[] = [];

    // TUSDT -> WSOL
    if (discoveredPools.TUSDT) {
      const blockTUSDT = await buildRaydiumBlockRedeem(
        "TUSDT",
        {
          inMint: TUSDT_MINT,
          outMint: WRAPPED_SOL,
          inVaultOnPool: discoveredPools.TUSDT.vaultIn,
          outVaultOnPool: discoveredPools.TUSDT.vaultOut,
        },
        discoveredPools,
        vault,
        userStableAta
      );
      remaining.push(...blockTUSDT);
      // console.log(`Added TUSDT pool block for redeem (${blockTUSDT.length} accounts)`);
    }

    // TETH -> WSOL
    if (discoveredPools.TETH) {
      const blockTETH = await buildRaydiumBlockRedeem(
        "TETH",
        {
          inMint: TETH_MINT,
          outMint: WRAPPED_SOL,
          inVaultOnPool: discoveredPools.TETH.vaultIn,
          outVaultOnPool: discoveredPools.TETH.vaultOut,
        },
        discoveredPools,
        vault,
        userStableAta
      );
      remaining.push(...blockTETH);
      // console.log(`Added TETH pool block for redeem (${blockTETH.length} accounts)`);
    }

    // console.log(`Constructed redeem remaining accounts (${remaining.length})`);
    return remaining;
  };

  return {
    discoverRaydiumPools,
    discoverRedeemPools,
    discoverRedeemPoolsHardcoded,
    buildRaydiumBlock,
    buildRaydiumBlockRedeem,
    ensureVaultAta,
    buildRemainingAccounts,
    buildRedeemRemainingAccounts,
    // Export constants for external use
    WRAPPED_SOL,
    TETH_MINT,
    TUSDT_MINT,
    TETH_POOL_ID,
    TUSDT_POOL_ID,
    RAYDIUM_CPMM_PROGRAM,
    RAYDIUM_ALT_PROGRAM,
  };
};
