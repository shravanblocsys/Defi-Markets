import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableAccount,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { join } from 'path';

// Constants
const PROGRAM_ID = new PublicKey('CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs');
const STABLECOIN_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC

// Connection and admin wallet (payer for swaps)
const connection = new Connection('https://api.mainnet-beta.solana.com', 'processed');
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
);
const adminWallet = new Wallet(adminKeypair);
const provider = new AnchorProvider(connection, adminWallet, {});

// Load IDL and program
const idl = JSON.parse(readFileSync(join(__dirname, 'target/idl/vault_mvp.json'), 'utf8'));
const program = new Program(idl, provider);

// Jupiter Lite API endpoints
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap-instructions';

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function getJupiterQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint) {
  const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Failed to get quote: ${data.error}`);
  return data;
}

async function getJupiterInstructions(quote: any, userPublicKey: PublicKey, destinationTokenAccount: PublicKey) {
  const body: any = {
    quoteResponse: quote,
    userPublicKey: userPublicKey.toBase58(),
    destinationTokenAccount: destinationTokenAccount.toBase58(),
  };
  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Failed to get swap instructions: ${data.error}`);
  return data;
}

function deserializeInstruction(ix: any) {
  return {
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((k: any) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  };
}

async function getAddressLookupTableAccounts(keys: string[]): Promise<AddressLookupTableAccount[]> {
  const infos = await connection.getMultipleAccountsInfo(keys.map((k) => new PublicKey(k)));
  return infos.reduce((acc, accountInfo, idx) => {
    const addr = keys[idx];
    if (accountInfo) {
      acc.push(
        new AddressLookupTableAccount({ key: new PublicKey(addr), state: AddressLookupTableAccount.deserialize(accountInfo.data) })
      );
    }
    return acc;
  }, new Array<AddressLookupTableAccount>());
}

async function adminExecuteSwaps(vaultIndex: number) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Starting admin-only swaps for vault ${vaultIndex}`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync([Buffer.from('factory_v2')], PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    PROGRAM_ID
  );
  const [vaultUSDCAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    PROGRAM_ID
  );

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault USDC: ${vaultUSDCAccount.toBase58()}`);

  // Fetch vault state to get underlying assets
  const vaultAccount: any = await (program as any).account.vault.fetch(vault);
  const underlying: { mint: PublicKey; bps: number }[] = (vaultAccount.underlyingAssets || []).map(
    (ua: any) => ({ mint: new PublicKey(ua.mintAddress), bps: Number(ua.mintBps) })
  );
  if (!underlying.length) throw new Error('No underlying assets configured');

  // Read vault USDC balance
  const vaultUSDC = await getAccount(connection, vaultUSDCAccount);
  const totalUSDC = BigInt(vaultUSDC.amount.toString());
  if (totalUSDC === BigInt(0)) {
    log('Vault USDC balance is 0; nothing to swap.');
    return;
  }
  log(`Vault USDC balance: ${totalUSDC.toString()}`);

  for (let i = 0; i < underlying.length; i++) {
    const { mint: assetMint, bps } = underlying[i];
    const assetAmount = (totalUSDC * BigInt(bps)) / BigInt(10000);
    if (assetAmount === BigInt(0)) {
      log(`Skipping asset ${assetMint.toBase58()} with 0 allocation`);
      continue;
    }

    log(`Processing asset ${i + 1}/${underlying.length}: ${assetMint.toBase58()} (${bps} bps)`);

    // Derive vault ATA for asset and ensure exists
    const vaultAssetAccount = await getAssociatedTokenAddress(
      assetMint,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAssetInfo = await connection.getAccountInfo(vaultAssetAccount);
    if (!vaultAssetInfo) {
      log(`Creating vault ATA for ${assetMint.toBase58()} at ${vaultAssetAccount.toBase58()}`);
      const createIx = createAssociatedTokenAccountInstruction(
        adminWallet.publicKey,
        vaultAssetAccount,
        vault,
        assetMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      await provider.sendAndConfirm(new (await import('@solana/web3.js')).Transaction().add(createIx), []);
    }

    // Ensure admin has USDC ATA
    const adminUSDC = await getAssociatedTokenAddress(
      STABLECOIN_MINT,
      adminWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Transfer USDC from vault to admin (admin is authorized)
    log(`Transferring ${assetAmount.toString()} USDC from vault to admin`);
    const transferSig = await (program as any).methods
      .transferVaultToUser(new BN(vaultIndex), new BN(assetAmount.toString()))
      .accountsStrict({
        user: adminWallet.publicKey,
        factory,
        vault,
        vaultStablecoinAccount: vaultUSDCAccount,
        userStablecoinAccount: adminUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    log(`USDC transfer tx: ${transferSig}`);

    // Jupiter swap USDC -> asset into vault's ATA
    const quote = await retryWithBackoff(() => getJupiterQuote(STABLECOIN_MINT, assetMint, assetAmount));
    log(`Quote: ${assetAmount.toString()} USDC -> ${quote.outAmount} ${assetMint.toBase58()}`);
    const instructions = await retryWithBackoff(() => getJupiterInstructions(quote, adminWallet.publicKey, vaultAssetAccount));

    const swapInstruction = deserializeInstruction(instructions.swapInstruction);
    const swapIxs: any[] = [];
    if (instructions.setupInstructions?.length) instructions.setupInstructions.forEach((ix: any) => swapIxs.push(deserializeInstruction(ix)));
    if (instructions.computeBudgetInstructions?.length) instructions.computeBudgetInstructions.forEach((ix: any) => swapIxs.push(deserializeInstruction(ix)));
    swapIxs.push(new TransactionInstruction({ programId: swapInstruction.programId, keys: swapInstruction.keys, data: swapInstruction.data }));
    if (instructions.cleanupInstruction) swapIxs.push(deserializeInstruction(instructions.cleanupInstruction));

    const alts: AddressLookupTableAccount[] = instructions.addressLookupTableAddresses?.length
      ? await getAddressLookupTableAccounts(instructions.addressLookupTableAddresses)
      : [];
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({ payerKey: adminWallet.publicKey, recentBlockhash: blockhash, instructions: swapIxs }).compileToV0Message(alts);
    const vtx = new VersionedTransaction(messageV0);
    const signed = await adminWallet.signTransaction(vtx);
    const sig = await retryWithBackoff(() => connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed' }), 5);
    await retryWithBackoff(() => connection.confirmTransaction(sig, 'processed'), 3);
    log(`Swap successful: ${sig}`);
  }

  log('✅ Admin-only swaps completed');
}

// CLI
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: npx ts-node admin_swaps.ts <vault_index>');
  process.exit(1);
}

const vaultIndex = parseInt(args[0], 10);

console.log('🚀 Starting Admin-Only Swaps');
console.log(`📊 Vault Index: ${vaultIndex}`);

adminExecuteSwaps(vaultIndex).catch((e) => {
  console.error('❌ Admin swaps failed:', e);
  process.exit(1);
});


