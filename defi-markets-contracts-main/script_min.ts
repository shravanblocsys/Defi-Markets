import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// --- Basic config (mainnet-beta) ---
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  :[195,202,161,3,114,129,253,3,83,2,189,101,201,224,215,42,197,16,141,125,117,25,148,108,137,203,148,87,142,129,22,236,173,70,20,149,74,139,63,243,169,112,31,12,248,231,56,250,207,205,144,152,101,185,63,192,34,217,83,190,37,55,2,209];
  // [218, 160, 156, 207, 217, 144, 46, 141, 140, 106, 192, 30, 136, 203, 151, 236, 131, 86, 7, 12, 222, 40, 56, 4, 29, 98, 129, 224, 192, 213, 235, 79, 2, 121, 37, 132, 3, 119, 111, 162, 29, 181, 242, 207, 186, 240, 82, 113, 40, 81, 158, 52, 38, 245, 133, 72, 218, 91, 179, 240, 231, 33, 143, 187];
// [8,89,214,209,151,193,55,105,55,165,23,237,83,215,123,220,196,159,100,66,122,214,46,183,198,34,51,226,117,230,0,13,126,183,64,88,155,122,33,214,151,68,146,190,7,32,204,198,64,136,250,102,81,17,68,128,146,121,14,75,154,41,111,80];

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


