import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// --- Config ---
// Update RPC as needed
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const JUP_PRICE_API = 'https://lite-api.jup.ag/price/v3?ids=';

// --- Types ---
type AssetPrice = {
  mintAddress: PublicKey;
  priceUsd: BN; // u64 with 6 decimals
};

// --- Helper Functions ---
async function fetchJupiterPrices(mints: PublicKey[]): Promise<Record<string, number>> {
  const idsParam = mints.map(m => m.toBase58()).join(',');
  const url = `${JUP_PRICE_API}${idsParam}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch prices from Jupiter: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as Record<string, { usdPrice: number }>;
  const out: Record<string, number> = {};
  for (const k of Object.keys(json)) {
    out[k] = json[k].usdPrice;
  }
  return out;
}

// --- Setup Anchor provider & program ---
const projectDir = __dirname; // pointing inside defi-markets-contracts
const idlPath = join(projectDir, 'target/idl/vault_mvp.json');
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

// Load creator keypair (vault admin/creator)
const keypairPath = process.env.KEYPAIR || join(projectDir, 'keypairs/admin-keypair.json');
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8')))
);

const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new Wallet(payer);
const provider = new AnchorProvider(connection, wallet, {});
// Program ID is at the top level of the IDL
const programId = new PublicKey(idl.address);
const program = new Program(idl, provider);

async function getAccruedFeesPreview(vaultIndex: number, sharePrice?: number) {
  let step = 0;
  const log = (m: string) => console.log(`  ${m}`);

  log('📊 Checking accrued fees...');

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync([Buffer.from('factory_v2')], programId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
    programId
  );
  const [vaultStablecoin] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    programId
  );

  // Fetch vault account to get underlying assets
  let vaultAcct: any;
  try {
    vaultAcct = await (program.account as any).vault.fetch(vault);
  } catch (err) {
    const vaultInfo = await connection.getAccountInfo(vault);
    if (!vaultInfo) throw new Error('Vault account not found');
    vaultAcct = program.coder.accounts.decode('Vault', vaultInfo.data);
  }

  const underlyingAssets: Array<{ mintAddress: PublicKey; mintBps: number }> = 
    vaultAcct.underlyingAssets.map((a: any) => ({
      mintAddress: new PublicKey(a.mintAddress),
      mintBps: a.mintBps,
    }));

  // Derive vault-owned ATAs for each underlying asset
  const vaultAssetAtas: PublicKey[] = [];
  for (let i = 0; i < underlyingAssets.length; i++) {
    const asset = underlyingAssets[i];
    const ata = await getAssociatedTokenAddress(
      asset.mintAddress,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    vaultAssetAtas.push(ata);
  }

  // Fetch live prices from Jupiter
  const priceMap = await fetchJupiterPrices(underlyingAssets.map(a => a.mintAddress));

  // Build AssetPrice[] with 6-decimal fixed u64
  const assetPrices: AssetPrice[] = underlyingAssets.map(a => {
    const key = a.mintAddress.toBase58();
    const p = priceMap[key];
    if (p === undefined) {
      throw new Error(`Missing price for ${key} in Jupiter response`);
    }
    const priceScaled = Math.round(p * 1_000_000); // 6 decimals
    return { mintAddress: a.mintAddress, priceUsd: new BN(priceScaled) };
  });

  // Calculate share price if not provided
  let calculatedSharePrice: BN;
  if (sharePrice !== undefined && sharePrice > 0) {
    calculatedSharePrice = new BN(sharePrice);
  } else {
    const totalAssets = new BN(vaultAcct.totalAssets.toString());
    const totalSupply = new BN(vaultAcct.totalSupply.toString());
    
    if (totalSupply.isZero()) {
      throw new Error('Vault has no supply, cannot calculate share price');
    }

    const [vaultMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_mint'), vault.toBuffer()],
      programId
    );
    const vaultMintInfo = await getMint(connection, vaultMint);
    const scale = new BN(10).pow(new BN(vaultMintInfo.decimals));
    calculatedSharePrice = totalAssets.mul(scale).div(totalSupply);
  }

  // Prepare remaining accounts (readonly)
  const remaining = vaultAssetAtas.map(pubkey => ({
    pubkey,
    isSigner: false,
    isWritable: false,
  }));

  // Simulate get_accrued_management_fees
  const sim = await (program.methods as any)
    .getAccruedManagementFees(vaultIndex, assetPrices as any, calculatedSharePrice)
    .accounts({
      factory,
      vault,
      vaultStablecoinAccount: vaultStablecoin,
    })
    .remainingAccounts(remaining)
    .simulate();

  let result: any = null;
  if (sim.returnData && 'data' in sim.returnData) {
    try {
      const returnData = sim.returnData as { programId: PublicKey; data: [string, string] };
      if (returnData.programId.equals(programId)) {
        const dataBuffer = Buffer.from(returnData.data[0], 'base64');
        result = program.coder.types.decode('AccruedManagementFees', dataBuffer);
      }
    } catch (err) {
      // If decoding fails, we'll just show the vault's current accrued fees
    }
  }

  // If we got result, display it; otherwise show current vault state
  if (result) {
    const totalFees = result.totalAccruedFees || result.total_accrued_fees;
    const newlyAccrued = result.newlyAccruedFees || result.newly_accrued_fees;
    const previouslyAccrued = result.previouslyAccruedFees || result.previously_accrued_fees;
    
    log(`✅ Total Accrued Fees: ${totalFees.toString()} ($${(Number(totalFees) / 1_000_000).toFixed(6)})`);
    log(`   Previously Accrued: ${previouslyAccrued.toString()} ($${(Number(previouslyAccrued) / 1_000_000).toFixed(6)})`);
    log(`   Newly Accrued: ${newlyAccrued.toString()} ($${(Number(newlyAccrued) / 1_000_000).toFixed(6)})`);
    
    return Number(totalFees);
  } else {
    // Fallback: show current accrued fees from vault account
    const currentAccrued = new BN(vaultAcct.accruedManagementFeesUsdc || vaultAcct.accrued_management_fees_usdc || 0);
    log(`✅ Current Accrued Fees (from vault): ${currentAccrued.toString()} ($${(Number(currentAccrued) / 1_000_000).toFixed(6)})`);
    log(`   Note: This may not include newly accrued fees. Use --preview to see updated calculation.`);
    return Number(currentAccrued);
  }
}

async function claimManagementFee(vaultIndex: number, sharePrice?: number, managementFeesAmount?: number, showPreview: boolean = true) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Claiming management fees for vault index ${vaultIndex}`);

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

  // Fetch and decode accounts using Anchor's account API
  let factoryAcct: any;
  let vaultAcct: any;
  
  try {
    factoryAcct = await (program.account as any).factory.fetch(factory);
  } catch (err) {
    // Fallback to manual decode if fetch fails
    const factoryInfo = await connection.getAccountInfo(factory);
    if (!factoryInfo) throw new Error('Factory account not found');
    factoryAcct = program.coder.accounts.decode('Factory', factoryInfo.data);
  }

  try {
    vaultAcct = await (program.account as any).vault.fetch(vault);
  } catch (err) {
    // Fallback to manual decode if fetch fails
    const vaultInfo = await connection.getAccountInfo(vault);
    if (!vaultInfo) throw new Error('Vault account not found');
    vaultAcct = program.coder.accounts.decode('Vault', vaultInfo.data);
  }

  const creator = wallet.publicKey;
  const vaultAdmin = new PublicKey(vaultAcct.admin);
  const feeRecipient = new PublicKey(factoryAcct.feeRecipient);

  // Verify creator is the vault admin
  if (!creator.equals(vaultAdmin)) {
    throw new Error(`Creator ${creator.toBase58()} is not the vault admin ${vaultAdmin.toBase58()}`);
  }

  log(`Creator/Vault Admin: ${creator.toBase58()}`);
  log(`Fee Recipient: ${feeRecipient.toBase58()}`);

  // Get management fees amount (from preview or provided)
  let feesAmount: number;
  if (managementFeesAmount !== undefined && managementFeesAmount > 0) {
    feesAmount = managementFeesAmount;
    log(`Using provided management fees amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
  } else {
    // Show accrued fees preview and get amount
    if (showPreview) {
      log('\n📋 Preview of Accrued Fees:');
    }
    try {
      feesAmount = await getAccruedFeesPreview(vaultIndex, sharePrice);
      if (feesAmount === 0) {
        log('⚠️ No accrued fees available to claim.');
        throw new Error('No accrued fees to claim');
      }
      log(`Using calculated management fees amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
    } catch (err) {
      log(`⚠️ Could not fetch accrued fees: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
    if (showPreview) {
      log('');
    }
  }

  // Get vault mint decimals
  const vaultMintInfo = await getMint(connection, vaultMint);
  const vaultMintDecimals = vaultMintInfo.decimals;
  log(`Vault Mint Decimals: ${vaultMintDecimals}`);

  // Calculate share price if not provided
  // Share price = (total_assets * 10^decimals) / total_supply
  let calculatedSharePrice: BN;
  if (sharePrice !== undefined && sharePrice > 0) {
    calculatedSharePrice = new BN(sharePrice);
    log(`Using provided share price: ${sharePrice} (raw units)`);
  } else {
    const totalAssets = new BN(vaultAcct.totalAssets.toString());
    const totalSupply = new BN(vaultAcct.totalSupply.toString());
    
    if (totalSupply.isZero()) {
      throw new Error('Vault has no supply, cannot calculate share price');
    }

    // Share price = (total_assets * 10^decimals) / total_supply
    const scale = new BN(10).pow(new BN(vaultMintDecimals));
    calculatedSharePrice = totalAssets.mul(scale).div(totalSupply);
    
    log(`Calculated share price: ${calculatedSharePrice.toString()} (raw units)`);
    log(`  Total Assets: ${totalAssets.toString()} (${(Number(totalAssets) / 1_000_000).toFixed(6)} USDC)`);
    log(`  Total Supply: ${totalSupply.toString()} (${(Number(totalSupply) / Math.pow(10, vaultMintDecimals)).toFixed(6)} tokens)`);
    log(`  Share Price: ${(Number(calculatedSharePrice) / 1_000_000).toFixed(6)} USDC per token`);
  }

  // Derive recipient ATAs for vault tokens
  const creatorVaultAccount = await getAssociatedTokenAddress(
    vaultMint,
    creator,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const feeRecipientVaultAccount = await getAssociatedTokenAddress(
    vaultMint,
    feeRecipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  log(`Creator Vault Token Account: ${creatorVaultAccount.toBase58()}`);
  log(`Fee Recipient Vault Token Account: ${feeRecipientVaultAccount.toBase58()}`);

  // Ensure token accounts exist (required for minting)
  log('Ensuring vault token accounts exist...');
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    vaultMint,
    creator,
    false,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  log('✅ Creator vault token account ready');

  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    vaultMint,
    feeRecipient,
    false,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  log('✅ Fee recipient vault token account ready');

  // Call the program to claim fees
  log('Sending claimManagementFee instruction...');
  log(`  Vault Index: ${vaultIndex}`);
  log(`  Share Price: ${calculatedSharePrice.toString()} (raw units)`);
  log(`  Management Fees Amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
  const sig = await (program.methods as any)
    ['claimManagementFee'](new BN(vaultIndex), calculatedSharePrice, new BN(feesAmount))
    .accountsStrict({
      creator: creator,
      factory,
      vault,
      vaultMint,
      creatorVaultAccount,
      feeRecipientVaultAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  log(`✅ Claimed management fees. Tx: ${sig}`);
  log(`View transaction: https://explorer.solana.com/tx/${sig}?cluster=${RPC_URL.includes('mainnet') ? 'mainnet-beta' : 'devnet'}`);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const vaultIndexStr = args[0];
  const sharePriceStr = args[1];
  const feesAmountStr = args[2];
  const noPreview = args.includes('--no-preview');
  const previewOnly = args.includes('--preview');

  if (!vaultIndexStr) {
    console.error('Usage: npx ts-node claim_management_fee.ts <vault_index> [share_price] [management_fees_amount] [--preview] [--no-preview]');
    console.error('  vault_index: Index of the vault to claim fees from');
    console.error('  share_price: (optional) Share price in raw units. If not provided, calculated from total_assets / total_supply');
    console.error('  management_fees_amount: (optional) Management fees amount in raw USDC (6 decimals). If not provided, calculated from preview');
    console.error('  --preview: Only show accrued fees preview, do not claim');
    console.error('  --no-preview: Skip the accrued fees preview before claiming (requires management_fees_amount)');
    process.exit(1);
  }

  const vaultIndex = parseInt(vaultIndexStr, 10);
  const sharePrice = sharePriceStr ? parseInt(sharePriceStr, 10) : undefined;
  const managementFeesAmount = feesAmountStr ? parseInt(feesAmountStr, 10) : undefined;

  if (previewOnly) {
    // Only show preview
    console.log(`\n📊 Accrued Fees Preview for Vault ${vaultIndex}\n`);
    try {
      await getAccruedFeesPreview(vaultIndex, sharePrice);
    } catch (e) {
      console.error('Preview failed:', e);
      process.exit(1);
    }
  } else {
    // Claim with optional preview
    await claimManagementFee(vaultIndex, sharePrice, managementFeesAmount, !noPreview);
  }
}

main().catch((e) => {
  console.error('Fee claim failed:', e);
  process.exit(1);
});

