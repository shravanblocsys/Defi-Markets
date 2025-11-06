import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// Configuration
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

function pdaFactory() { return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; }
function pdaVault(factory: PublicKey, index: number) { return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; }

async function debugVaultAccounts(vaultIndex: number) {
  console.log(`🔍 Debugging vault #${vaultIndex} accounts...`);
  
  const factory = pdaFactory();
  const vault = pdaVault(factory, vaultIndex);
  
  console.log(`Factory: ${factory.toBase58()}`);
  console.log(`Vault: ${vault.toBase58()}`);
  
  try {
    // Get vault info
    const vaultAcc = await program.account.vault.fetch(vault);
    console.log(`\n📊 Vault Info:`);
    console.log(`  Name: ${vaultAcc.vaultName}`);
    console.log(`  Symbol: ${vaultAcc.vaultSymbol}`);
    console.log(`  State: ${vaultAcc.state}`);
    console.log(`  Total Assets: ${vaultAcc.totalAssets.toString()}`);
    console.log(`  Total Supply: ${vaultAcc.totalSupply.toString()}`);
    console.log(`  Underlying Assets: ${vaultAcc.underlyingAssets.length}`);
    
    // Check each underlying asset
    for (let i = 0; i < vaultAcc.underlyingAssets.length; i++) {
      const asset = vaultAcc.underlyingAssets[i];
      const mintAddress = new PublicKey(asset.mintAddress);
      const mintBps = asset.mintBps;
      
      console.log(`\n🪙 Asset ${i + 1}: ${mintAddress.toBase58()}`);
      console.log(`  Allocation: ${mintBps / 100}%`);
      
      // Check vault's token account for this asset
      const vaultAssetAta = await getAssociatedTokenAddress(
        mintAddress, 
        vault, 
        true, 
        TOKEN_PROGRAM_ID, 
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      console.log(`  Vault ATA: ${vaultAssetAta.toBase58()}`);
      
      try {
        const accountInfo = await connection.getAccountInfo(vaultAssetAta);
        if (accountInfo) {
          console.log(`  ✅ Account exists`);
          try {
            const tokenAccount = await getAccount(connection, vaultAssetAta);
            console.log(`  Balance: ${tokenAccount.amount.toString()}`);
            console.log(`  Owner: ${tokenAccount.owner.toBase58()}`);
            console.log(`  Mint: ${tokenAccount.mint.toBase58()}`);
          } catch (error) {
            console.log(`  ⚠️ Account exists but getAccount failed: ${error.message}`);
          }
        } else {
          console.log(`  ❌ Account does not exist`);
        }
      } catch (error) {
        console.log(`  ❌ Error checking account: ${error.message}`);
      }
    }
    
    // Check vault's stablecoin account
    const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const vaultStablecoinAta = await getAssociatedTokenAddress(
      USDC_MINT, 
      vault, 
      true, 
      TOKEN_PROGRAM_ID, 
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`\n💰 Vault USDC Account: ${vaultStablecoinAta.toBase58()}`);
    try {
      const accountInfo = await connection.getAccountInfo(vaultStablecoinAta);
      if (accountInfo) {
        console.log(`  ✅ USDC account exists`);
        try {
          const tokenAccount = await getAccount(connection, vaultStablecoinAta);
          console.log(`  Balance: ${tokenAccount.amount.toString()}`);
        } catch (error) {
          console.log(`  ⚠️ USDC account exists but getAccount failed: ${error.message}`);
        }
      } else {
        console.log(`  ❌ USDC account does not exist`);
      }
    } catch (error) {
      console.log(`  ❌ Error checking USDC account: ${error.message}`);
    }
    
  } catch (error) {
    console.error(`❌ Error fetching vault: ${error.message}`);
  }
}

// Main execution
const [vaultIndexStr] = process.argv.slice(2);
if (!vaultIndexStr) {
  console.log("Usage: npx ts-node debug_vault_accounts.ts <vault_index>");
  console.log("Example: npx ts-node debug_vault_accounts.ts 4");
  process.exit(1);
}

const vaultIndex = parseInt(vaultIndexStr);
if (isNaN(vaultIndex)) {
  console.error("Error: vault_index must be a number");
  process.exit(1);
}

debugVaultAccounts(vaultIndex).catch(console.error);
