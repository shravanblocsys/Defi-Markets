import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// --- Basic config (mainnet-beta) ---
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

// Defaults (can override via CLI args for create)
const DEFAULT_UNDERLYING: { mintAddress: string; mintBps: number }[] = [
  { mintAddress: "So11111111111111111111111111111111111111112", mintBps: 5000 }, // SOL from jupiter
  { mintAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", mintBps: 4000 }, // USDT from jupiter
  { mintAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", mintBps: 1000 }, // USDT from jupiter
];
// Use USDC as deposit token (stablecoin)
const STABLECOIN_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// --- Setup provider + program ---
const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);

const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

// Ensure wallet has at least `need` lamports (devnet: auto-airdrop)
async function ensureLamports(need: number) {
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance >= need) return;
  const topUp = need - balance + Math.floor(0.05 * LAMPORTS_PER_SOL);
  try {
    const sig = await connection.requestAirdrop(wallet.publicKey, topUp);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (e) {
    console.warn("Airdrop failed; please fund wallet manually.");
    throw e;
  }
}

// --- PDAs ---
function pdaFactory() {
  return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0];
}
function pdaVault(factory: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync([
    Buffer.from("vault"),
    factory.toBuffer(),
    new anchor.BN(index).toArrayLike(Buffer, "le", 4),
  ], program.programId)[0];
}
function pdaVaultMint(vault: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_mint"), vault.toBuffer()], program.programId)[0];
}
function pdaVaultTokenAccount(vault: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_token_account"), vault.toBuffer()], program.programId)[0];
}

// --- Commands ---

async function cmdCreate(name?: string, symbol?: string) {
  const factory = pdaFactory();
  const factoryAcc = await program.account.factory.fetch(factory);
  const index = factoryAcc.vaultCount;
  const vault = pdaVault(factory, index);
  const vaultMint = pdaVaultMint(vault);
  const vaultTokenAccount = pdaVaultTokenAccount(vault);

  const underlying = DEFAULT_UNDERLYING.map((u) => ({
    mintAddress: new PublicKey(u.mintAddress),
    mintBps: u.mintBps,
  }));

  const tx = await program.methods
    .createVault(name || "Auto Vault", symbol || "AUT0", underlying, 200)
    .accountsStrict({
      admin: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      vaultTokenAccount,
      stablecoinMint: STABLECOIN_MINT,
      adminStablecoinAccount: (await (async () => {
        // Ensure admin USDC ATA exists (covers creation fee)
        const ata = await getAssociatedTokenAddress(STABLECOIN_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const info = await connection.getAccountInfo(ata);
        const ixs: any[] = [];
        if (!info) {
          ixs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, ata, wallet.publicKey, STABLECOIN_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
        }
        // Ensure wallet has enough SOL for transaction fees
        await ensureLamports(10_000_000); // 0.01 SOL for fees
        if (ixs.length) {
          const wrapTx = new Transaction().add(...ixs);
          await provider.sendAndConfirm(wrapTx, []);
        }
        return { address: ata } as any;
      })()).address,
      factoryAdminStablecoinAccount: (await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, (await program.account.factory.fetch(factory)).admin)).address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log("create tx:", tx, "vault:", vault.toBase58());
}


// --- CLI ---
const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  try {
    if (cmd === "create") {
      const [name, symbol] = rest;
      await cmdCreate(name, symbol);
    } else {
      console.log("Usage:");
      console.log("  npx ts-node script_min.ts create [name] [symbol]");
    }
  } catch (e: any) {
    console.error("error:", e?.message || e);
    process.exit(1);
  }
})();


