import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  AddressLookupTableAccount,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { join } from 'path';

// Constants
const PROGRAM_ID = new PublicKey('CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs');
const STABLECOIN_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC

// Setup connection and wallet
const connection = new Connection('https://api.mainnet-beta.solana.com', 'processed');
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
);
const wallet = new Wallet(walletKeypair);
const provider = new AnchorProvider(connection, wallet, {});

// Load IDL and program (match deposit script constructor)
const idl = JSON.parse(readFileSync(join(__dirname, 'target/idl/vault_mvp.json'), 'utf8'));
const program = new Program(idl, provider);

// Jupiter Lite API endpoints
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://lite-api.jup.ag/swap/v1/swap-instructions";

// Retry helper
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// Jupiter helpers
async function getJupiterQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint) {
  const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Failed to get quote: ${data.error}`);
  return data;
}

async function getJupiterInstructions(quote: any, userPublicKey: PublicKey, destinationTokenAccount?: PublicKey) {
  const body: any = {
    quoteResponse: quote,
    userPublicKey: userPublicKey.toBase58(),
  };
  if (destinationTokenAccount) body.destinationTokenAccount = destinationTokenAccount.toBase58();
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
  const infos = await connection.getMultipleAccountsInfo(keys.map(k => new PublicKey(k)));
  return infos.reduce((acc, accountInfo, idx) => {
    const addr = keys[idx];
    if (accountInfo) {
      acc.push(new AddressLookupTableAccount({ key: new PublicKey(addr), state: AddressLookupTableAccount.deserialize(accountInfo.data) }));
    }
    return acc;
  }, new Array<AddressLookupTableAccount>());
}

async function redeemProgramSide(vaultIndex: number, vaultTokenAmount: bigint) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Starting redeem for vault ${vaultIndex} with ${vaultTokenAmount.toString()} vault tokens`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync(
    [Buffer.from('factory_v2')],
    program.programId
  );

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    program.programId
  );

  const [vaultMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_mint'), vault.toBuffer()],
    program.programId
  );

  const [vaultUSDCAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    program.programId
  );

  // Load admin wallet (vault admin) for management fee destination
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
  );
  const adminPubkey = adminKeypair.publicKey;

  // User accounts
  const userVaultTokenAccount = await getAssociatedTokenAddress(
    vaultMint,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const userUSDCAccount = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Fee recipient (factory) and vault admin fee accounts
  // Fetch factory to read the configured fee recipient
  const factoryAccount: any = await (program as any).account.factory.fetch(factory);
  const feeRecipientPubkey = new PublicKey(factoryAccount.feeRecipient);

  // Derive ATAs for fee recipient and vault admin (admin wallet)
  const feeRecipientUSDCAccount = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    feeRecipientPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const vaultAdminUSDCAccount = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    adminPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Ensure fee ATAs exist (create if missing)
  const feeRecInfo = await connection.getAccountInfo(feeRecipientUSDCAccount);
  if (!feeRecInfo) {
    const createFeeAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      feeRecipientUSDCAccount,
      feeRecipientPubkey,
      STABLECOIN_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(createFeeAtaIx), []);
  }

  const adminAtaInfo = await connection.getAccountInfo(vaultAdminUSDCAccount);
  if (!adminAtaInfo) {
    const createAdminAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      vaultAdminUSDCAccount,
      adminPubkey,
      STABLECOIN_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(createAdminAtaIx), []);
  }

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault Mint: ${vaultMint.toBase58()}`);
  log(`Vault USDC: ${vaultUSDCAccount.toBase58()}`);
  log(`User Vault ATA: ${userVaultTokenAccount.toBase58()}`);
  log(`User USDC ATA: ${userUSDCAccount.toBase58()}`);

  // Read vault state needed for pro-rata
  // Total supply via user's vaultMint ATA supply is not available here; fetch from program account if needed.
  // We'll fetch vault ATAs per underlying and compute pro-rata from balances.

  // Load vault to get dynamic underlying assets
  const vaultAccount: any = await (program as any).account.vault.fetch(vault);
  const underlying = (vaultAccount.underlyingAssets || []).map((a: any) => ({ mint: new PublicKey(a.mintAddress), bps: a.mintBps }));
  if (!underlying.length) {
    throw new Error('Vault has no underlying assets configured');
  }

  let totalSupply: bigint | null = null;
  try {
    totalSupply = BigInt(vaultAccount.totalSupply.toString());
  } catch (_e) {
    log(`⚠️ Could not fetch vault account; please ensure IDL account casing. Aborting.`);
    throw _e;
  }

  // For each underlying: compute pro‑rata amount = (vault ATA balance * vaultTokenAmount / totalSupply)
  for (let i = 0; i < underlying.length; i++) {
    const assetMint = underlying[i].mint;

    // Derive vault's ATA for this asset (owner = vault PDA)
    const vaultAssetAccount = await getAssociatedTokenAddress(
      assetMint,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Ensure user's ATA exists for this asset
    const userAssetAccount = await getAssociatedTokenAddress(
      assetMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const userAssetInfo = await connection.getAccountInfo(userAssetAccount);
    if (!userAssetInfo) {
      const createIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        userAssetAccount,
        wallet.publicKey,
        assetMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      await provider.sendAndConfirm(new Transaction().add(createIx), []);
    }

    // Read vault asset balance
    let vaultAssetAmount = BigInt(0);
    try {
      const acc = await getAccount(connection, vaultAssetAccount);
      vaultAssetAmount = BigInt(acc.amount.toString());
    } catch (_e) {
      vaultAssetAmount = BigInt(0);
    }

    if (vaultAssetAmount === BigInt(0) || !totalSupply || totalSupply === BigInt(0)) continue;

    const proRataAmount = (vaultAssetAmount * BigInt(vaultTokenAmount.toString())) / totalSupply;
    if (proRataAmount === BigInt(0)) continue;

    // 1) Withdraw underlying from vault to user (program)
    log(`Withdrawing ${proRataAmount.toString()} of ${assetMint.toBase58()} to user`);
    await program.methods
      .withdrawUnderlyingToUser(new BN(vaultIndex), new BN(proRataAmount.toString()))
      .accountsStrict({
        user: wallet.publicKey,
        factory,
        vault,
        vaultAssetAccount,
        userAssetAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // 2) Swap user's received asset to USDC, destination = vault USDC PDA
    const quote = await retryWithBackoff(() => getJupiterQuote(assetMint, STABLECOIN_MINT, proRataAmount));
    const instructions = await retryWithBackoff(() => getJupiterInstructions(quote, wallet.publicKey, vaultUSDCAccount));

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
    const messageV0 = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions: swapIxs }).compileToV0Message(alts);
    const vtx = new VersionedTransaction(messageV0);
    const signed = await wallet.signTransaction(vtx);
    const sig = await retryWithBackoff(() => connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed' }), 5);
    await retryWithBackoff(() => connection.confirmTransaction(sig, 'processed'), 3);
    log(`Swapped ${proRataAmount.toString()} ${assetMint.toBase58()} -> USDC, tx: ${sig}`);
  }

  // Read fresh vault state and vault USDC balance
  const latestVaultAcc: any = await (program as any).account.vault.fetch(vault);
  const totalAssets: bigint = BigInt(latestVaultAcc.totalAssets.toString());
  const totalSupplyNow: bigint = BigInt(latestVaultAcc.totalSupply.toString());
  const vaultUsdcAcc = await getAccount(connection, vaultUSDCAccount);
  const vaultUsdcBalance: bigint = BigInt(vaultUsdcAcc.amount.toString());

  // Compute required USDC for requested vaultTokenAmount
  const requested = BigInt(vaultTokenAmount.toString());
  const requiredUsdc = totalSupplyNow === BigInt(0) ? BigInt(0) : (requested * totalAssets) / totalSupplyNow;

  // If insufficient USDC, downscale the redeem amount to what vault can pay
  let adjustedVaultTokenAmount = requested;
  if (vaultUsdcBalance < requiredUsdc && totalAssets > BigInt(0)) {
    adjustedVaultTokenAmount = (vaultUsdcBalance * totalSupplyNow) / totalAssets;
    log(`Insufficient USDC in vault (${vaultUsdcBalance.toString()}) vs required (${requiredUsdc.toString()}).`);
    log(`Downscaling redeem amount to ${adjustedVaultTokenAmount.toString()} vault tokens.`);
  }

  if (adjustedVaultTokenAmount === BigInt(0)) {
    throw new Error('Vault lacks sufficient USDC to redeem any tokens at this time.');
  }

  // 3) Finalize redeem: burn vault tokens, settle fees, pay net USDC to user
  log('Finalizing redeem...');
  const finalizeSig = await program.methods
    .finalizeRedeem(new BN(vaultIndex), new BN(adjustedVaultTokenAmount.toString()))
    .accountsStrict({
      user: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      userVaultAccount: userVaultTokenAccount,
      vaultStablecoinAccount: vaultUSDCAccount,
      userStablecoinAccount: userUSDCAccount,
      feeRecipientStablecoinAccount: feeRecipientUSDCAccount,
      vaultAdminStablecoinAccount: vaultAdminUSDCAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  log(`✅ Finalize redeem successful: ${finalizeSig}`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx ts-node redeem_program_side.ts <vault_index> <vault_token_amount_raw>');
  process.exit(1);
}

const vaultIndex = parseInt(args[0], 10);
const vaultTokenAmount = BigInt(args[1]);

console.log('🚀 Starting Program-Side Redeem');
console.log(`📊 Vault Index: ${vaultIndex}`);
console.log(`🪙 Vault Tokens: ${vaultTokenAmount.toString()} raw units`);

redeemProgramSide(vaultIndex, vaultTokenAmount).catch((e) => {
  console.error('❌ Redeem failed:', e);
  process.exit(1);
});


