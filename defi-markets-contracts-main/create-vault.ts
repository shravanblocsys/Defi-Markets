import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";


// Example token mint addresses (replace with actual token mints)
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC

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
const RPC_URL = "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Create wallet from the keypair
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: "processed"
});
anchor.setProvider(provider);

// Program ID from deployed program
const programId = new PublicKey("B4hqrBAGZrMrXv5phVeNE8FMxXxH2njfjnkocQt7D1n6");

// Create program instance using the actual IDL
const program = new anchor.Program<VaultMvp>(
  idl as anchor.Idl,
  provider
) as anchor.Program<VaultMvp>;

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

    // Define underlying assets (60% SOL, 40% USDC)
    const underlyingAssets = [
      {
        mintAddress: SOL_MINT,
        mintBps: 6000 // 60%
      },
      {
        mintAddress: USDC_MINT,
        mintBps: 4000 // 40%
      }
    ];

    console.log("📋 Underlying Assets:", underlyingAssets);

    // Generate random vault name and symbol
    const vaultName = generateRandomVaultName();
    const vaultSymbol = generateRandomVaultSymbol();

    console.log("🎲 Generated Vault Name:", vaultName);
    console.log("🎲 Generated Vault Symbol:", vaultSymbol);

    // Create vault using snake_case method name
    const tx = await program.methods
      .createVault(
        vaultName,        // vault_name (randomly generated)
        vaultSymbol,      // vault_symbol (randomly generated)
        underlyingAssets,
        100              // management_fees (1%)
      )
      .accountsStrict({
        admin: wallet.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultTokenAccount: vaultTokenAccountPDA,
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

// Main execution
(async () => {
  console.log("🚀 Starting Create Vault Script");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Using hardcoded keypair");

  try {
    // Calculate factory PDA
    const [factoryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      program.programId
    );

    console.log("🏭 Factory PDA:", factoryPDA.toBase58());

    // Check if factory exists
    const factoryInfo = await connection.getAccountInfo(factoryPDA);
    if (!factoryInfo) {
      console.error("❌ Factory not initialized. Please run 'npx ts-node script.ts init' first.");
      process.exit(1);
    }

    console.log("✅ Factory found, proceeding with vault creation...");

    // Create vault
    const vaultPDA = await createVault(factoryPDA);
    
    console.log("🎉 Vault creation completed successfully!");
    console.log("📋 Vault PDA:", vaultPDA.toBase58());

  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  }
})();
