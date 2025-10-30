import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, ConfirmOptions } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "./target/idl/vault_mvp.json";
import { VaultMvp } from "./target/types/vault_mvp";

// ---------- CLI Args (no envs) ----------
// Usage: npx ts-node read_accrued_fees.ts <vaultIndex> [commit=true|false] [rpcUrl]
const argv = process.argv.slice(2);
const VAULT_INDEX = Number(argv[0] ?? 13); // default 13
const COMMIT_UPDATE = String(argv[1] ?? "false").toLowerCase() === "true"; // default false
const RPC_URL = String(argv[2] ?? "https://api.mainnet-beta.solana.com");

// Jupiter Lite Price API base
const JUP_PRICE_API = "https://lite-api.jup.ag/price/v3?ids=";

// ---------- Anchor Setup ----------
const connection = new Connection(RPC_URL, "confirmed");
const confirmOpts: ConfirmOptions = { preflightCommitment: "processed" };

// Use a real keypair for simulation (even though we're not signing)
const adminKeypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(require('fs').readFileSync('./keypairs/admin-keypair.json', 'utf8')))
);
const wallet = new anchor.Wallet(adminKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, confirmOpts);
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

// Debug: Log IDL and program details
console.log("\n🔍 Debug Information:");
console.log("Program ID:", program.programId.toBase58());
console.log("IDL Address:", idl.address || "Not available");
console.log("Available methods:", Object.keys(program.methods));
console.log("IDL instructions:", idl.instructions?.map((ix: any) => ix.name) || "No instructions found");

// ---------- PDA Helpers ----------
function pdaFactory() {
  return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0];
}
function pdaVault(factory: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)],
    program.programId
  )[0];
}
function pdaVaultStablecoin(vault: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_stablecoin_account"), vault.toBuffer()], program.programId)[0];
}

// ---------- Types mirrored from IDL ----------
type AssetPrice = {
  mintAddress: PublicKey; // matches IDL camelCase for Rust mint_address
  priceUsd: anchor.BN;    // u64 with 6 decimals
};

async function fetchJupiterPrices(mints: PublicKey[]): Promise<Record<string, number>> {
  // Prepare comma-separated list of base58 mint addresses
  const idsParam = mints.map(m => m.toBase58()).join(",");
  const url = `${JUP_PRICE_API}${idsParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch prices from Jupiter: ${res.status} ${res.statusText}`);
  const json = await res.json() as Record<string, { usdPrice: number }>;
  // Map from base58 mint -> usdPrice (number)
  const out: Record<string, number> = {};
  for (const k of Object.keys(json)) {
    out[k] = json[k].usdPrice;
  }
  return out;
}

