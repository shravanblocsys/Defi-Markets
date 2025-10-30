import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getOrCreateAssociatedTokenAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from "@solana/spl-token";
import { struct, u8, publicKey, u64 } from "@project-serum/borsh";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY) : 
  [8,89,214,209,151,193,55,105,55,165,23,237,83,215,123,220,196,159,100,66,122,214,46,183,198,34,51,226,117,230,0,13,126,183,64,88,155,122,33,214,151,68,146,190,7,32,204,198,64,136,250,102,81,17,68,128,146,121,14,75,154,41,111,80];
  // [218, 160, 156, 207, 217, 144, 46, 141, 140, 106, 192, 30, 136, 203, 151, 236, 131, 86, 7, 12, 222, 40, 56, 4, 29, 98, 129, 224, 192, 213, 235, 79, 2, 121, 37, 132, 3, 119, 111, 162, 29, 181, 242, 207, 186, 240, 82, 113, 40, 81, 158, 52, 38, 245, 133, 72, 218, 91, 179, 240, 231, 33, 143, 187];
// [13,138,242,234,176,15,76,45,100,79,64,120,196,232,211,129,204,247,111,70,16,229,245,75,211,103,189,113,221,172,246,65,57,173,39,146,28,132,211,144,112,6,104,35,27,201,144,206,206,79,189,62,155,146,172,226,64,160,171,213,65,139,67,148]

  const STABLECOIN_MINT = NATIVE_MINT; // WSOL deposit
const DEVNET_USDC = new PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT");
const DEVNET_USDT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");

// Raydium CPMM (for swap CPI on devnet)
// Pool IDs for specific token pairs
const TETH_POOL_ID = new PublicKey("8g2uew22JxhStC5QArvGT5wUmG9oZVYzcYACCAbpStmR"); // SOL/TETH pool
const TUSDT_POOL_ID = new PublicKey("9yGB6NGsZLYrZTCciUTBBAGuPK9vibC2jQZSKyLPEHMk"); // SOL/TUSDT pool
const POOL_ID = TUSDT_POOL_ID; // Default to TUSDT pool
// Known Raydium program IDs on devnet
const RAYDIUM_CPMM_PROGRAM = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"); // CPMM (cpmm-cpi crate)
const RAYDIUM_ALT_PROGRAM = new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"); // Other Raydium deployment
let CPMM_PROGRAM_DEVNET = RAYDIUM_CPMM_PROGRAM;
let CPMM_POOL_ID: PublicKey | undefined = undefined; // hardcode or pass via CLI

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

