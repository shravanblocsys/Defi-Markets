import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAccount, 
  getMint, 
  getAssociatedTokenAddress, 
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";
import { readFileSync } from 'fs';
import { join } from 'path';

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Jupiter Program ID (placeholder - not used for simple deposits)
const JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

const PRIVATE_KEY = readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8');
const STABLECOIN_MINT = new PublicKey("E1QTr64giwB8pbPSx2Cj64fNi5sUriEAViAu1F6kQD4m");
const PROGRAM_ID = new PublicKey("CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs");

// Setup
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(PRIVATE_KEY)));
const RPC_URL = "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: "processed"
});
anchor.setProvider(provider);

const program = new anchor.Program<VaultMvp>(
  idl as anchor.Idl,
  provider
) as anchor.Program<VaultMvp>;

// Helper functions
function pdaFactory() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("factory_v2")],
    program.programId
  )[0];
}

function pdaVault(factory: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, 'le', 4)],
    program.programId
  )[0];
}

function pdaVaultMint(vault: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_mint"), vault.toBuffer()],
    program.programId
  )[0];
}

function pdaVaultStablecoin(vault: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
    program.programId
  )[0];
}

function pdaMetadata(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

// Fetch token metadata from Metaplex
async function fetchTokenMetadata(mint: PublicKey) {
  try {
    const metadataPDA = pdaMetadata(mint);
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    
    if (!metadataAccount) {
      return null;
    }

    // Parse metadata account structure
    // Metaplex Token Metadata v1.1.0+ structure:
    // - Key (1 byte) - enum variant (4 = MetadataV1)
    // - Update Authority (32 bytes)
    // - Mint (32 bytes)
    // - Data struct:
    //   - Name (String: 4-byte length + data)
    //   - Symbol (String: 4-byte length + data)
    //   - URI (String: 4-byte length + data)
    //   - Seller Fee Basis Points (u16 = 2 bytes)
    //   - Creators (Option)
    //   - etc.
    
    const data = metadataAccount.data;
    
    if (data.length < 70) {
      // Account too small to contain valid metadata
      return null;
    }
    
    let offset = 0;
    
    // Read key (1 byte) - can be 4 (MetadataV1) or other values for different versions
    const key = data.readUInt8(offset);
    offset += 1;
    
    // Skip update authority (32 bytes)
    offset += 32;
    
    // Skip mint (32 bytes)
    offset += 32;
    
    // Now we're at the Data struct
    // Read name string
    if (offset + 4 > data.length) return null;
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    
    if (offset + nameLength > data.length) return null;
    const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
    offset += nameLength;
    
    // Read symbol string
    if (offset + 4 > data.length) return null;
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    
    if (offset + symbolLength > data.length) return null;
    const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
    offset += symbolLength;
    
    // Read URI string
    if (offset + 4 > data.length) return null;
    const uriLength = data.readUInt32LE(offset);
    offset += 4;
    
    if (offset + uriLength > data.length) return null;
    const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '');
    
    return { name, symbol, uri };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return null;
  }
}

