import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// --- Config ---
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

// --- Setup Anchor provider & program ---
const projectDir = __dirname;
const idlPath = join(projectDir, 'target/idl/vault_mvp.json');
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

// Load collector keypair (keeper/admin)
const keypairPath = process.env.KEYPAIR || join(projectDir, 'keypairs/admin-keypair.json');
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8')))
);

const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new Wallet(payer);
const provider = new AnchorProvider(connection, wallet, {});
const programId = new PublicKey("CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs");
const program = new Program(idl, provider);

async function distributeAccruedFees(vaultIndex: number) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Distributing accrued fees as ETF tokens for vault index ${vaultIndex}`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync([Buffer.from('factory_v2')], programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    programId
  );
  const [vaultMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_mint'), vault.toBuffer()],
    programId
  );

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault Mint: ${vaultMint.toBase58()}`);

  // Fetch and decode accounts
  const factoryInfo = await connection.getAccountInfo(factory);
  if (!factoryInfo) throw new Error('Factory account not found');
  const factoryAcct: any = program.coder.accounts.decode('factory', factoryInfo.data);

  const vaultInfo = await connection.getAccountInfo(vault);
  if (!vaultInfo) throw new Error('Vault account not found');
  const vaultAcct: any = program.coder.accounts.decode('vault', vaultInfo.data);

  const feeRecipient = new PublicKey(factoryAcct.feeRecipient);
  const vaultAdmin = new PublicKey(vaultAcct.admin);

  // Derive recipient ATAs for vault tokens (ETF tokens)
  const feeRecipientVaultATA = await getAssociatedTokenAddress(
    vaultMint,
    feeRecipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const vaultAdminVaultATA = await getAssociatedTokenAddress(
    vaultMint,
    vaultAdmin,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  log(`Fee recipient vault token ATA: ${feeRecipientVaultATA.toBase58()}`);
  log(`Vault admin vault token ATA: ${vaultAdminVaultATA.toBase58()}`);

  // Call the program to distribute fees as vault tokens
  log('Sending distributeAccruedFees instruction...');
  const sig = await (program.methods as any)
    ['distributeAccruedFees'](new BN(vaultIndex))
    .accountsStrict({
      collector: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      vaultAdminVaultAccount: vaultAdminVaultATA,
      feeRecipientVaultAccount: feeRecipientVaultATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  log(`✅ Distributed accrued fees as ETF tokens. Tx: ${sig}`);
}

// CLI
async function main() {
  const [vaultIndexStr] = process.argv.slice(2);
  if (!vaultIndexStr) {
    console.error('Usage: npx ts-node distribute_accrued_fees.ts <vault_index>');
    process.exit(1);
  }
  const vaultIndex = parseInt(vaultIndexStr, 10);
  await distributeAccruedFees(vaultIndex);
}

main().catch((e) => {
  console.error('Fee distribution failed:', e);
  process.exit(1);
});
