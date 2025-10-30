import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount, getMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount, createAssociatedTokenAccount } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// Hardcoded private key (replace with your actual private key array)
// const PRIVATE_KEY = [218, 160, 156, 207, 217, 144, 46, 141, 140, 106, 192, 30, 136, 203, 151, 236, 131, 86, 7, 12, 222, 40, 56, 4, 29, 98, 129, 224, 192, 213, 235, 79, 2, 121, 37, 132, 3, 119, 111, 162, 29, 181, 242, 207, 186, 240, 82, 113, 40, 81, 158, 52, 38, 245, 133, 72, 218, 91, 179, 240, 231, 33, 143, 187];
// const PRIVATE_KEY = [8,89,214,209,151,193,55,105,55,165,23,237,83,215,123,220,196,159,100,66,122,214,46,183,198,34,51,226,117,230,0,13,126,183,64,88,155,122,33,214,151,68,146,190,7,32,204,198,64,136,250,102,81,17,68,128,146,121,14,75,154,41,111,80];
const PRIVATE_KEY = [195,202,161,3,114,129,253,3,83,2,189,101,201,224,215,42,197,16,141,125,117,25,148,108,137,203,148,87,142,129,22,236,173,70,20,149,74,139,63,243,169,112,31,12,248,231,56,250,207,205,144,152,101,185,63,192,34,217,83,190,37,55,2,209];
// [211,99,57,232,164,104,188,33,181,164,72,175,213,153,155,99,144,114,240,86,225,124,121,72,69,123,76,24,11,46,6,111,225,85,53,7,116,210,156,66,80,9,148,13,250,186,234,244,198,23,171,96,222,93,214,215,70,57,95,68,225,209,217,238];// Hardcoded wallet address (replace with your actual public key)
// const WALLET_ADDRESS = "AexZm9S565MmrLuJvNvtvfoAwB5z52Wcj6bgJ9xaHrA";
// const WALLET_ADDRESS = "4t9Nu6Tm2QGgp3TTbonrQ9GtkEwu13cbt9jrfA67KAbD";
const WALLET_ADDRESS = "CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY";
// Example token mint addresses (replace with actual token mints)
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC

// Store created stablecoin mint address
let CREATED_STABLECOIN_MINT: PublicKey | null = null;

// Hardcoded stablecoin mint address (created earlier)
const STABLECOIN_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Random generation functions
function generateRandomVaultName(): string {
  const prefixes = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];
  const suffixes = ["Vault", "Fund", "Pool", "Strategy", "Index", "Portfolio", "Capital", "Assets", "Growth", "Yield"];
  const numbers = Math.floor(Math.random() * 9999) + 1;

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  return `${prefix} ${suffix} ${numbers}`;
}

function generateRandomVaultSymbol(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = Math.floor(Math.random() * 99) + 1;

  let symbol = "";
  for (let i = 0; i < 3; i++) {
    symbol += letters[Math.floor(Math.random() * letters.length)];
  }

  return `${symbol}${numbers}`;
}

// Create keypair from hardcoded private key
const keypair = Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY));

// Provider + connection
const RPC_URL = "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Create wallet from the keypair
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: "processed"
});
anchor.setProvider(provider);

// Program ID from deployed program
const programId = new PublicKey("CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs");

// Create program instance using the actual IDL
const program = new anchor.Program<VaultMvp>(
  idl as anchor.Idl,
  provider
) as anchor.Program<VaultMvp>;

