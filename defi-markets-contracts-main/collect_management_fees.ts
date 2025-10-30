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
// Update RPC as needed
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
// Vault stablecoin mint (USDC on mainnet by default)
const STABLECOIN_MINT = new PublicKey(
  process.env.STABLECOIN_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

// --- Setup Anchor provider & program ---
const projectDir = __dirname; // pointing inside defi-markets-contracts
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
// Strong typing from generated Anchor types
// Using generic Program typing like other scripts for compatibility
// Program ID is in IDL metadata
const programId = new PublicKey(idl.metadata.address);
const program = new Program(idl, provider);

async function collectManagementFees(vaultIndex: number) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Collecting management fees for vault index ${vaultIndex}`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync([Buffer.from('factory_v2')], programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    programId
  );
  const [vaultUSDC] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    programId
  );

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault USDC: ${vaultUSDC.toBase58()}`);

  // Fetch and decode accounts (AccountsCoder doesn't have fetch; use decode)
  const factoryInfo = await connection.getAccountInfo(factory);
  if (!factoryInfo) throw new Error('Factory account not found');
  const factoryAcct: any = program.coder.accounts.decode('factory_v2', factoryInfo.data);

  const vaultInfo = await connection.getAccountInfo(vault);
  if (!vaultInfo) throw new Error('Vault account not found');
  const vaultAcct: any = program.coder.accounts.decode('Vault', vaultInfo.data);

  const feeRecipient = new PublicKey(factoryAcct.feeRecipient);
  const vaultAdmin = new PublicKey(vaultAcct.admin);

  // Derive recipient ATAs for stablecoin
  const feeRecipientATA = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    feeRecipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const vaultAdminATA = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    vaultAdmin,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  log(`Fee recipient ATA: ${feeRecipientATA.toBase58()}`);
  log(`Vault admin ATA: ${vaultAdminATA.toBase58()}`);

  // Call the program to collect fees
  log('Sending collectWeeklyManagementFees instruction...');
  const sig = await (program.methods as any)
    ['collectWeeklyManagementFees'](new BN(vaultIndex))
    .accountsStrict({
      collector: wallet.publicKey,
      factory,
      vault,
      vaultStablecoinAccount: vaultUSDC,
      vaultAdminStablecoinAccount: vaultAdminATA,
      feeRecipientStablecoinAccount: feeRecipientATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  log(`✅ Collected management fees. Tx: ${sig}`);
}

// CLI
async function main() {
  const [vaultIndexStr] = process.argv.slice(2);
  if (!vaultIndexStr) {
    console.error('Usage: npx ts-node collect_management_fees.ts <vault_index>');
    process.exit(1);
  }
  const vaultIndex = parseInt(vaultIndexStr, 10);
  await collectManagementFees(vaultIndex);
}

main().catch((e) => {
  console.error('Fee collection failed:', e);
  process.exit(1);
});


