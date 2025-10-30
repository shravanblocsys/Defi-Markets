import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { join } from 'path';

// Constants
const PROGRAM_ID = new PublicKey('CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs');

// Connection and admin wallet
const connection = new Connection('https://api.mainnet-beta.solana.com', 'processed');
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
);
const adminWallet = new Wallet(adminKeypair);
const provider = new AnchorProvider(connection, adminWallet, {});

// Load IDL and program
const idl = JSON.parse(readFileSync(join(__dirname, 'target/idl/vault_mvp.json'), 'utf8'));
const program = new Program(idl, provider);

async function collectVaultStablecoinToAdmin(vaultIndex: number) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Starting collect for vault ${vaultIndex}`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync([Buffer.from('factory_v2')], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    PROGRAM_ID
  );
  const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    PROGRAM_ID
  );

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault stablecoin: ${vaultStablecoinAccount.toBase58()}`);

  // Read vault stablecoin account (could be USDC or WSOL depending on vault config)
  let vaultTokenAcc;
  try {
    vaultTokenAcc = await getAccount(connection, vaultStablecoinAccount);
  } catch (e) {
    throw new Error(`Vault stablecoin account not found: ${vaultStablecoinAccount.toBase58()}`);
  }

  const mint = new PublicKey(vaultTokenAcc.mint);
  const amount = BigInt(vaultTokenAcc.amount.toString());
  if (amount === BigInt(0)) {
    log('Nothing to collect (balance = 0).');
    return;
  }
  log(`Vault stablecoin balance: ${amount.toString()}`);

  // Ensure admin ATA for that mint exists
  const adminAta = await getAssociatedTokenAddress(mint, adminWallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const adminAtaInfo = await connection.getAccountInfo(adminAta);
  if (!adminAtaInfo) {
    log(`Creating admin ATA for mint ${mint.toBase58()} at ${adminAta.toBase58()}`);
    const createIx = createAssociatedTokenAccountInstruction(
      adminWallet.publicKey,
      adminAta,
      adminWallet.publicKey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(createIx), []);
  }

  // Transfer full balance from vault PDA to admin ATA using program instruction
  log(`Transferring ${amount.toString()} to admin`);
  const sig = await (program as any).methods
    .transferVaultToUser(new BN(vaultIndex), new BN(amount.toString()))
    .accountsStrict({
      user: adminWallet.publicKey,
      factory,
      vault,
      vaultStablecoinAccount,
      userStablecoinAccount: adminAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  log(`✅ Collected to admin. Tx: ${sig}`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: npx ts-node collect.ts <vault_index>');
  process.exit(1);
}

const vaultIndex = parseInt(args[0], 10);

console.log('🚀 Starting Collect');
console.log(`📊 Vault Index: ${vaultIndex}`);

collectVaultStablecoinToAdmin(vaultIndex).catch((e) => {
  console.error('❌ Collect failed:', e);
  process.exit(1);
});