// Helper function to create stablecoin token
async function createStablecoinToken() {
  console.log("🪙 Creating Stablecoin Token (like USDC)...");

  try {
    // Create mint with 6 decimals (like USDC)
    const mint = await createMint(
      connection,
      keypair, // payer
      keypair.publicKey, // mint authority
      keypair.publicKey, // freeze authority
      6 // decimals
    );

    console.log("✅ Stablecoin mint created:", mint.toBase58());

    // Create token account for the admin wallet
    const tokenAccount = await createAccount(
      connection,
      keypair, // payer
      mint, // mint
      keypair.publicKey // owner
    );

    console.log("✅ Token account created:", tokenAccount.toBase58());

    // Mint 100,000,000 tokens (100M with 6 decimals = 100,000,000,000,000 raw units)
    const mintAmount = 100_000_000 * Math.pow(10, 6); // 100M tokens with 6 decimals
    const mintTx = await mintTo(
      connection,
      keypair, // payer
      mint, // mint
      tokenAccount, // destination
      keypair, // authority
      mintAmount // amount
    );

    console.log("✅ Minted 100,000,000 tokens! tx:", mintTx);

    // Verify the mint
    const mintInfo = await getMint(connection, mint);
    console.log("📊 Mint Info:", {
      address: mint.toBase58(),
      decimals: mintInfo.decimals,
      supply: mintInfo.supply.toString(),
    });

    // Verify the token account
    const accountInfo = await getAccount(connection, tokenAccount);
    console.log("💳 Token Account Info:", {
      address: tokenAccount.toBase58(),
      mint: accountInfo.mint.toBase58(),
      owner: accountInfo.owner.toBase58(),
      amount: accountInfo.amount.toString(),
    });

    // Store the mint address for later use
    CREATED_STABLECOIN_MINT = mint;

    console.log("🎉 Stablecoin token creation completed!");
    console.log("📋 Mint Address:", mint.toBase58());
    console.log("📋 Token Account:", tokenAccount.toBase58());
    console.log("💰 Total Supply: 100,000,000 tokens");

    return { mint, tokenAccount };
  } catch (err) {
    console.error("❌ Stablecoin creation error:", err);
    throw err;
  }
}

