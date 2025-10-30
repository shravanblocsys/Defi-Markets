import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";
import fetch from "node-fetch";

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, new anchor.AnchorProvider(connection, new anchor.Wallet(anchor.web3.Keypair.generate()), { preflightCommitment: "processed" })) as anchor.Program<VaultMvp>;

function pdaFactory() { return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; }
function pdaVault(factory: PublicKey, index: number) { return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; }
function pdaVaultStablecoin(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_stablecoin_account"), vault.toBuffer()], program.programId)[0]; }

// Jupiter Price API
const JUP_PRICE_API = "https://lite-api.jup.ag/price/v3?ids=";

// Cache for token decimals to avoid repeated RPC calls
const tokenDecimalsCache: Map<string, number> = new Map();

async function getTokenDecimals(mintAddress: PublicKey): Promise<number> {
  const key = mintAddress.toBase58();
  if (tokenDecimalsCache.has(key)) {
    return tokenDecimalsCache.get(key)!;
  }
  
  try {
    const mintInfo = await getMint(connection, mintAddress);
    tokenDecimalsCache.set(key, mintInfo.decimals);
    return mintInfo.decimals;
  } catch (error) {
    console.warn(`Warning: Could not fetch decimals for ${key}, defaulting to 6`);
    tokenDecimalsCache.set(key, 6);
    return 6;
  }
}

async function fetchJupiterPrices(mintAddresses: PublicKey[]): Promise<Record<string, number>> {
  if (mintAddresses.length === 0) return {};
  
  const ids = mintAddresses.map(m => m.toBase58()).join(",");
  const url = `${JUP_PRICE_API}${ids}`;
  console.log(`🌐 Fetching live prices from Jupiter...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch prices: ${response.statusText}`);
  }
  
  const data = await response.json() as Record<string, { usdPrice: number }>;
  const priceMap: Record<string, number> = {};
  
  for (const [mint, info] of Object.entries(data)) {
    priceMap[mint] = info.usdPrice;
  }
  
  return priceMap;
}

