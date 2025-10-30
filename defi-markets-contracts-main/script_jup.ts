import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, getAccount } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY) : [8,89,214,209,151,193,55,105,55,165,23,237,83,215,123,220,196,159,100,66,122,214,46,183,198,34,51,226,117,230,0,13,126,183,64,88,155,122,33,214,151,68,146,190,7,32,204,198,64,136,250,102,81,17,68,128,146,121,14,75,154,41,111,80];

const STABLECOIN_MINT = NATIVE_MINT;

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

async function depositJup(indexStr: string, amountStr: string) {
  const index = parseInt(indexStr);
  const uiAmount = parseFloat(amountStr);
  if (isNaN(index) || isNaN(uiAmount)) throw new Error("usage: deposit_jup <index> <amount>");
  const amount = BigInt(Math.floor(uiAmount * 1e9));

  const factory = pdaFactory();
  const vault = pdaVault(factory, index);
  const vaultMint = pdaVaultMint(vault);
  const vaultStable = pdaVaultStablecoin(vault);

  const userStableAta = await getAssociatedTokenAddress(STABLECOIN_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ataInfo = await connection.getAccountInfo(userStableAta);
  const ixs: any[] = [];
  if (!ataInfo) ixs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, userStableAta, wallet.publicKey, STABLECOIN_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  await ensureLamports(Number(amount) + Math.floor(0.01 * LAMPORTS_PER_SOL));
  ixs.push(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: userStableAta, lamports: Number(amount) }));
  ixs.push(createSyncNativeInstruction(userStableAta));
  if (ixs.length) await provider.sendAndConfirm(new Transaction().add(...ixs), []);

  const userVaultToken = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, vaultMint, wallet.publicKey);
  const factoryAcc = await program.account.factory.fetch(factory);
  const feeRecipientStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, factoryAcc.feeRecipient);
  const vaultAcc = await program.account.vault.fetch(vault);
  const vaultAdminStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, vaultAcc.admin);

  const remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

  const tx = await program.methods
    .deposit(index, new anchor.BN(amount.toString()))
    .accountsStrict({
      user: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      userStablecoinAccount: userStableAta,
      stablecoinMint: STABLECOIN_MINT,
      vaultStablecoinAccount: vaultStable,
      userVaultAccount: userVaultToken.address,
      feeRecipientStablecoinAccount: feeRecipientStable.address,
      vaultAdminStablecoinAccount: vaultAdminStable.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remaining)
    .rpc();
  console.log("deposit_jup tx:", tx);
}

async function redeemJup(indexStr: string, amountStr: string) {
  const index = parseInt(indexStr);
  const uiAmount = parseFloat(amountStr);
  if (isNaN(index) || isNaN(uiAmount)) throw new Error("usage: redeem_jup <index> <amount>");
  const amount = BigInt(Math.floor(uiAmount * 1e9));

  const factory = pdaFactory();
  const vault = pdaVault(factory, index);
  const vaultMint = pdaVaultMint(vault);
  const vaultStable = pdaVaultStablecoin(vault);

  const userWsolAta = await getAssociatedTokenAddress(STABLECOIN_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(userWsolAta);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(wallet.publicKey, userWsolAta, wallet.publicKey, STABLECOIN_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    await provider.sendAndConfirm(new Transaction().add(ix), []);
  }

  const userVaultTokenAddress = await getAssociatedTokenAddress(vaultMint, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userVaultTokenInfo = await connection.getAccountInfo(userVaultTokenAddress);
  if (!userVaultTokenInfo) throw new Error("User vault token ATA missing");

  const factoryAcc = await program.account.factory.fetch(factory);
  const feeRecipientStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, factoryAcc.feeRecipient);
  const vaultAcc = await program.account.vault.fetch(vault);
  const vaultAdminStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, vaultAcc.admin);

  const remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

  const tx = await program.methods
    .redeem(index, new anchor.BN(amount.toString()))
    .accountsStrict({
      user: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      userVaultAccount: userVaultTokenAddress,
      userStablecoinAccount: userWsolAta,
      stablecoinMint: STABLECOIN_MINT,
      vaultStablecoinAccount: vaultStable,
      feeRecipientStablecoinAccount: feeRecipientStable.address,
      vaultAdminStablecoinAccount: vaultAdminStable.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remaining)
    .rpc();
  console.log("redeem_jup tx:", tx);
}

const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  try {
    if (cmd === "deposit_jup") {
      const [index, amount] = rest;
      await depositJup(index, amount);
    } else if (cmd === "redeem_jup") {
      const [index, amount] = rest;
      await redeemJup(index, amount);
    } else {
      console.log("Usage:");
      console.log("  npx ts-node script_jup.ts deposit_jup <index> <amount>");
      console.log("  npx ts-node script_jup.ts redeem_jup <index> <amount>");
    }
  } catch (e: any) {
    console.error("error:", e?.message || e);
    process.exit(1);
  }
})();