function pdaFactory() { return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; }
function pdaVault(factory: PublicKey, index: number) { return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; }
function pdaVaultMint(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_mint"), vault.toBuffer()], program.programId)[0]; }
function pdaVaultStablecoin(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_stablecoin_account"), vault.toBuffer()], program.programId)[0]; }

async function ensureLamports(need: number) {
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance >= need) return;
  const topUp = need - balance + Math.floor(0.05 * LAMPORTS_PER_SOL);
  const sig = await connection.requestAirdrop(wallet.publicKey, topUp);
  await connection.confirmTransaction(sig, "confirmed");
}

async function cmdDeposit(indexStr: string, amountStr: string, cpmmPoolIdStr?: string) {
  let step = 0; const stepLog = (m: string) => console.log(`STEP ${++step}: ${m}`);
  stepLog(`entered cmdDeposit with args indexStr=${indexStr}, amountStr=${amountStr}`);
  if (cpmmPoolIdStr) {
    try { CPMM_POOL_ID = new PublicKey(cpmmPoolIdStr); stepLog(`using CPMM_POOL_ID from CLI: ${CPMM_POOL_ID.toBase58()}`); } catch {}
  }
  const index = parseInt(indexStr);
  const uiAmount = parseFloat(amountStr);
  if (isNaN(index) || isNaN(uiAmount)) throw new Error("usage: deposit <index> <amount>");
  stepLog(`parsed index=${index}, uiAmount=${uiAmount}`);
  const amount = BigInt(Math.floor(uiAmount * 1e9));
  stepLog(`computed amount in lamports=${amount.toString()}`);

  const factory = pdaFactory();
  const vault = pdaVault(factory, index);
  const vaultMint = pdaVaultMint(vault);
  const vaultStable = pdaVaultStablecoin(vault);
  stepLog(`derived PDAs factory=${factory.toBase58()} vault=${vault.toBase58()} vaultMint=${vaultMint.toBase58()} vaultStable=${vaultStable.toBase58()}`);

  const userWsolAta = await getAssociatedTokenAddress(STABLECOIN_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  stepLog(`computed userWsolAta=${userWsolAta.toBase58()}`);
  const ataInfo = await connection.getAccountInfo(userWsolAta);
  stepLog(`fetched ataInfo exists=${!!ataInfo}`);
  const ixs: any[] = [];
  if (!ataInfo) {
    stepLog(`pushing createAssociatedTokenAccountInstruction for WSOL`);
    ixs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, userWsolAta, wallet.publicKey, STABLECOIN_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  }
  stepLog(`ensuring lamports before wrapping`);
  await ensureLamports(Number(amount) + Math.floor(0.01 * LAMPORTS_PER_SOL));
  stepLog(`lamports ensured`);
  ixs.push(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: userWsolAta, lamports: Number(amount) }));
  stepLog(`pushed SystemProgram.transfer to wrap SOL`);
  ixs.push(createSyncNativeInstruction(userWsolAta));
  stepLog(`pushed createSyncNativeInstruction`);
  await provider.sendAndConfirm(new Transaction().add(...ixs), []);
  stepLog(`sent wrap SOL transaction`);

  // Ensure user USDC and USDT ATAs exist for potential swap outputs
  const userUsdcAta = await getAssociatedTokenAddress(DEVNET_USDC, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userUsdcInfo = await connection.getAccountInfo(userUsdcAta);
  if (!userUsdcInfo) {
    const createUsdcAtaIx = createAssociatedTokenAccountInstruction(wallet.publicKey, userUsdcAta, wallet.publicKey, DEVNET_USDC, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    await provider.sendAndConfirm(new Transaction().add(createUsdcAtaIx), []);
  }
  const userUsdtAta = await getAssociatedTokenAddress(DEVNET_USDT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userUsdtInfo = await connection.getAccountInfo(userUsdtAta);
  if (!userUsdtInfo) {
    const createUsdtAtaIx = createAssociatedTokenAccountInstruction(wallet.publicKey, userUsdtAta, wallet.publicKey, DEVNET_USDT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    await provider.sendAndConfirm(new Transaction().add(createUsdtAtaIx), []);
  }

  // Balances before
  const safeAmount = async (ata: PublicKey) => { try { const acc = await getAccount(connection, ata); return acc.amount; } catch { return BigInt(0); } };
  const beforeUserWSOL = await safeAmount(userWsolAta);
  const beforeVaultWSOL = await safeAmount(vaultStable);
  const beforeVaultTETH = await safeAmount(await getAssociatedTokenAddress(TETH_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  const beforeVaultTUSDT = await safeAmount(await getAssociatedTokenAddress(TUSDT_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  stepLog(`queried pre-balances userWSOL=${beforeUserWSOL.toString()} vaultWSOL=${beforeVaultWSOL.toString()} vaultTETH=${beforeVaultTETH.toString()} vaultTUSDT=${beforeVaultTUSDT.toString()}`);
  console.log("[before] user WSOL:", beforeUserWSOL.toString(), "vault WSOL:", beforeVaultWSOL.toString(), "vault TETH:", beforeVaultTETH.toString(), "vault TUSDT:", beforeVaultTUSDT.toString());

  try {
    // Build CPMM remaining accounts by deriving PDAs using Raydium CPMM seeds
    const AMM_CONFIG_SEED = Buffer.from("amm_config");
    const POOL_SEED = Buffer.from("pool");
    const POOL_VAULT_SEED = Buffer.from("pool_vault");
    const ORACLE_SEED = Buffer.from("observation");
    const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");

    const inputMint = WRAPPED_SOL;
    
    // Define both output mints and their corresponding pools
    const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
    const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
    
    const pools = [
      { outputMint: TETH_MINT, poolId: TETH_POOL_ID, name: "TETH" },
      { outputMint: TUSDT_MINT, poolId: TUSDT_POOL_ID, name: "TUSDT" }
    ];

    const candidatePrograms = [RAYDIUM_CPMM_PROGRAM, RAYDIUM_ALT_PROGRAM];
    let discoveredPools: { [key: string]: { programId: PublicKey; ammConfig: PublicKey; pool: PublicKey; vaultIn: PublicKey; vaultOut: PublicKey; observation: PublicKey; authority: PublicKey; } } = {};

    // Discover both pools
    for (const poolInfo of pools) {
      const { outputMint, poolId, name } = poolInfo;
      let discovered: { programId: PublicKey; ammConfig: PublicKey; pool: PublicKey; vaultIn: PublicKey; vaultOut: PublicKey; observation: PublicKey; authority: PublicKey; } | null = null;

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
        stepLog(`Discovered ${name} pool: ${poolId.toBase58()}`);
      } else {
        stepLog(`Failed to discover ${name} pool: ${poolId.toBase58()}`);
      }
    }

    if (Object.keys(discoveredPools).length === 0) {
      throw new Error("Unable to discover any Raydium CPMM pools for TETH/TUSDT under known programs");
    }

    // Use the first discovered pool as the primary program
    const firstPool = Object.values(discoveredPools)[0];
    CPMM_PROGRAM_DEVNET = firstPool.programId;
    
    // Ensure vault-owned ATAs exist for input (WSOL) and outputs (TETH/TUSDT)
    async function ensureVaultAta(mint: PublicKey) {
      const ata = await getAssociatedTokenAddress(mint, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const info = await connection.getAccountInfo(ata);
      if (!info) {
        const ix = createAssociatedTokenAccountInstruction(wallet.publicKey, ata, vault, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        await provider.sendAndConfirm(new Transaction().add(ix), []);
      }
      return ata;
    }
    const vaultInputAtaGlobal = await ensureVaultAta(inputMint);
    const vaultTethAtaGlobal = await ensureVaultAta(TETH_MINT);
    const vaultTusdtAtaGlobal = await ensureVaultAta(TUSDT_MINT);

    const buildBlock = async (poolName: string, args: { inMint: PublicKey; outMint: PublicKey; inVaultOnPool: PublicKey; outVaultOnPool: PublicKey; }): Promise<any[]> => {
      const { inMint, outMint, inVaultOnPool, outVaultOnPool } = args;
      const poolInfo = discoveredPools[poolName];
      if (!poolInfo) throw new Error(`Pool ${poolName} not discovered`);
      
      // For Raydium CPI, payer must be the owner of input/output token accounts (vault PDA)
      // Use the program's declared vaultStable (matches PDA created on-chain) for input
      const vaIn = vaultStable;
      const vaOut = outMint.equals(TETH_MINT) ? vaultTethAtaGlobal : outMint.equals(TUSDT_MINT) ? vaultTusdtAtaGlobal : await getAssociatedTokenAddress(outMint, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      
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

    // Build blocks for both pools
    const remaining: any[] = [];
    
    // Add TETH pool block if discovered
    if (discoveredPools.TETH) {
      const blockTETH = await buildBlock("TETH", {
        inMint: WRAPPED_SOL,
        outMint: TETH_MINT,
        inVaultOnPool: discoveredPools.TETH.vaultIn,
        outVaultOnPool: discoveredPools.TETH.vaultOut,
      });
      remaining.push(...blockTETH);
      stepLog(`Added TETH pool block (${blockTETH.length} accounts)`);
    }

    // Add TUSDT pool block if discovered
    if (discoveredPools.TUSDT) {
      const blockTUSDT = await buildBlock("TUSDT", {
        inMint: WRAPPED_SOL,
        outMint: TUSDT_MINT,
        inVaultOnPool: discoveredPools.TUSDT.vaultIn,
        outVaultOnPool: discoveredPools.TUSDT.vaultOut,
      });
      remaining.push(...blockTUSDT);
      stepLog(`Added TUSDT pool block (${blockTUSDT.length} accounts)`);
    }
    stepLog(`constructed remaining accounts (${remaining.length})`);

    const userVaultToken = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, vaultMint, wallet.publicKey);
    stepLog(`ensured userVaultToken ATA ${userVaultToken.address.toBase58()}`);
    const factoryAcc = await program.account.factory.fetch(factory);
    stepLog(`fetched factory account`);
    const feeRecipientStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, factoryAcc.feeRecipient);
    stepLog(`ensured feeRecipientStable ATA ${feeRecipientStable.address.toBase58()}`);
    const vaultAcc = await program.account.vault.fetch(vault);
    stepLog(`fetched vault account`);
    const vaultAdminStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, vaultAcc.admin);
    stepLog(`ensured vaultAdminStable ATA ${vaultAdminStable.address.toBase58()}`);

    console.log("Sending deposit transaction...");
    const tx = await program.methods
      .deposit(index, new anchor.BN(amount.toString()))
      .accountsStrict({
        user: wallet.publicKey,
        factory,
        vault,
        vaultMint,
        userStablecoinAccount: userWsolAta,
        stablecoinMint: STABLECOIN_MINT,
        vaultStablecoinAccount: vaultStable,
        userVaultAccount: userVaultToken.address,
        feeRecipientStablecoinAccount: feeRecipientStable.address,
        vaultAdminStablecoinAccount: vaultAdminStable.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remaining || [])
      .rpc();
    console.log("deposit tx:", tx);
    stepLog(`deposit rpc sent sig=${tx}`);

    const afterUserWSOL = await safeAmount(userWsolAta);
    const afterVaultWSOL = await safeAmount(vaultStable);
    const afterVaultTETH = await safeAmount(await getAssociatedTokenAddress(TETH_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    const afterVaultTUSDT = await safeAmount(await getAssociatedTokenAddress(TUSDT_MINT, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    stepLog(`queried post-balances`);
    console.log("[after ] user WSOL:", afterUserWSOL.toString(), "vault WSOL:", afterVaultWSOL.toString(), "vault TETH:", afterVaultTETH.toString(), "vault TUSDT:", afterVaultTUSDT.toString());
    console.log("[delta ] user WSOL:", (afterUserWSOL - beforeUserWSOL).toString(), "vault WSOL:", (afterVaultWSOL - beforeVaultWSOL).toString(), "vault TETH:", (afterVaultTETH - beforeVaultTETH).toString(), "vault TUSDT:", (afterVaultTUSDT - beforeVaultTUSDT).toString());

  } catch (error) {
    stepLog(`caught error: ${(error as any)?.message || error}`);
    console.error("Error in deposit process:", error);
    // Fallback: Try to get pool info directly from on-chain
    console.log("Trying fallback approach...");
    const poolAccount = await connection.getAccountInfo(POOL_ID);
    stepLog(`fallback getAccountInfo for pool, exists=${!!poolAccount}`);
    if (poolAccount) {
      console.log("Pool exists on-chain. The issue might be with Raydium SDK configuration.");
    }
  }
}

const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  if (cmd !== "deposit") {
    console.log("Usage: npx ts-node deposit.ts deposit <vault_index> <amount> [cpmm_pool_id]");
    process.exit(0);
  }
  const [index, amount, cpmmPoolId] = rest;
  await cmdDeposit(index, amount, cpmmPoolId);
})();