async function depositAndCheckMetadata(vaultIndex: number, amount: number) {
  console.log("🚀 Deposit Script with Metadata Verification");
  console.log("=" .repeat(60));
  console.log(`📊 Vault Index: ${vaultIndex}`);
  console.log(`💰 Deposit Amount: ${amount} USDC (${amount * 1e6} raw units)`);
  console.log("");

  try {
    // Calculate PDAs
    const factory = pdaFactory();
    const vault = pdaVault(factory, vaultIndex);
    const vaultMint = pdaVaultMint(vault);
    const vaultStablecoinAccount = pdaVaultStablecoin(vault);

    console.log("🔑 PDAs:");
    console.log(`  Factory: ${factory.toBase58()}`);
    console.log(`  Vault: ${vault.toBase58()}`);
    console.log(`  Vault Mint: ${vaultMint.toBase58()}`);
    console.log(`  Vault Stablecoin Account: ${vaultStablecoinAccount.toBase58()}`);
    console.log("");

    // Fetch vault info
    const vaultAccount = await program.account.vault.fetch(vault);
    console.log("📋 Vault Information:");
    console.log(`  Name: ${vaultAccount.vaultName}`);
    console.log(`  Symbol: ${vaultAccount.vaultSymbol}`);
    console.log(`  State: ${vaultAccount.state}`);
    console.log(`  Total Assets: ${vaultAccount.totalAssets.toString()}`);
    console.log(`  Total Supply: ${vaultAccount.totalSupply.toString()}`);
    console.log("");

    // Check metadata BEFORE deposit
    console.log("🔍 Checking Token Metadata (BEFORE deposit)...");
    const metadataBefore = await fetchTokenMetadata(vaultMint);
    if (metadataBefore) {
      console.log("✅ Metadata Found:");
      console.log(`  Name: ${metadataBefore.name}`);
      console.log(`  Symbol: ${metadataBefore.symbol}`);
      console.log(`  URI: ${metadataBefore.uri || "(empty)"}`);
    } else {
      console.log("❌ No metadata found - token will show as 'Unknown Token'");
    }
    console.log("");

    // Get or create user's stablecoin account
    const userStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      STABLECOIN_MINT,
      keypair.publicKey
    );
    console.log(`💳 User Stablecoin Account: ${userStablecoinAccount.address.toBase58()}`);

    // Check user's stablecoin balance
    const userStablecoinBalance = await getAccount(connection, userStablecoinAccount.address);
    const requiredAmount = BigInt(Math.floor(amount * 1e6));
    console.log(`💰 User Balance: ${userStablecoinBalance.amount.toString()} (${Number(userStablecoinBalance.amount) / 1e6} USDC)`);
    
    if (userStablecoinBalance.amount < requiredAmount) {
      throw new Error(`Insufficient balance. Required: ${amount} USDC, Available: ${Number(userStablecoinBalance.amount) / 1e6} USDC`);
    }
    console.log("");

    // Get or create user's vault token account
    const userVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      vaultMint,
      keypair.publicKey
    );
    console.log(`💳 User Vault Token Account: ${userVaultAccount.address.toBase58()}`);

    // Get balance before deposit
    let userVaultBalanceBefore = BigInt(0);
    try {
      const account = await getAccount(connection, userVaultAccount.address);
      userVaultBalanceBefore = account.amount;
    } catch {
      // Account doesn't exist yet, balance is 0
    }
    console.log(`📊 Vault Token Balance (Before): ${userVaultBalanceBefore.toString()}`);
    console.log("");

    // Get factory account for fee recipient
    const factoryAccount = await program.account.factory.fetch(factory);
    const feeRecipientStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      STABLECOIN_MINT,
      factoryAccount.feeRecipient
    );

    const vaultAdminStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      STABLECOIN_MINT,
      vaultAccount.admin
    );

    // Perform deposit
    console.log("💸 Performing Deposit...");
    const depositAmount = new anchor.BN(requiredAmount.toString());
    const totalAssets = vaultAccount.totalAssets.toNumber();
    const totalSupply = vaultAccount.totalSupply.toNumber();
    const sharePrice = totalAssets > 0 && totalSupply > 0
      ? Math.floor((totalAssets * 1e6) / totalSupply)
      : 1_000_000; // 1:1 if no assets yet

    const tx = await program.methods
      .deposit(vaultIndex, depositAmount, new anchor.BN(sharePrice))
      .accountsStrict({
        user: wallet.publicKey,
        factory: factory,
        vault: vault,
        vaultMint: vaultMint,
        userStablecoinAccount: userStablecoinAccount.address,
        stablecoinMint: STABLECOIN_MINT,
        vaultStablecoinAccount: vaultStablecoinAccount,
        userVaultAccount: userVaultAccount.address,
        feeRecipientStablecoinAccount: feeRecipientStablecoinAccount.address,
        vaultAdminStablecoinAccount: vaultAdminStablecoinAccount.address,
        jupiterProgram: JUPITER_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Deposit Transaction: ${tx}`);
    await connection.confirmTransaction(tx, "confirmed");
    console.log("✅ Transaction Confirmed!");
    console.log("");

    // Get balance after deposit
    const userVaultBalanceAfter = (await getAccount(connection, userVaultAccount.address)).amount;
    const vaultTokensReceived = userVaultBalanceAfter - userVaultBalanceBefore;
    console.log("📊 Deposit Results:");
    console.log(`  Vault Tokens Received: ${vaultTokensReceived.toString()} (${Number(vaultTokensReceived) / 1e6} tokens)`);
    console.log(`  New Vault Token Balance: ${userVaultBalanceAfter.toString()}`);
    console.log("");

    // Check metadata AFTER deposit
    console.log("🔍 Verifying Token Metadata (AFTER deposit)...");
    const metadataAfter = await fetchTokenMetadata(vaultMint);
    if (metadataAfter) {
      console.log("✅ Metadata Verified:");
      console.log(`  Name: ${metadataAfter.name}`);
      console.log(`  Symbol: ${metadataAfter.symbol}`);
      console.log(`  URI: ${metadataAfter.uri || "(empty)"}`);
      console.log("");
      console.log("🎉 SUCCESS! Token metadata is working correctly!");
      console.log("   The vault token should display with name and symbol in wallets and Solscan.");
    } else {
      console.log("❌ WARNING: Metadata not found after deposit");
      console.log("   The token may still show as 'Unknown Token' in wallets.");
    }
    console.log("");

    // Display mint info
    const mintInfo = await getMint(connection, vaultMint);
    console.log("🪙 Mint Information:");
    console.log(`  Address: ${vaultMint.toBase58()}`);
    console.log(`  Decimals: ${mintInfo.decimals}`);
    console.log(`  Supply: ${mintInfo.supply.toString()}`);
    console.log(`  Authority: ${mintInfo.mintAuthority?.toBase58() || "None"}`);
    console.log("");

    return {
      vaultMint: vaultMint.toBase58(),
      vaultTokensReceived: vaultTokensReceived.toString(),
      metadata: metadataAfter,
      transaction: tx
    };

  } catch (error) {
    console.error("❌ Deposit Error:", error);
    if (error instanceof Error) {
      console.error("Error Message:", error.message);
    }
    throw error;
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: npx ts-node deposit_with_metadata_check.ts <vault_index> <amount_in_usdc>");
  console.log("Example: npx ts-node deposit_with_metadata_check.ts 0 100");
  process.exit(1);
}

const vaultIndex = parseInt(args[0]);
const amount = parseFloat(args[1]);

if (isNaN(vaultIndex) || isNaN(amount)) {
  console.error("❌ Invalid arguments. Vault index and amount must be numbers.");
  process.exit(1);
}

depositAndCheckMetadata(vaultIndex, amount)
  .then((result) => {
    console.log("🎉 Deposit completed successfully!");
    console.log("📋 Summary:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

