/**
 * Fixed Multi-Swap Deposit Test
 * 
 * This script tests the corrected multi-swap deposit with proper amounts
 * and better error handling.
 * 
 * Usage:
 *   npx ts-node test_deposit_fixed.ts <vault_index> <amount_usdc>
 * 
 * Example:
 *   npx ts-node test_deposit_fixed.ts 6 1.0
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// Configuration
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

// Token addresses
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function pdaFactory() { 
  return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; 
}

function pdaVault(factory: PublicKey, index: number) { 
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; 
}

async function testDepositWithProperAmount(vaultIndex: number, amountUsdc: number) {
  console.log("🚀 Testing Fixed Multi-Swap Deposit");
  console.log(`Vault Index: ${vaultIndex}`);
  console.log(`Amount: ${amountUsdc} USDC`);
  console.log("");

  const factory = pdaFactory();
  const vault = pdaVault(factory, vaultIndex);

  try {
    // Fetch vault info
    const vaultAcc = await program.account.vault.fetch(vault);
    console.log("📊 Vault Information:");
    console.log(`  Name: ${vaultAcc.vaultName}`);
    console.log(`  Symbol: ${vaultAcc.vaultSymbol}`);
    console.log(`  State: ${vaultAcc.state}`);
    console.log(`  Total Assets: ${vaultAcc.totalAssets.toString()}`);
    console.log(`  Total Supply: ${vaultAcc.totalSupply.toString()}`);
    console.log("");

    // Display underlying assets and allocations
    console.log("🎯 Underlying Assets & Allocations:");
    const amountRaw = BigInt(Math.floor(amountUsdc * 1e6));
    
    vaultAcc.underlyingAssets.forEach((asset: any, index: number) => {
      const mintAddress = new PublicKey(asset.mintAddress);
      const allocation = asset.mintBps / 100; // Convert bps to percentage
      const assetAmount = (amountRaw * BigInt(asset.mintBps)) / BigInt(10000);
      
      console.log(`  Asset ${index + 1}:`);
      console.log(`    Mint: ${mintAddress.toBase58()}`);
      console.log(`    Allocation: ${allocation}% (${asset.mintBps} bps)`);
      console.log(`    Expected Amount: ${Number(assetAmount) / 1e6} USDC worth`);
      
      // Identify token type
      if (mintAddress.equals(USDC_MINT)) {
        console.log(`    Type: USDC (Direct Transfer)`);
      } else if (mintAddress.equals(USDT_MINT)) {
        console.log(`    Type: USDT (Jupiter Swap Required)`);
      } else if (mintAddress.equals(WSOL_MINT)) {
        console.log(`    Type: SOL (Jupiter Swap Required)`);
      } else {
        console.log(`    Type: Other Token (Jupiter Swap Required)`);
      }
      console.log("");
    });

    // Check minimum amount requirements
    const minAmount = BigInt(1000000); // 1 USDC
    
    if (amountRaw < minAmount) {
      console.log("❌ ERROR: Amount is too small for Jupiter swaps");
      console.log(`   Current: ${amountUsdc} USDC`);
      console.log(`   Required: At least 1.0 USDC`);
      console.log(`   Jupiter requires minimum amounts for reliable swaps`);
      console.log("");
      console.log("💡 Recommendation:");
      console.log("   Use at least 1.0 USDC for testing");
      console.log("   Example: npx ts-node test_deposit_fixed.ts 6 1.0");
      return;
    }

    // Calculate expected swaps
    const assetsNeedingSwaps = vaultAcc.underlyingAssets.filter((asset: any) => 
      !new PublicKey(asset.mintAddress).equals(USDC_MINT)
    );

    console.log("🔄 Expected Jupiter Swaps:");
    if (assetsNeedingSwaps.length === 0) {
      console.log("  ✅ No swaps needed - all assets are USDC");
    } else {
      console.log(`  📈 ${assetsNeedingSwaps.length} Jupiter swaps will be executed:`);
      assetsNeedingSwaps.forEach((asset: any, index: number) => {
        const mintAddress = new PublicKey(asset.mintAddress);
        const allocation = asset.mintBps / 100;
        const swapAmount = (amountRaw * BigInt(asset.mintBps)) / BigInt(10000);
        
        console.log(`    Swap ${index + 1}: ${Number(swapAmount) / 1e6} USDC → ${mintAddress.toBase58()}`);
        console.log(`      Allocation: ${allocation}%`);
      });
    }
    console.log("");

    // Show account structure
    console.log("📋 Account Structure for CPI:");
    console.log(`  Total Assets: ${vaultAcc.underlyingAssets.length}`);
    console.log(`  Assets Needing Swaps: ${assetsNeedingSwaps.length}`);
    console.log(`  Expected Account Blocks: ${assetsNeedingSwaps.length} blocks of 24 accounts each`);
    console.log(`  Total Remaining Accounts: ${assetsNeedingSwaps.length * 24}`);
    console.log("");

    // Check user balance
    const userUsdcAta = await anchor.utils.token.associatedAddress({
      mint: USDC_MINT,
      owner: wallet.publicKey,
    });
    
    try {
      const userBalance = await connection.getTokenAccountBalance(userUsdcAta);
      const balanceUsdc = parseFloat(userBalance.value.amount) / 1e6;
      
      console.log("💰 User Balance Check:");
      console.log(`  USDC Balance: ${balanceUsdc} USDC`);
      
      if (balanceUsdc < amountUsdc) {
        console.log("❌ ERROR: Insufficient USDC balance");
        console.log(`   Required: ${amountUsdc} USDC`);
        console.log(`   Available: ${balanceUsdc} USDC`);
        console.log(`   Shortfall: ${amountUsdc - balanceUsdc} USDC`);
        return;
      } else {
        console.log("✅ Sufficient USDC balance");
      }
    } catch (error) {
      console.log("❌ ERROR: Could not check USDC balance");
      console.log(`   User may not have a USDC token account`);
      console.log(`   Please ensure you have USDC in your wallet`);
      return;
    }

    console.log("✅ All checks passed!");
    console.log("");
    console.log("🚀 Ready to execute deposit:");
    console.log(`   npx ts-node deposit_jup.ts deposit_jup ${vaultIndex} ${amountUsdc}`);
    console.log("");
    console.log("📝 Expected Results:");
    console.log("   1. User USDC will be transferred to vault");
    console.log("   2. Jupiter swaps will execute for non-USDC assets");
    console.log("   3. Vault tokens will be minted to user");
    console.log("   4. Vault will hold diversified assets");

  } catch (error) {
    console.error("❌ Error analyzing vault:", error.message);
    
    if (error.message.includes("Account does not exist")) {
      console.log("");
      console.log("💡 The vault doesn't exist yet. You need to:");
      console.log("1. Create the vault first using create_vault script");
      console.log("2. Configure underlying assets with proper allocations");
      console.log("3. Then run this deposit test");
    }
  }
}

// CLI interface
const [,, vaultIndexStr, amountStr] = process.argv;

if (!vaultIndexStr || !amountStr) {
  console.log("❌ Missing required arguments");
  console.log("");
  console.log("Usage:");
  console.log("  npx ts-node test_deposit_fixed.ts <vault_index> <amount_usdc>");
  console.log("");
  console.log("Example:");
  console.log("  # Test deposit of 1 USDC into vault 6");
  console.log("  npx ts-node test_deposit_fixed.ts 6 1.0");
  console.log("");
  console.log("  # Test deposit of 0.5 USDC into vault 0");
  console.log("  npx ts-node test_deposit_fixed.ts 0 0.5");
  console.log("");
  console.log("⚠️  Important: Use at least 1.0 USDC for reliable Jupiter swaps");
  process.exit(1);
}

const vaultIndex = parseInt(vaultIndexStr);
const amount = parseFloat(amountStr);

if (isNaN(vaultIndex) || isNaN(amount)) {
  console.log("❌ Invalid arguments");
  console.log("Vault index must be a number");
  console.log("Amount must be a valid number");
  process.exit(1);
}

(async () => {
  try {
    await testDepositWithProperAmount(vaultIndex, amount);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
})();