async function readVaultAllocation(vaultIndex: number) {
  console.log(`\n🔍 Reading Vault ${vaultIndex} Allocation:`);
  
  const factory = pdaFactory();
  const vault = pdaVault(factory, vaultIndex);
  const vaultStable = pdaVaultStablecoin(vault);
  
  try {
    // Get vault account
    const vaultAccount = await program.account.vault.fetch(vault) as any;
    console.log(`\n📊 Vault State:`);
    console.log(`  Total Supply: ${vaultAccount.totalAssets.toString()} ($${(Number(vaultAccount.totalAssets) / 1_000_000).toFixed(6)} USD)`);
    console.log(`  Total Supply: ${vaultAccount.totalSupply.toString()} (${(Number(vaultAccount.totalSupply) / 1e6).toFixed(6)} tokens)`);
    console.log(`  Management Fees: ${vaultAccount.managementFees} bps`);
    console.log(`  Admin: ${vaultAccount.admin.toBase58()}`);
    
    // Get underlying assets
    console.log(`\n🏦 Underlying Assets:`);
    for (let i = 0; i < vaultAccount.underlyingAssets.length; i++) {
      const asset = vaultAccount.underlyingAssets[i];
      if (asset.mintAddress.toBase58() !== "11111111111111111111111111111111") {
        console.log(`  Asset ${i}:`);
        console.log(`    Mint: ${asset.mintAddress.toBase58()}`);
        console.log(`    Allocation: ${asset.mintBps} bps (${(asset.mintBps / 100).toFixed(2)}%)`);
        
        // Get token account balance
        try {
          const tokenAccount = await getAssociatedTokenAddress(asset.mintAddress, vault, true);
          const balance = await getAccount(connection, tokenAccount);
          const decimals = await getTokenDecimals(asset.mintAddress);
          console.log(`    Balance: ${balance.amount.toString()} (${(Number(balance.amount) / Math.pow(10, decimals)).toFixed(6)} tokens)`);
        } catch (e) {
          console.log(`    Balance: Account not found or error`);
        }
      }
    }
    
    // Get vault stablecoin balance
    console.log(`\n💰 Vault Stablecoin Balance:`);
    try {
      const stableBalance = await getAccount(connection, vaultStable);
      const stablecoinMint = stableBalance.mint;
      const stablecoinDecimals = await getTokenDecimals(stablecoinMint);
      console.log(`  ${stablecoinMint.toBase58()}: ${stableBalance.amount.toString()} (${(Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals)).toFixed(6)} tokens)`);
    } catch (e) {
      console.log(`  Stablecoin Balance: Account not found or error`);
    }
    
    // Calculate NAV and GAV
    console.log(`\n📈 Vault Valuation (NAV & GAV):`);
    
    const totalAssets = Number(vaultAccount.totalAssets);
    const totalSupply = Number(vaultAccount.totalSupply);
    const accruedManagementFees = Number(vaultAccount.accruedManagementFeesUsdc || 0);
    
    // NAV (Net Asset Value) - after management fees
    const nav = totalAssets;
    const navPerToken = totalSupply > 0 ? (nav * 1e9) / totalSupply : 0;
    
    // GAV (Gross Asset Value) - before management fees (includes accrued fees)
    const gav = totalAssets + accruedManagementFees;
    const gavPerToken = totalSupply > 0 ? (gav * 1e9) / totalSupply : 0;
    
    console.log(`  Net Asset Value (NAV): ${nav.toFixed(0)} lamports ($${(nav / 1_000_000).toFixed(6)} USD)`);
    console.log(`  NAV per Token: ${navPerToken.toFixed(0)} lamports ($${(navPerToken / 1_000_000).toFixed(6)} USD)`);
    console.log(`  Gross Asset Value (GAV): ${gav.toFixed(0)} lamports ($${(gav / 1_000_000).toFixed(6)} USD)`);
    console.log(`  GAV per Token: ${gavPerToken.toFixed(0)} lamports ($${(gavPerToken / 1_000_000).toFixed(6)} USD)`);
    console.log(`  Accrued Management Fees: ${accruedManagementFees.toFixed(0)} lamports ($${(accruedManagementFees / 1_000_000).toFixed(6)} USD)`);
    
    // Calculate user's share value
    console.log(`\n👤 User Share Calculation:`);
    console.log(`  If user has 1 vault token:`);
    console.log(`  NAV Value: ${navPerToken.toFixed(0)} lamports ($${(navPerToken / 1_000_000).toFixed(6)} USD)`);
    console.log(`  GAV Value: ${gavPerToken.toFixed(0)} lamports ($${(gavPerToken / 1_000_000).toFixed(6)} USD)`);
    
    // ===== OFF-CHAIN ACCRUED FEES CALCULATION =====
    console.log(`\n📊 Off-Chain Accrued Fees Calculation (using live prices):`);
    
    try {
      // Fetch live prices from Jupiter
      const underlyingAssets = vaultAccount.underlyingAssets;
      const priceMap = await fetchJupiterPrices(underlyingAssets.map((a: any) => a.mintAddress));
      
      console.log(`\n💰 Live Prices from Jupiter:`);
      for (const [mint, price] of Object.entries(priceMap)) {
        console.log(`  ${mint}: $${price.toFixed(6)}`);
      }
      
      // Calculate GAV using live prices (same logic as contract)
      let liveGav = 0;
      
      // Add stablecoin balance (already in lamports, 1:1 with USD for stablecoins)
      try {
        const stableBalance = await getAccount(connection, vaultStable);
        liveGav += Number(stableBalance.amount);
      console.log(`\n💵 Stablecoin Balance: ${stableBalance.amount} lamports`);
      console.log(`  Stablecoin Mint: ${stableBalance.mint.toBase58()}`);
      
      // Check if stablecoin mint is in underlying assets
      const stablecoinMint = stableBalance.mint.toBase58();
      const isStablecoinInUnderlying = underlyingAssets.some((asset: any) => 
        asset.mintAddress.toBase58() === stablecoinMint
      );
      console.log(`  Is stablecoin in underlying assets: ${isStablecoinInUnderlying}`);
      } catch (e) {
        console.log(`\n💵 Stablecoin Balance: 0 lamports (account not found)`);
      }
      
      // Add underlying asset values using live prices
      console.log(`\n🏦 Underlying Asset Values (Live Prices):`);
      for (let i = 0; i < underlyingAssets.length; i++) {
        const asset = underlyingAssets[i];
        const mintAddress = asset.mintAddress.toBase58();
        const priceUsd = priceMap[mintAddress];
        
        if (!priceUsd) {
          console.log(`  Asset[${i}] ${mintAddress}: No price available`);
          continue;
        }
        
        try {
          // Get token account balance
          const tokenAccount = await getAssociatedTokenAddress(
            asset.mintAddress,
            vault,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          
          const balance = await getAccount(connection, tokenAccount);
          const tokenDecimals = await getTokenDecimals(asset.mintAddress);
          
          // Convert balance to USD value (same formula as contract)
          // Contract expects price in 6-decimal format: (balance * price_scaled) / 1_000_000
          const balanceNum = Number(balance.amount);
          const priceScaled = Math.round(priceUsd * 1_000_000); // Convert to 6-decimal format
          const valueUsd = Math.floor((balanceNum * priceScaled) / 1_000_000);
          
          liveGav += valueUsd;
          
          console.log(`  Asset[${i}] ${mintAddress}:`);
          console.log(`    Balance: ${balance.amount} (${(Number(balance.amount) / Math.pow(10, tokenDecimals)).toFixed(6)} tokens)`);
          console.log(`    Price: $${priceUsd.toFixed(6)}`);
          console.log(`    Calculation: (${balanceNum} * ${priceScaled}) / 1_000_000 = ${valueUsd}`);
          console.log(`    Value: $${(valueUsd / 1_000_000).toFixed(6)} (${valueUsd} lamports)`);
          
        } catch (e) {
          console.log(`  Asset[${i}] ${mintAddress}: Account not found or error`);
        }
      }
      
      // Calculate newly accrued fees (same formula as contract)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const elapsedSeconds = Math.max(0, currentTimestamp - Number(vaultAccount.lastFeeAccrualTs));
      const managementFeeBps = vaultAccount.managementFees;
      const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
      
      const newlyAccruedFees = (liveGav * managementFeeBps * elapsedSeconds) / (10_000 * SECONDS_PER_YEAR);
      const previouslyAccruedFees = Number(vaultAccount.accruedManagementFeesUsdc || 0);
      const totalAccruedFees = previouslyAccruedFees + newlyAccruedFees;
      
      // Calculate NAV
      const liveNav = liveGav - totalAccruedFees;
      
      console.log(`\n📈 Live Fee Calculation Results:`);
      console.log(`  Current Timestamp: ${currentTimestamp}`);
      console.log(`  Last Fee Accrual: ${Number(vaultAccount.lastFeeAccrualTs)}`);
      console.log(`  Elapsed Seconds: ${elapsedSeconds}`);
      console.log(`  Management Fee: ${managementFeeBps} bps (${(managementFeeBps/100).toFixed(2)}%)`);
      console.log(`  Live GAV: ${Math.floor(liveGav)} lamports ($${(liveGav / 1_000_000).toFixed(6)})`);
      console.log(`  Previously Accrued Fees: ${previouslyAccruedFees} lamports ($${(previouslyAccruedFees / 1_000_000).toFixed(6)})`);
      console.log(`  Newly Accrued Fees: ${Math.floor(newlyAccruedFees)} lamports ($${(newlyAccruedFees / 1_000_000).toFixed(6)})`);
      console.log(`  Total Accrued Fees: ${Math.floor(totalAccruedFees)} lamports ($${(totalAccruedFees / 1_000_000).toFixed(6)})`);
      console.log(`  Live NAV: ${Math.floor(liveNav)} lamports ($${(liveNav / 1_000_000).toFixed(6)})`);
      
      // Calculate Total Assets Under Management (AUM) in USD
      console.log(`\n💼 Total Assets Under Management (AUM):`);
      console.log(`  AUM (Live GAV): $${(liveGav / 1_000_000).toFixed(2)} USD`);
      console.log(`  AUM (On-Chain GAV): $${(gav / 1_000_000).toFixed(2)} USD`);
      
      // Show comparison with on-chain values
      console.log(`\n🔄 Comparison with On-Chain Values:`);
      console.log(`  On-Chain GAV: ${gav.toFixed(0)} lamports`);
      console.log(`  Live GAV: ${Math.floor(liveGav)} lamports`);
      console.log(`  Difference: ${Math.floor(liveGav) - gav} lamports`);
      
      console.log(`  On-Chain NAV: ${nav.toFixed(0)} lamports`);
      console.log(`  Live NAV: ${Math.floor(liveNav)} lamports`);
      console.log(`  Difference: ${Math.floor(liveNav) - nav} lamports`);
      
    } catch (e) {
      console.log(`\n❌ Error calculating live fees: ${e.message}`);
    }
    
  } catch (e) {
    console.error("Error reading vault:", e);
  }
}


const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: npx ts-node read_vault.ts <vault_index1> [vault_index2] [vault_index3] ...");
  console.log("Example: npx ts-node read_vault.ts 15");
  console.log("Example: npx ts-node read_vault.ts 15 16 17");
  process.exit(1);
}

// Parse vault indexes from command line arguments
const vaultIndexes = args.map(arg => {
  const index = parseInt(arg);
  if (isNaN(index)) {
    console.error(`Error: "${arg}" is not a valid vault index`);
    process.exit(1);
  }
  return index;
});

// Read all specified vaults
async function readAllVaults() {
  console.log(`\n🚀 Reading ${vaultIndexes.length} vault(s): ${vaultIndexes.join(', ')}`);
  
  for (let i = 0; i < vaultIndexes.length; i++) {
    const vaultIndex = vaultIndexes[i];
    
    if (i > 0) {
      console.log(`\n${'='.repeat(80)}`);
    }
    
    try {
      await readVaultAllocation(vaultIndex);
    } catch (error) {
      console.error(`\n❌ Error reading vault ${vaultIndex}:`, error.message);
    }
  }
  
  console.log(`\n✅ Completed reading ${vaultIndexes.length} vault(s)`);
}

readAllVaults();
