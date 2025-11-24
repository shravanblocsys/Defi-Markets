import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  getMint,
  getAccount,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// --- Config ---
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const JUP_PRICE_API = 'https://lite-api.jup.ag/price/v3?ids=';

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
const programId = new PublicKey(idl.address);
const program = new Program(idl, provider);

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

async function getAccruedManagementFees(
  vaultIndex: number,
  sharePrice?: number,
  commitUpdate: boolean = false
) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Getting accrued management fees for vault index ${vaultIndex}`);

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

  log(`Factory: ${factory.toBase58()}`);
  log(`Vault: ${vault.toBase58()}`);
  log(`Vault Stablecoin: ${vaultStablecoin.toBase58()}`);

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

  log(`Found ${underlyingAssets.length} underlying assets`);

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
    log(`Asset[${i}] ${asset.mintAddress.toBase58()}: ${ata.toBase58()}`);
  }

  // Fetch live prices from Jupiter
  log('Fetching asset prices from Jupiter...');
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

  log('Asset prices:');
  assetPrices.forEach((price, i) => {
    log(`  [${i}] ${price.mintAddress.toBase58()}: $${(Number(price.priceUsd) / 1_000_000).toFixed(6)}`);
  });

  // Calculate share price if not provided
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

    // Get vault mint decimals
    const [vaultMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_mint'), vault.toBuffer()],
      programId
    );
    const vaultMintInfo = await getMint(connection, vaultMint);
    const scale = new BN(10).pow(new BN(vaultMintInfo.decimals));
    calculatedSharePrice = totalAssets.mul(scale).div(totalSupply);
    
    log(`Calculated share price: ${calculatedSharePrice.toString()} (raw units)`);
    log(`  Total Assets: ${totalAssets.toString()} (${(Number(totalAssets) / 1_000_000).toFixed(6)} USDC)`);
    log(`  Total Supply: ${totalSupply.toString()} (${(Number(totalSupply) / Math.pow(10, vaultMintInfo.decimals)).toFixed(6)} tokens)`);
  }

  // Prepare remaining accounts (readonly)
  const remaining = vaultAssetAtas.map(pubkey => ({
    pubkey,
    isSigner: false,
    isWritable: false,
  }));

  // Call get_accrued_management_fees
  log(commitUpdate ? 'Sending getAccruedManagementFees transaction...' : 'Simulating getAccruedManagementFees...');
  
  let result: any;
  if (commitUpdate) {
    const sig = await (program.methods as any)
      .getAccruedManagementFees(vaultIndex, assetPrices as any, calculatedSharePrice)
      .accounts({
        factory,
        vault,
        vaultStablecoinAccount: vaultStablecoin,
      })
      .remainingAccounts(remaining)
      .rpc();
    
    log(`✅ Transaction sent: ${sig}`);
    
    // Get return data from transaction
    const tx = await connection.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    
    if (tx?.meta && 'returnData' in tx.meta && tx.meta.returnData) {
      const returnData = tx.meta.returnData as { programId: PublicKey; data: [string, string] };
      if (returnData.programId.equals(programId)) {
        try {
          const dataBuffer = Buffer.from(returnData.data[0], 'base64');
          result = program.coder.types.decode('AccruedManagementFees', dataBuffer);
        } catch (err) {
          log('⚠️ Could not decode return data, but transaction succeeded');
        }
      }
    }
  } else {
    const sim = await (program.methods as any)
      .getAccruedManagementFees(vaultIndex, assetPrices as any, calculatedSharePrice)
      .accounts({
        factory,
        vault,
        vaultStablecoinAccount: vaultStablecoin,
      })
      .remainingAccounts(remaining)
      .simulate();
    
    log('✅ Simulation completed');
    if (sim.returnData && 'data' in sim.returnData) {
      try {
        const returnData = sim.returnData as { programId: PublicKey; data: [string, string] };
        if (returnData.programId.equals(programId)) {
          const dataBuffer = Buffer.from(returnData.data[0], 'base64');
          result = program.coder.types.decode('AccruedManagementFees', dataBuffer);
        }
      } catch (err) {
        log('⚠️ Could not decode return data from simulation');
      }
    }
  }

  // Display results
  if (result) {
    log('\n📊 Accrued Management Fees Results:');
    log(`  Vault Index: ${result.vaultIndex || result.vault_index}`);
    log(`  Vault Name: ${result.vaultName || result.vault_name}`);
    log(`  Vault Symbol: ${result.vaultSymbol || result.vault_symbol}`);
    log(`  Vault Admin: ${new PublicKey(result.vaultAdmin || result.vault_admin).toBase58()}`);
    log(`  Management Fee BPS: ${result.managementFeeBps || result.management_fee_bps}`);
    log(`  NAV: ${(result.nav || result.nav).toString()} ($${(Number(result.nav || result.nav) / 1_000_000).toFixed(6)})`);
    log(`  GAV: ${(result.gav || result.gav).toString()} ($${(Number(result.gav || result.gav) / 1_000_000).toFixed(6)})`);
    log(`  Last Fee Accrual: ${new Date(Number(result.lastFeeAccrualTs || result.last_fee_accrual_ts) * 1000).toISOString()}`);
    log(`  Current Timestamp: ${new Date(Number(result.currentTimestamp || result.current_timestamp) * 1000).toISOString()}`);
    log(`  Elapsed Seconds: ${(result.elapsedSeconds || result.elapsed_seconds).toString()}`);
    log(`  Previously Accrued Fees: ${(result.previouslyAccruedFees || result.previously_accrued_fees).toString()} ($${(Number(result.previouslyAccruedFees || result.previously_accrued_fees) / 1_000_000).toFixed(6)})`);
    log(`  Newly Accrued Fees: ${(result.newlyAccruedFees || result.newly_accrued_fees).toString()} ($${(Number(result.newlyAccruedFees || result.newly_accrued_fees) / 1_000_000).toFixed(6)})`);
    log(`  Total Accrued Fees: ${(result.totalAccruedFees || result.total_accrued_fees).toString()} ($${(Number(result.totalAccruedFees || result.total_accrued_fees) / 1_000_000).toFixed(6)})`);
    
    const assetBalances = result.assetBalances || result.asset_balances;
    if (assetBalances && assetBalances.length > 0) {
      log('\n  Asset Balances:');
      assetBalances.forEach((asset: any, i: number) => {
        const mint = new PublicKey(asset.mintAddress || asset.mint_address);
        log(`    [${i}] ${mint.toBase58()}:`);
        log(`        Balance: ${asset.balance.toString()}`);
        log(`        Price: $${(Number(asset.priceUsd || asset.price_usd) / 1_000_000).toFixed(6)}`);
        log(`        Value: $${(Number(asset.valueUsd || asset.value_usd) / 1_000_000).toFixed(6)}`);
      });
    }
  } else {
    log('⚠️ No return data available. Use --commit to get return data.');
  }

  return result;
}

async function distributeAccruedFees(vaultIndex: number, sharePrice?: number, managementFeesAmount?: number) {
  let step = 0;
  const log = (m: string) => console.log(`STEP ${++step}: ${m}`);

  log(`Distributing accrued fees as vault tokens for vault index ${vaultIndex}`);

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

  // Fetch accounts
  let factoryAcct: any;
  let vaultAcct: any;
  
  try {
    factoryAcct = await (program.account as any).factory.fetch(factory);
  } catch (err) {
    const factoryInfo = await connection.getAccountInfo(factory);
    if (!factoryInfo) throw new Error('Factory account not found');
    factoryAcct = program.coder.accounts.decode('Factory', factoryInfo.data);
  }

  try {
    vaultAcct = await (program.account as any).vault.fetch(vault);
  } catch (err) {
    const vaultInfo = await connection.getAccountInfo(vault);
    if (!vaultInfo) throw new Error('Vault account not found');
    vaultAcct = program.coder.accounts.decode('Vault', vaultInfo.data);
  }

  const feeRecipient = new PublicKey(factoryAcct.feeRecipient);
  const vaultAdmin = new PublicKey(vaultAcct.admin);

  log(`Fee Recipient: ${feeRecipient.toBase58()}`);
  log(`Vault Admin: ${vaultAdmin.toBase58()}`);

  // Get management fees amount (from calculation or provided)
  let feesAmount: number;
  if (managementFeesAmount !== undefined && managementFeesAmount > 0) {
    feesAmount = managementFeesAmount;
    log(`Using provided management fees amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
  } else {
    // Calculate fees amount using getAccruedManagementFees
    log('\n📋 Calculating accrued fees...');
    try {
      const result = await getAccruedManagementFees(vaultIndex, sharePrice, false);
      if (!result) {
        throw new Error('Could not get accrued fees result');
      }
      const totalFees = result.totalAccruedFees || result.total_accrued_fees;
      if (!totalFees || Number(totalFees) === 0) {
        throw new Error('No accrued fees to distribute');
      }
      feesAmount = Number(totalFees);
      log(`Using calculated management fees amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
    } catch (err) {
      log(`⚠️ Could not calculate accrued fees: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
    log('');
  }

  // Get vault mint decimals
  const vaultMintInfo = await getMint(connection, vaultMint);
  const vaultMintDecimals = vaultMintInfo.decimals;
  log(`Vault Mint Decimals: ${vaultMintDecimals}`);

  // Calculate share price if not provided
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

    const scale = new BN(10).pow(new BN(vaultMintDecimals));
    calculatedSharePrice = totalAssets.mul(scale).div(totalSupply);
    
    log(`Calculated share price: ${calculatedSharePrice.toString()} (raw units)`);
    log(`  Total Assets: ${totalAssets.toString()} (${(Number(totalAssets) / 1_000_000).toFixed(6)} USDC)`);
    log(`  Total Supply: ${totalSupply.toString()} (${(Number(totalSupply) / Math.pow(10, vaultMintDecimals)).toFixed(6)} tokens)`);
  }

  // Derive recipient ATAs for vault tokens
  const feeRecipientVaultAccount = await getAssociatedTokenAddress(
    vaultMint,
    feeRecipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const vaultAdminVaultAccount = await getAssociatedTokenAddress(
    vaultMint,
    vaultAdmin,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  log(`Fee Recipient Vault Token Account: ${feeRecipientVaultAccount.toBase58()}`);
  log(`Vault Admin Vault Token Account: ${vaultAdminVaultAccount.toBase58()}`);

  // Ensure token accounts exist
  log('Ensuring vault token accounts exist...');
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    vaultMint,
    vaultAdmin,
    false,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  log('✅ Vault admin vault token account ready');

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

  // Call the program to distribute fees
  log('Sending distributeAccruedFees instruction...');
  log(`  Vault Index: ${vaultIndex}`);
  log(`  Share Price: ${calculatedSharePrice.toString()} (raw units)`);
  log(`  Management Fees Amount: ${feesAmount} ($${(feesAmount / 1_000_000).toFixed(6)})`);
  const sig = await (program.methods as any)
    .distributeAccruedFees(new BN(vaultIndex), calculatedSharePrice, new BN(feesAmount))
    .accountsStrict({
      collector: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      vaultAdminVaultAccount,
      feeRecipientVaultAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  log(`✅ Distributed accrued fees as vault tokens. Tx: ${sig}`);
  log(`View transaction: https://explorer.solana.com/tx/${sig}?cluster=${RPC_URL.includes('mainnet') ? 'mainnet-beta' : 'devnet'}`);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const vaultIndexStr = args[1];
  const sharePriceStr = args[2];
  const feesAmountStr = args[3];
  const commitStr = args.includes('--commit');

  if (!command || !vaultIndexStr) {
    console.error('Usage:');
    console.error('  Get accrued fees:');
    console.error('    npx ts-node accrued_management_fees.ts get <vault_index> [share_price] [--commit]');
    console.error('  Distribute accrued fees:');
    console.error('    npx ts-node accrued_management_fees.ts distribute <vault_index> [share_price] [management_fees_amount]');
    console.error('  Both (get then distribute):');
    console.error('    npx ts-node accrued_management_fees.ts both <vault_index> [share_price] [--commit]');
    console.error('');
    console.error('Options:');
    console.error('  share_price: (optional) Share price in raw units. If not provided, calculated from total_assets / total_supply');
    console.error('  management_fees_amount: (optional) Management fees amount in raw USDC (6 decimals). If not provided, calculated from getAccruedManagementFees');
    console.error('  --commit: (optional) For "get" command, commit the update transaction instead of just simulating');
    process.exit(1);
  }

  const vaultIndex = parseInt(vaultIndexStr, 10);
  const sharePrice = sharePriceStr ? parseInt(sharePriceStr, 10) : undefined;
  const managementFeesAmount = feesAmountStr && !feesAmountStr.startsWith('--') ? parseInt(feesAmountStr, 10) : undefined;
  const commitUpdate = commitStr;

  try {
    if (command === 'get') {
      await getAccruedManagementFees(vaultIndex, sharePrice, commitUpdate);
    } else if (command === 'distribute') {
      await distributeAccruedFees(vaultIndex, sharePrice, managementFeesAmount);
    } else if (command === 'both') {
      console.log('\n=== STEP 1: Getting Accrued Management Fees ===\n');
      const result = await getAccruedManagementFees(vaultIndex, sharePrice, commitUpdate);
      let feesAmount: number | undefined;
      if (result) {
        const totalFees = result.totalAccruedFees || result.total_accrued_fees;
        if (totalFees) {
          feesAmount = Number(totalFees);
        }
      }
      console.log('\n=== STEP 2: Distributing Accrued Fees ===\n');
      await distributeAccruedFees(vaultIndex, sharePrice, feesAmount);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (e) {
    console.error('Operation failed:', e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});