async function main() {
  console.log(`\n🔍 Reading Vault ${VAULT_INDEX} with live prices...`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Commit update: ${COMMIT_UPDATE}`);

  const factory = pdaFactory();
  const vault = pdaVault(factory, VAULT_INDEX);
  const vaultStable = pdaVaultStablecoin(vault);

  // Check if required accounts exist
  console.log("\n🔍 Checking required accounts:");
  console.log(`  Factory: ${factory.toBase58()}`);
  console.log(`  Vault: ${vault.toBase58()}`);
  console.log(`  Vault Stablecoin: ${vaultStable.toBase58()}`);

  // Check vault stablecoin account
  try {
    await getAccount(connection, vaultStable);
    console.log(`  ✅ Vault Stablecoin account exists`);
  } catch (e) {
    console.log(`  ❌ Vault Stablecoin account not found`);
    throw new Error("Vault stablecoin account not found");
  }

  // Fetch vault state
  const vaultAccount: any = await program.account.vault.fetch(vault);
  const underlyingAssets: Array<{ mintAddress: PublicKey; mintBps: number }> = vaultAccount.underlyingAssets;

  console.log("\n🏦 Underlying Assets:");
  underlyingAssets.forEach((a, i) =>
    console.log(`  [${i}] mint=${a.mintAddress.toBase58()} alloc=${(a.mintBps/100).toFixed(2)}%`)
  );

  // Derive vault-owned ATAs for each underlying asset (remaining accounts)
  // Must pass ALL accounts in exact order, even if some don't exist
  const vaultAssetAtas: PublicKey[] = [];
  const existingAssetIndices: number[] = [];
  
  for (let i = 0; i < underlyingAssets.length; i++) {
    const asset = underlyingAssets[i];
    const ata = await getAssociatedTokenAddress(
      asset.mintAddress,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Always add the account (instruction expects exact count match)
    vaultAssetAtas.push(ata);
    
    // Check if account exists for logging
    try {
      await getAccount(connection, ata);
      existingAssetIndices.push(i);
      console.log(`  ✅ Asset[${i}] ${asset.mintAddress.toBase58()}: account exists`);
    } catch (e) {
      console.log(`  ❌ Asset[${i}] ${asset.mintAddress.toBase58()}: account not found (will fail in instruction)`);
    }
  }

  // Fetch live prices from Jupiter for ALL assets
  const priceMap = await fetchJupiterPrices(underlyingAssets.map(a => a.mintAddress));

  // Build AssetPrice[] with 6-decimal fixed u64 (for ALL assets)
  const assetPrices: AssetPrice[] = underlyingAssets.map(a => {
    const key = a.mintAddress.toBase58();
    const p = priceMap[key];
    if (p === undefined) {
      throw new Error(`Missing price for ${key} in Jupiter response`);
    }
    const priceScaled = Math.round(p * 1_000_000); // 6 decimals
    return { mintAddress: a.mintAddress, priceUsd: new anchor.BN(priceScaled) };
  });
  
  console.log("\n💰 Asset prices being passed:");
  assetPrices.forEach((price, i) => {
    console.log(`  [${i}] ${price.mintAddress.toBase58()}: $${(Number(price.priceUsd) / 1_000_000).toFixed(6)}`);
  });

  // Prepare remaining accounts array (readonly) - only existing accounts
  const remaining = vaultAssetAtas.map(pubkey => ({ pubkey, isSigner: false, isWritable: false }));
  
  console.log("\n📋 Remaining accounts being passed:");
  remaining.forEach((acc, i) => {
    console.log(`  [${i}] ${acc.pubkey.toBase58()} (signer: ${acc.isSigner}, writable: ${acc.isWritable})`);
  });

  // Try to call the instruction directly to see the actual error
  console.log("\n📈 Calling get_accrued_management_fees...");
  try {
    if (COMMIT_UPDATE) {
      // Send actual transaction to get return data
      console.log("   Sending transaction to get return data...");
      const sig = await program.methods
        .getAccruedManagementFees(VAULT_INDEX, assetPrices as any)
        .accounts({ factory, vault, vault_stablecoin_account: vaultStable })
        .remainingAccounts(remaining)
        .rpc();
      
      console.log("   ✅ Transaction sent:", sig);
      
      // Get the transaction to see return data
      const tx = await connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      console.log("   ✅ Transaction returned:", tx);
    } else {
      // Just simulate for read-only mode
      console.log("   Simulating instruction...");
      const sim = await program.methods
        .getAccruedManagementFees(VAULT_INDEX, assetPrices as any)
        .accounts({ factory, vault, vault_stablecoin_account: vaultStable })
        .remainingAccounts(remaining)
        .simulate();
      
      console.log("\nℹ️ Simulation completed. For return data, use COMMIT=true");
    }
  } catch (error) {
    console.log("\n❌ Error calling instruction:");
    console.log("Error:", error.message);
    if (error.simulationResponse) {
      console.log("Simulation Response:", JSON.stringify(error.simulationResponse, null, 2));
    }
    throw error;
  }

  // Also print balances snapshot for transparency
  console.log("\n💰 Snapshot of vault balances:");
  try {
    const stable = await getAccount(connection, vaultStable);
    console.log(`  Stablecoin: ${stable.amount.toString()}`);
  } catch {
    console.log("  Stablecoin: account not found");
  }
  for (let i = 0; i < vaultAssetAtas.length; i++) {
    const ata = vaultAssetAtas[i];
    try {
      const a = await getAccount(connection, ata);
      console.log(`  Asset[${i}] ${ata.toBase58()}: ${a.amount.toString()}`);
    } catch {
      console.log(`  Asset[${i}] ${ata.toBase58()}: account not found`);
    }
  }


  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


