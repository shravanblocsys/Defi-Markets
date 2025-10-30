import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getOrCreateAssociatedTokenAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY) : [8,89,214,209,151,193,55,105,55,165,23,237,83,215,123,220,196,159,100,66,122,214,46,183,198,34,51,226,117,230,0,13,126,183,64,88,155,122,33,214,151,68,146,190,7,32,204,198,64,136,250,102,81,17,68,128,146,121,14,75,154,41,111,80];

const connection = new Connection(RPC_URL, "confirmed");
const scriptWallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, scriptWallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

function pdaFactory() { return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; }
function pdaVault(factory: PublicKey, index: number) { return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; }
function pdaVaultMint(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_mint"), vault.toBuffer()], program.programId)[0]; }

async function transferVaultTokens(vaultIndex: number, userWallet: Keypair, amount: number) {
  console.log(`🔄 Transferring ${amount} vault tokens to user wallet: ${userWallet.publicKey.toBase58()}`);
  
  const factory = pdaFactory();
  const vault = pdaVault(factory, vaultIndex);
  const vaultMint = pdaVaultMint(vault);
  
  // Get script wallet's vault token account
  const scriptVaultTokenAddress = await getAssociatedTokenAddress(vaultMint, scriptWallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  console.log(`Script vault token account: ${scriptVaultTokenAddress.toBase58()}`);
  
  // Get user's vault token account
  const userVaultTokenAddress = await getAssociatedTokenAddress(vaultMint, userWallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  console.log(`User vault token account: ${userVaultTokenAddress.toBase58()}`);
  
  // Check script wallet's balance
  try {
    const scriptBalance = await getAccount(connection, scriptVaultTokenAddress);
    console.log(`Script wallet vault token balance: ${scriptBalance.amount.toString()}`);
    
    if (scriptBalance.amount < BigInt(amount)) {
      throw new Error(`Insufficient vault tokens. Available: ${scriptBalance.amount.toString()}, Requested: ${amount}`);
    }
  } catch (e) {
    console.error("Error checking script wallet balance:", e.message);
    return;
  }
  
  // Create user's vault token account if it doesn't exist
  try {
    await getAccount(connection, userVaultTokenAddress);
    console.log("✅ User vault token account already exists");
  } catch (e) {
    console.log("📝 Creating user vault token account...");
    const createIx = createAssociatedTokenAccountInstruction(
      scriptWallet.publicKey, // payer
      userVaultTokenAddress,  // ata
      userWallet.publicKey,   // owner
      vaultMint               // mint
    );
    
    const tx = new Transaction().add(createIx);
    const sig = await connection.sendTransaction(tx, [scriptWallet.payer]);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("✅ User vault token account created");
  }
  
  // Transfer vault tokens from script wallet to user wallet
  console.log(`🔄 Transferring ${amount} vault tokens...`);
  const transferIx = await program.methods
    .transfer(new anchor.BN(amount))
    .accounts({
      from: scriptVaultTokenAddress,
      to: userVaultTokenAddress,
      authority: scriptWallet.publicKey,
    })
    .instruction();
    
  const tx = new Transaction().add(transferIx);
  const sig = await connection.sendTransaction(tx, [scriptWallet.payer]);
  await connection.confirmTransaction(sig, "confirmed");
  
  console.log("✅ Vault tokens transferred successfully");
  console.log(`Transaction: ${sig}`);
  
  // Check final balances
  const scriptBalance = await getAccount(connection, scriptVaultTokenAddress);
  const userBalance = await getAccount(connection, userVaultTokenAddress);
  console.log(`Script wallet balance: ${scriptBalance.amount.toString()}`);
  console.log(`User wallet balance: ${userBalance.amount.toString()}`);
}

// Create user wallet
const userWallet = Keypair.generate();
console.log("🔑 User wallet created:", userWallet.publicKey.toBase58());

const [vaultIndex, amount] = process.argv.slice(2);
if (!vaultIndex || !amount) {
  console.log("Usage: npx ts-node transfer_tokens.ts <vault_index> <amount>");
  console.log("Example: npx ts-node transfer_tokens.ts 2 100000000");
  process.exit(1);
}

transferVaultTokens(parseInt(vaultIndex), userWallet, parseInt(amount));
