import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getOrCreateAssociatedTokenAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from "@solana/spl-token";
import { struct, u8, publicKey, u64 } from "@project-serum/borsh";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

const STABLECOIN_MINT = NATIVE_MINT; // WSOL deposit
const DEVNET_USDC = new PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT");
const DEVNET_USDT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
const TUSDT_MINT = DEVNET_USDT; // Use DEVNET_USDT as TUSDT_MINT
const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

// Raydium CPMM (for swap CPI on devnet)
const RAYDIUM_CPMM_PROGRAM = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"); // CPMM (cpmm-cpi crate)
const RAYDIUM_ALT_PROGRAM = new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"); // Other Raydium deployment

const connection = new Connection(RPC_URL, "confirmed");

// Create a separate user wallet (different from script wallet)
const userWallet = Keypair.generate();
console.log("🔑 User wallet created:", userWallet.publicKey.toBase58());

// Script wallet (for signing transactions)
const scriptWallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, scriptWallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

function pdaFactory() { return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; }
function pdaVault(factory: PublicKey, index: number) { return PublicKey.findProgramAddressSync([Buffer.from("vault"), factory.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 4)], program.programId)[0]; }
function pdaVaultMint(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_mint"), vault.toBuffer()], program.programId)[0]; }
function pdaVaultStablecoin(vault: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from("vault_stablecoin_account"), vault.toBuffer()], program.programId)[0]; }

async function ensureLamports(need: number) {
  const balance = await connection.getBalance(userWallet.publicKey);
  if (balance >= need) return;
  const topUp = need - balance + Math.floor(0.05 * LAMPORTS_PER_SOL);
  const sig = await connection.requestAirdrop(userWallet.publicKey, topUp);
  await connection.confirmTransaction(sig, "confirmed");
}

async function testUserRedeem(indexStr: string, amountStr: string) {
  let step = 0; const stepLog = (m: string) => console.log(`STEP ${++step}: ${m}`);
  stepLog(`Testing user redeem with user wallet: ${userWallet.publicKey.toBase58()}`);
  
  const index = parseInt(indexStr);
  const uiAmount = parseFloat(amountStr);
  if (isNaN(index) || isNaN(uiAmount)) throw new Error("usage: test_user_redeem <index> <amount>");
  stepLog(`parsed index=${index}, uiAmount=${uiAmount}`);
  const amount = BigInt(Math.floor(uiAmount * 1e9));
  stepLog(`computed amount in lamports=${amount.toString()}`);

  const factory = pdaFactory();
  const vault = pdaVault(factory, index);
  const vaultMint = pdaVaultMint(vault);
  const vaultStable = pdaVaultStablecoin(vault);
  stepLog(`derived PDAs factory=${factory.toBase58()} vault=${vault.toBase58()} vaultMint=${vaultMint.toBase58()} vaultStable=${vaultStable.toBase58()}`);

  // Ensure user has SOL
  await ensureLamports(1 * LAMPORTS_PER_SOL);
  stepLog(`ensured user has SOL`);

  // Get user's vault token account
  const userVaultTokenAddress = await getAssociatedTokenAddress(vaultMint, userWallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  stepLog(`user vault token address: ${userVaultTokenAddress.toBase58()}`);

  // Check if user has vault tokens
  try {
    const userVaultTokenInfo = await connection.getAccountInfo(userVaultTokenAddress);
    if (!userVaultTokenInfo) {
      throw new Error(`User vault token account ${userVaultTokenAddress.toBase58()} does not exist. User needs vault tokens to redeem.`);
    }
    
    const userVaultTokenBalance = await getAccount(connection, userVaultTokenAddress);
    stepLog(`user vault token balance: ${userVaultTokenBalance.amount.toString()}`);
    
    if (userVaultTokenBalance.amount < amount) {
      throw new Error(`Insufficient vault tokens. Available: ${userVaultTokenBalance.amount.toString()}, Requested: ${amount.toString()}`);
    }
  } catch (e) {
    stepLog(`User doesn't have vault tokens. Need to transfer some from script wallet first.`);
    stepLog(`Error: ${e.message}`);
    return;
  }

  // Get user's WSOL account
  const userWsolAta = await getAssociatedTokenAddress(STABLECOIN_MINT, userWallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  stepLog(`user WSOL ATA: ${userWsolAta.toBase58()}`);

  // Get factory account
  const factoryAcc = await program.account.factory.fetch(factory);
  stepLog(`fetched factory account`);
  
  // Get fee recipient stablecoin account
  const feeRecipientStableAddress = await getAssociatedTokenAddress(STABLECOIN_MINT, factoryAcc.feeRecipient, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const feeRecipientStableInfo = await connection.getAccountInfo(feeRecipientStableAddress);
  if (!feeRecipientStableInfo) {
    throw new Error(`Fee recipient stablecoin account ${feeRecipientStableAddress.toBase58()} does not exist`);
  }
  
  // Get vault account
  const vaultAcc = await program.account.vault.fetch(vault);
  stepLog(`fetched vault account`);
  
  // Get vault admin stablecoin account
  const vaultAdminStableAddress = await getAssociatedTokenAddress(STABLECOIN_MINT, vaultAcc.admin, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const vaultAdminStableInfo = await connection.getAccountInfo(vaultAdminStableAddress);
  if (!vaultAdminStableInfo) {
    throw new Error(`Vault admin stablecoin account ${vaultAdminStableAddress.toBase58()} does not exist`);
  }

  // Build remaining accounts (same as before)
  const remaining: any[] = [];
  // ... (same pool discovery logic as in redeem.ts)
  
  console.log("Sending redeem transaction with USER wallet...");
  console.log("🔑 User wallet:", userWallet.publicKey.toBase58());
  console.log("🔑 Script wallet:", scriptWallet.publicKey.toBase58());
  
  const tx = await program.methods
    .redeem(index, new anchor.BN(amount.toString()))
    .accountsStrict({
      user: userWallet.publicKey, // Use USER wallet, not script wallet
      factory,
      vault,
      vaultMint,
      userVaultAccount: userVaultTokenAddress,
      userStablecoinAccount: userWsolAta,
      stablecoinMint: STABLECOIN_MINT,
      vaultStablecoinAccount: vaultStable,
      feeRecipientStablecoinAccount: feeRecipientStableAddress,
      vaultAdminStablecoinAccount: vaultAdminStableAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remaining || [])
    .signers([userWallet]) // Sign with user wallet
    .rpc();
    
  console.log("redeem tx:", tx);
  stepLog(`redeem rpc sent sig=${tx}`);
}

const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  if (cmd !== "test_user_redeem") {
    console.log("Usage: npx ts-node test_user_redeem.ts test_user_redeem <vault_index> <amount>");
    console.log("Example: npx ts-node test_user_redeem.ts test_user_redeem 2 0.1");
    process.exit(0);
  }
  const [index, amount] = rest;
  await testUserRedeem(index, amount);
})();