// Helper function to initialize factory
async function initializeFactory() {
  console.log("🏭 Initializing Factory...");

  const [factoryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory_v2")], // Using v2 to avoid conflict with old factory
    program.programId
  );

  try {
    // Check if factory already exists
    const factoryInfo = await connection.getAccountInfo(factoryPDA);
    if (factoryInfo) {
      console.log("⚠️ Factory already initialized");
      const factory = await program.account.factory.fetch(factoryPDA);
      console.log("📦 Existing Factory:", factory);
      return factoryPDA;
    }

    // Initialize factory
    const tx = await program.methods
      .initializeFactory(
        25, // entry_fee_bps
        25, // exit_fee_bps
        new anchor.BN(10_000_000), // vault_creation_fee_usdc (10 USDC assuming 6 decimals)
        50, // min_management_fee_bps
        300, // max_management_fee_bps
        7000, // vault_creator_fee_ratio_bps
        3000, // platform_fee_ratio_bps

      )
      .accountsStrict({
        admin: wallet.publicKey,
        factory: factoryPDA,
        feeRecipient: new PublicKey(WALLET_ADDRESS),
        systemProgram: SystemProgram.programId
      })
      .rpc();

    console.log("✅ Factory initialized! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    const factory = await program.account.factory.fetch(factoryPDA);
    console.log("📦 Factory:", factory);
    return factoryPDA;
  } catch (err) {
    console.error("❌ Factory initialization error:", err);
    throw err;
  }
}

// Helper function to create vault
async function createVault(factoryPDA: PublicKey) {
  console.log("🏦 Creating Vault...");

  try {
    // Get factory account to get current vault count
    const factory = await program.account.factory.fetch(factoryPDA);
    const vaultIndex = factory.vaultCount;

    console.log(`📊 Creating vault #${vaultIndex + 1}`);

    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    // Calculate vault token account PDA
    const [vaultTokenAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token_account"), vaultPDA.toBuffer()],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("🪙 Vault Mint PDA:", vaultMintPDA.toBase58());
    console.log("💳 Vault Token Account PDA:", vaultTokenAccountPDA.toBase58());

    // Define underlying assets (50% TUSDT, 50% TETH)
    const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
    const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
    
    const underlyingAssets = [
      {
        mintAddress: TUSDT_MINT,
        mintBps: 5000 // 50%
      },
      {
        mintAddress: TETH_MINT,
        mintBps: 5000 // 50%
      }
    ];

    console.log("📋 Underlying Assets:", underlyingAssets);

    // Generate random vault name and symbol
    const vaultName = generateRandomVaultName();
    const vaultSymbol = generateRandomVaultSymbol();

    console.log("🎲 Generated Vault Name:", vaultName);
    console.log("🎲 Generated Vault Symbol:", vaultSymbol);

    // Prepare stablecoin accounts for creation fee (10 USDC)
    // Use STABLECOIN_MINT as the USDC-equivalent mint
    const stablecoinMintForFee = STABLECOIN_MINT;

    // Admin's stablecoin (payer) ATA
    const adminStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      stablecoinMintForFee,
      keypair.publicKey
    );

    // Factory admin's stablecoin (recipient) ATA
    const factoryAdminStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      stablecoinMintForFee,
      factory.admin
    );

    // Create vault
    const tx = await program.methods
      .createVault(
        vaultName,        // vault_name (randomly generated)
        vaultSymbol,      // vault_symbol (randomly generated)
        underlyingAssets,
        200              // management_fees (2%) - within current factory limits
      )
      .accountsStrict({
        admin: wallet.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultTokenAccount: vaultTokenAccountPDA,
        stablecoinMint: stablecoinMintForFee,
        adminStablecoinAccount: adminStablecoinAccount.address,
        factoryAdminStablecoinAccount: factoryAdminStablecoinAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Vault created! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    // Fetch and display vault details
    const vault = await program.account.vault.fetch(vaultPDA);
    console.log("🏦 Vault Details:", {
      vaultIndex: vault.vaultIndex,
      vaultName: vault.vaultName,
      vaultSymbol: vault.vaultSymbol,
      underlyingAssets: vault.underlyingAssets,
      managementFees: vault.managementFees,
      state: vault.state,
      totalAssets: vault.totalAssets.toString(),
      totalSupply: vault.totalSupply.toString(),
      createdAt: new Date(vault.createdAt.toNumber() * 1000).toISOString()
    });

    return vaultPDA;
  } catch (err) {
    console.error("❌ Vault creation error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
      if (err.message.includes("Error Number:")) {
        console.error("Anchor error details:", err);
      }
    }
    throw err;
  }
}

// Helper function to get factory information
async function getFactoryInfo(factoryPDA: PublicKey) {
  console.log("📊 Getting Factory Information...");

  try {
    // First try to get account info directly
    const accountInfo = await connection.getAccountInfo(factoryPDA);
    if (!accountInfo) {
      throw new Error("Factory account not found");
    }
    
    console.log("📊 Factory account exists, size:", accountInfo.data.length, "bytes");
    
    // Try to fetch using the program method
    const factoryInfo = await program.methods
      .getFactoryInfo()
      .accountsStrict({
        factory: factoryPDA,
      })
      .view();

    console.log("🏭 Factory Information:", {
      factoryAddress: factoryInfo.factoryAddress.toBase58(),
      admin: factoryInfo.admin.toBase58(),
      feeRecipient: factoryInfo.feeRecipient.toBase58(),
      vaultCount: factoryInfo.vaultCount,
      state: factoryInfo.state,
      entryFeeBps: factoryInfo.entryFeeBps,
      exitFeeBps: factoryInfo.exitFeeBps,
      vaultCreationFeeUsdc: factoryInfo.vaultCreationFeeUsdc.toString(),
      minManagementFeeBps: factoryInfo.minManagementFeeBps,
      maxManagementFeeBps: factoryInfo.maxManagementFeeBps,
      vaultCreatorFeeRatioBps: factoryInfo.vaultCreatorFeeRatioBps,
      platformFeeRatioBps: factoryInfo.platformFeeRatioBps,
    });

    return factoryInfo;
  } catch (err) {
    console.error("❌ Factory info error:", err);
    
    // If there's a decoding error, try to get basic account info
    try {
      const accountInfo = await connection.getAccountInfo(factoryPDA);
      if (accountInfo) {
        console.log("📊 Factory account exists but has decoding issues:");
        console.log("  - Account size:", accountInfo.data.length, "bytes");
        console.log("  - Owner:", accountInfo.owner.toBase58());
        console.log("  - This suggests a version mismatch between deployed program and current IDL");
        console.log("  - The factory was likely created with an older version of the program");
      }
    } catch (basicErr) {
      console.error("❌ Could not get basic account info:", basicErr);
    }
    
    throw err;
  }
}

// Helper function to get all vaults
async function getAllVaults(factoryPDA: PublicKey) {
  console.log("📋 Getting All Vaults Information...");

  try {
    // First get factory info to know how many vaults exist
    const factoryInfo = await getFactoryInfo(factoryPDA);
    const vaultCount = factoryInfo.vaultCount;

    console.log(`🔢 Found ${vaultCount} vaults in factory`);

    const allVaults = [];

    console.log(`✅ Successfully retrieved ${allVaults.length} vaults`);
    return allVaults;
  } catch (err) {
    console.error("❌ Get all vaults error:", err);
    throw err;
  }
}

// Helper function to get deposit details for a user and vault
async function getDepositDetails(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`📊 Getting Deposit Details for Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault's stablecoin token account PDA
    const [vaultStablecoinAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    // Get or create user's vault token account
    const userVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner
    );

    const depositDetails = await program.methods
      .getDepositDetails(vaultIndex)
      .accountsStrict({
        user: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        userVaultAccount: userVaultAccount.address,
        vaultStablecoinAccount: vaultStablecoinAccountPDA,
      })
      .view();

    console.log("📊 Deposit Details:", {
      vaultAddress: depositDetails.vaultAddress.toBase58(),
      vaultIndex: depositDetails.vaultIndex,
      vaultName: depositDetails.vaultName,
      vaultSymbol: depositDetails.vaultSymbol,
      userAddress: depositDetails.userAddress.toBase58(),
      userVaultTokenBalance: depositDetails.userVaultTokenBalance.toString(),
      vaultTotalAssets: depositDetails.vaultTotalAssets.toString(),
      vaultTotalSupply: depositDetails.vaultTotalSupply.toString(),
      vaultStablecoinBalance: depositDetails.vaultStablecoinBalance.toString(),
      stablecoinMint: depositDetails.stablecoinMint.toBase58(),
      vaultState: depositDetails.vaultState,
      createdAt: new Date(depositDetails.createdAt * 1000).toISOString(),
    });

    return depositDetails;
  } catch (err) {
    console.error("❌ Get deposit details error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}


// Helper to pause/resume a vault
async function setVaultPaused(factoryPDA: PublicKey, vaultIndex: number, paused: boolean) {
  console.log(`${paused ? "⏸️ Pausing" : "▶️ Resuming"} Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());

    const tx = await program.methods
      .setVaultPaused(vaultIndex, paused)
      .accountsStrict({
        admin: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Vault ${paused ? "paused" : "resumed"}! tx:`, tx);
    await connection.confirmTransaction(tx, "confirmed");
  } catch (err) {
    console.error(`❌ Failed to ${paused ? "pause" : "resume"} vault:`, err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Helper function to get vault fees (factory fees + vault management fees)
async function getVaultFees(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`💰 Getting Vault #${vaultIndex} Fees...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    const vaultFees = await program.methods
      .getVaultFees(vaultIndex)
      .accountsStrict({
        factory: factoryPDA,
        vault: vaultPDA,
      })
      .view();

    console.log("💰 Vault Fees Information:", {
      // Factory fees
      entryFeeBps: vaultFees.entryFeeBps,
      exitFeeBps: vaultFees.exitFeeBps,
      vaultCreationFeeUsdc: vaultFees.vaultCreationFeeUsdc.toString(),
      minManagementFeeBps: vaultFees.minManagementFeeBps,
      maxManagementFeeBps: vaultFees.maxManagementFeeBps,
      
      // Vault-specific fees
      vaultManagementFees: vaultFees.vaultManagementFees,
      
      // Vault info
      vaultIndex: vaultFees.vaultIndex,
      vaultName: vaultFees.vaultName,
      vaultSymbol: vaultFees.vaultSymbol,
      vaultAdmin: vaultFees.vaultAdmin.toBase58(),
    });

    return vaultFees;
  } catch (err) {
    console.error("❌ Get vault fees error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Helper function to update factory fees
async function updateFactoryFees(
  entryFeeBps: number,
  exitFeeBps: number,
  vaultCreationFeeUsdc: number,
  minManagementFeeBps: number,
  maxManagementFeeBps: number,
  vaultCreatorFeeRatioBps: number,
  platformFeeRatioBps: number
) {
  try {
    const [factoryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      program.programId
    );

    console.log("🏭 Factory PDA:", factoryPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

    const tx = await program.methods
      .updateFactoryFees(
        entryFeeBps,
        exitFeeBps,
        new anchor.BN(vaultCreationFeeUsdc),
        minManagementFeeBps,
        maxManagementFeeBps,
        vaultCreatorFeeRatioBps,
        platformFeeRatioBps
      )
      .accountsStrict({
        admin: keypair.publicKey,
        factory: factoryPDA,
      })
      .rpc();

    console.log("✅ Factory fees updated! Transaction:", tx);
    await connection.confirmTransaction(tx, "confirmed");
    console.log("🎉 Transaction confirmed!");

  } catch (error) {
    console.error("❌ Error updating factory fees:", error.message);
    throw error;
  }
}

// Helper function to update vault management fees
async function updateVaultManagementFees(factoryPDA: PublicKey, vaultIndex: number, newManagementFees: number) {
  console.log(`💰 Updating Vault #${vaultIndex} Management Fees to ${newManagementFees} bps...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

     // Note: updateVaultManagementFees method doesn't exist in the current program
     // This is a placeholder for future implementation
     throw new Error("updateVaultManagementFees method not implemented in current program version");
  } catch (error) {
    console.error("❌ Error updating vault management fees:", error.message);
    throw error;
  }
}

// Helper function to update vault underlying assets
async function updateVaultUnderlyingAssets(factoryPDA: PublicKey, vaultIndex: number, newUnderlyingAssets: any[]) {
  console.log(`🔄 Updating Vault #${vaultIndex} Underlying Assets...`);
  console.log("📊 New Underlying Assets:", newUnderlyingAssets);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

     // Note: updateVaultUnderlyingAssets method doesn't exist in the current program
     // This is a placeholder for future implementation
     throw new Error("updateVaultUnderlyingAssets method not implemented in current program version");
  } catch (error) {
    console.error("❌ Error updating vault underlying assets:", error.message);
    throw error;
  }
}

// Helper function to distribute accrued fees as vault tokens
async function distributeAccruedFees(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`💰 Distributing Accrued Fees for Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("🪙 Vault Mint PDA:", vaultMintPDA.toBase58());

    // Get or create vault admin's vault token account
    const vaultAdminVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner (vault admin)
    );

    // Get or create fee recipient's vault token account
    const feeRecipientVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner (fee recipient - same as admin for now)
    );

    console.log("💳 Vault Admin Vault Account:", vaultAdminVaultAccount.address.toBase58());
    console.log("💳 Fee Recipient Vault Account:", feeRecipientVaultAccount.address.toBase58());

    // Distribute accrued fees
    const tx = await program.methods
      .distributeAccruedFees(vaultIndex)
      .accountsStrict({
        collector: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultAdminVaultAccount: vaultAdminVaultAccount.address,
        feeRecipientVaultAccount: feeRecipientVaultAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Accrued fees distributed! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    // Check the token balances after distribution
    const adminBalance = await getAccount(connection, vaultAdminVaultAccount.address);
    const feeRecipientBalance = await getAccount(connection, feeRecipientVaultAccount.address);

    console.log("📊 Distribution Results:");
    console.log("  Vault Admin Vault Tokens:", adminBalance.amount.toString());
    console.log("  Fee Recipient Vault Tokens:", feeRecipientBalance.amount.toString());

    return tx;
  } catch (err) {
    console.error("❌ Distribute accrued fees error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Command line argument handling
const args = process.argv.slice(2);
const command = args[0];

// Main execution
(async () => {
  console.log("🚀 Starting Vault MVP Script");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Using hardcoded keypair");

  try {
    switch (command) {  
      case 'create-token':
        console.log("🪙 Creating Stablecoin Token...");
        const { mint, tokenAccount } = await createStablecoinToken();
        console.log("✅ Stablecoin token creation completed!");
        console.log("📋 Mint Address:", mint.toBase58());
        console.log("📋 Token Account:", tokenAccount.toBase58());
        break;

      case 'init':
        console.log("🏭 Initializing Factory...");
        const factoryPDA = await initializeFactory();
        console.log("✅ Factory initialization completed!");
        console.log("📋 Factory PDA:", factoryPDA.toBase58());
        break;

      case 'create':
        console.log("🏦 Creating Vault...");
        const [factoryPDAForCreate] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        const vaultPDA = await createVault(factoryPDAForCreate);
        console.log("✅ Vault creation completed!");
        console.log("📋 Vault PDA:", vaultPDA.toBase58());
        break;

      case 'list':
        console.log("📋 Listing All Vaults...");
        console.log("program.programId", program.programId.toBase58());
        const [factoryPDAForList] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        console.log("factorypdaforlist", factoryPDAForList.toBase58());
        const allVaults = await getAllVaults(factoryPDAForList);
        console.log("✅ Vault listing completed!");
        console.log(`📊 Total Vaults: ${allVaults.length}`);
        allVaults.forEach((vault, index) => {
          console.log(`  ${index + 1}. ${vault.vaultName} (${vault.vaultSymbol}) - ${vault.vaultAddress.toBase58()}`);
        });
        break;

      case 'info':
        console.log("📊 Getting Factory Information...");
        const [factoryPDAForInfo] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getFactoryInfo(factoryPDAForInfo);
        console.log("✅ Factory info retrieved!");
        break;

      case 'deposit-details':
        const detailsVaultIndex = parseInt(args[1]);
        if (isNaN(detailsVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts deposit-details <vault_index>");
          console.error("📝 Example: npx ts-node script.ts deposit-details 4");
          process.exit(1);
        }
        console.log(`📊 Getting deposit details for Vault #${detailsVaultIndex}...`);
        const [factoryPDAForDetails] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getDepositDetails(factoryPDAForDetails, detailsVaultIndex);
        console.log("✅ Deposit details retrieved!");
        break;

      case 'check-mint':
        console.log("🔍 Checking stablecoin mint...");
        try {
          const mintInfo = await getMint(connection, STABLECOIN_MINT);
          console.log("✅ Stablecoin mint exists:", {
            address: STABLECOIN_MINT.toBase58(),
            decimals: mintInfo.decimals,
            supply: mintInfo.supply.toString()
          });
        } catch (error) {
          console.log("❌ Stablecoin mint error:", error.message);
        }
        break;

      case 'update-fees':
        const newEntryFee = parseInt(args[1]) || 50; // 0.5%
        const newExitFee = parseInt(args[2]) || 50; // 0.5%
        const newVaultCreationFee = parseInt(args[3]) || 20000000; // $20
        const newMinManagementFee = parseInt(args[4]) || 100; // 1%
        const newMaxManagementFee = parseInt(args[5]) || 500; // 5%
        const vaultCreatorFeeRatioBps = parseInt(args[6]) || 7000; // 70%
        const platformFeeRatioBps = parseInt(args[7]) || 3000; // 30%

        console.log("💰 Updating factory fees...");
        console.log(`📊 New fees: Entry=${newEntryFee}bps, Exit=${newExitFee}bps, Creation=${newVaultCreationFee}, MinMgmt=${newMinManagementFee}bps, MaxMgmt=${newMaxManagementFee}bps`);

        await updateFactoryFees(
          newEntryFee,
          newExitFee,
          newVaultCreationFee,
          newMinManagementFee,
          newMaxManagementFee,
          vaultCreatorFeeRatioBps,
          platformFeeRatioBps
        );
        console.log("✅ Factory fees updated successfully!");
        break;

      case 'pause':
        {
          const idx = parseInt(args[1]);
          if (isNaN(idx)) {
            console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts pause <vault_index>");
            process.exit(1);
          }
          const [factoryPDAForPause] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            program.programId
          );
          await setVaultPaused(factoryPDAForPause, idx, true);
        }
        break;

      case 'resume':
        {
          const idx = parseInt(args[1]);
          if (isNaN(idx)) {
            console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts resume <vault_index>");
            process.exit(1);
          }
          const [factoryPDAForResume] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            program.programId
          );
          await setVaultPaused(factoryPDAForResume, idx, false);
        }
        break;

      case 'fees':
        const feesVaultIndex = parseInt(args[1]);
        if (isNaN(feesVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts fees <vault_index>");
          console.error("📝 Example: npx ts-node script.ts fees 0");
          process.exit(1);
        }
        console.log(`💰 Getting fees for Vault #${feesVaultIndex}...`);
        const [factoryPDAForFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getVaultFees(factoryPDAForFees, feesVaultIndex);
        console.log("✅ Vault fees retrieved!");
        break;

      case 'update-vault-fees':
        const updateFeesVaultIndex = parseInt(args[1]);
        const newManagementFees = parseInt(args[2]);
        if (isNaN(updateFeesVaultIndex) || isNaN(newManagementFees)) {
          console.error("❌ Please provide valid vault index and management fees. Usage: npx ts-node script.ts update-vault-fees <vault_index> <new_management_fees_bps>");
          console.error("📝 Example: npx ts-node script.ts update-vault-fees 0 150");
          process.exit(1);
        }
        console.log(`💰 Updating Vault #${updateFeesVaultIndex} management fees to ${newManagementFees} bps...`);
        const [factoryPDAForUpdateFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await updateVaultManagementFees(factoryPDAForUpdateFees, updateFeesVaultIndex, newManagementFees);
        console.log("✅ Vault management fees updated!");
        break;

      case 'update-vault-assets':
        const updateAssetsVaultIndex = parseInt(args[1]);
        if (isNaN(updateAssetsVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts update-vault-assets <vault_index>");
          console.error("📝 Example: npx ts-node script.ts update-vault-assets 0");
          process.exit(1);
        }
        
        // Define new underlying assets (example: 50% SOL, 30% USDC, 20% USDT)
        const newUnderlyingAssets = [
          {
            mintAddress: SOL_MINT,
            mintBps: 5000 // 50%
          },
          {
            mintAddress: USDC_MINT,
            mintBps: 3000 // 30%
          },
          {
            mintAddress: STABLECOIN_MINT, // Using our created stablecoin as USDT equivalent
            mintBps: 2000 // 20%
          }
        ];

        console.log(`🔄 Updating Vault #${updateAssetsVaultIndex} underlying assets...`);
        const [factoryPDAForUpdateAssets] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await updateVaultUnderlyingAssets(factoryPDAForUpdateAssets, updateAssetsVaultIndex, newUnderlyingAssets);
        console.log("✅ Vault underlying assets updated!");
        break;

      case 'distribute-fees':
        const distributeFeesVaultIndex = parseInt(args[1]);
        if (isNaN(distributeFeesVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts distribute-fees <vault_index>");
          console.error("📝 Example: npx ts-node script.ts distribute-fees 0");
          process.exit(1);
        }
        console.log(`💰 Distributing accrued fees for Vault #${distributeFeesVaultIndex}...`);
        const [factoryPDAForDistributeFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await distributeAccruedFees(factoryPDAForDistributeFees, distributeFeesVaultIndex);
        console.log("✅ Accrued fees distributed as vault tokens!");
        break;

      default:
        console.log("📖 Available Commands:");
        console.log("  npx ts-node script.ts create-token - Create stablecoin token (100M supply)");
        console.log("  npx ts-node script.ts init     - Initialize factory");
        console.log("  npx ts-node script.ts create   - Create a new vault");
        console.log("  npx ts-node script.ts list     - List all vaults");
        console.log("  npx ts-node script.ts info     - Get factory information");
        console.log("  npx ts-node script.ts vault <index> - Get specific vault info");
        console.log("  npx ts-node script.ts deposit <vault_index> <amount> - Deposit stablecoin into vault");
        console.log("  npx ts-node script.ts redeem <vault_index> <vault_token_amount> - Redeem vault tokens for stablecoin");
        console.log("  npx ts-node script.ts deposit-details <vault_index> - Get deposit details for user and vault");
        console.log("  npx ts-node script.ts fees <vault_index> - Get vault fees (factory + management fees)");
        console.log("  npx ts-node script.ts update-fees [entry] [exit] [creation] [min_mgmt] [max_mgmt] [vault_creator_ratio] [platform_ratio] - Update factory fees");
        console.log("  npx ts-node script.ts update-vault-fees <vault_index> <new_management_fees_bps> - Update vault management fees");
        console.log("  npx ts-node script.ts update-vault-assets <vault_index> - Update vault underlying assets");
        console.log("  npx ts-node script.ts distribute-fees <vault_index> - Distribute accrued fees as vault tokens");
        console.log("  npx ts-node script.ts check-mint - Check stablecoin mint status");
        console.log("  npx ts-node script.ts pause <vault_index>   - Pause a vault");
        console.log("  npx ts-node script.ts resume <vault_index>  - Resume a vault");
        console.log("");
        console.log("📝 Examples:");
        console.log("  npx ts-node script.ts create-token");
        console.log("  npx ts-node script.ts init");
        console.log("  npx ts-node script.ts create");
        console.log("  npx ts-node script.ts list");
        console.log("  npx ts-node script.ts vault 0");
        console.log("  npx ts-node script.ts deposit 0 1000");
        console.log("  npx ts-node script.ts redeem 0 500");
        console.log("  npx ts-node script.ts deposit-details 4");
        console.log("  npx ts-node script.ts fees 0");
        console.log("  npx ts-node script.ts update-fees 50 50 20000000 100 500 8000 2000");
        console.log("  npx ts-node script.ts update-vault-fees 0 150");
        console.log("  npx ts-node script.ts update-vault-assets 0");
        console.log("  npx ts-node script.ts distribute-fees 0");
        console.log("  npx ts-node script.ts check-mint");
        console.log("  npx ts-node script.ts pause 0   - Pause vault 0");
        console.log("  npx ts-node script.ts resume 0  - Resume vault 0");
        break;
    }

  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  }
})();