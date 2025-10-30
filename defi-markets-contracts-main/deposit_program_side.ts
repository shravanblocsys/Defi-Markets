import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  TransactionInstruction,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the program
const programId = new PublicKey('CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs');
const idl = JSON.parse(readFileSync(join(__dirname, 'target/idl/vault_mvp.json'), 'utf8'));

// Setup connection and wallets (user and admin)
const connection = new Connection('https://api.mainnet-beta.solana.com', 'processed');

// Admin (relayer) keypair pays for swap tx fees
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
);
const adminWallet = new Wallet(adminKeypair);
const adminProvider = new AnchorProvider(connection, adminWallet, {});
const programAdmin = new Program(idl, adminProvider);

// User keypair performs the deposit and funds the admin with SOL for fees
const userKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/personal-keypair.json'), 'utf8')))
);
const userWallet = new Wallet(userKeypair);
const userProvider = new AnchorProvider(connection, userWallet, {});
const programUser = new Program(idl, userProvider);

// Constants
const STABLECOIN_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://lite-api.jup.ag/swap/v1/swap-instructions";

// Helper function to retry with backoff
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

// Get Jupiter quote
async function getJupiterQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint) {
  const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64`;
  
  console.log(`[${new Date().toISOString()}] Fetching Jupiter quote: ${inputMint.toBase58()} -> ${outputMint.toBase58()}`);
  console.log(`[${new Date().toISOString()}] Quote URL: ${url}`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Failed to get quote: ${data.error}`);
  }
  
  console.log(`[${new Date().toISOString()}] Quote received: ${data.inAmount} -> ${data.outAmount} (${data.priceImpactPct}% impact)`);
  return data;
}

// Get Jupiter swap instructions
async function getJupiterInstructions(quote: any, userPublicKey: PublicKey, destinationTokenAccount?: PublicKey) {
  const requestBody: any = {
    quoteResponse: quote,
    userPublicKey: userPublicKey.toBase58(),
  };
  
  // If destination token account is provided, send output there instead of user's account
  if (destinationTokenAccount) {
    requestBody.destinationTokenAccount = destinationTokenAccount.toBase58();
  }
  
  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Failed to get swap instructions: ${data.error}`);
  }
  
  console.log(`[${new Date().toISOString()}] Jupiter instructions received successfully`);
  return data;
}

// Helper function to deserialize instruction
function deserializeInstruction(instruction: any) {
  return {
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: any) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  };
}

// Helper function to get address lookup table accounts
async function getAddressLookupTableAccounts(
  keys: string[]
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key))
  );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }
    return acc;
  }, new Array<AddressLookupTableAccount>());
}

async function depositProgramSide(vaultIndex: number, amount: bigint, etfSharePrice: bigint) {
  let step = 0;
  const stepLog = (m: string) => console.log(`STEP ${++step}: ${m}`);
  
  stepLog(`Starting program-side deposit for vault ${vaultIndex} with amount ${amount.toString()} raw units`);
  stepLog(`Using ETF share price (stablecoin units per share): ${etfSharePrice.toString()}`);

  // Derive PDAs (use programId constant)
  const [factory] = PublicKey.findProgramAddressSync(
    [Buffer.from('factory_v2')],
    programId
  );
  
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, "le", 4)],
    programId
  );

  stepLog(`Derived PDAs: factory=${factory.toBase58()}, vault=${vault.toBase58()}`);

  // Use hardcoded values for Phoenix Fund vault
  const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  const ETH_MINT = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
  
  const vaultAccount = {
    vaultName: "Phoenix Fund",
    vaultSymbol: "PHF", 
    underlyingAssets: [
      { mintAddress: WSOL_MINT, mintBps: 5000 }, // 50% WSOL
      { mintAddress: USDT_MINT, mintBps: 4000 }, // 40% USDT
      { mintAddress: ETH_MINT, mintBps: 1000 }   // 10% ETH
    ],
    managementFees: 200,
    admin: adminWallet.publicKey
  };
  
  stepLog(`Vault: ${vaultAccount.vaultName} (${vaultAccount.vaultSymbol})`);
  stepLog(`Underlying assets: ${vaultAccount.underlyingAssets.length}`);

  // Optional: user-funded SOL top-up amount (lamports) to include in same tx as deposit
  const feeLamportsArg = process.argv[4] ? BigInt(process.argv[4]) : BigInt(0);

  // STEP 1: Execute deposit instruction (handles fees and locks USDC)
  stepLog(`🔄 STEP 1: Executing deposit instruction...`);
  
  // Get user's USDC account
  const userUSDCAccountUser = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    userWallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userUSDCAccountAdmin = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    adminWallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Get vault's USDC account (using program's PDA derivation)
  const [vaultUSDCAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_stablecoin_account'), vault.toBuffer()],
    programId
  );

  // Check if vault's USDC account exists
  const vaultUSDCAccountInfo = await connection.getAccountInfo(vaultUSDCAccount);
  if (!vaultUSDCAccountInfo) {
    stepLog(`Vault USDC account does not exist yet: ${vaultUSDCAccount.toBase58()}`);
    stepLog(`It will be created by the program during deposit instruction`);
  } else {
    stepLog(`Vault USDC account already exists: ${vaultUSDCAccount.toBase58()}`);
    stepLog(`Account info: owner=${vaultUSDCAccountInfo.owner.toBase58()}, executable=${vaultUSDCAccountInfo.executable}, lamports=${vaultUSDCAccountInfo.lamports}`);
  }

  // Check user's USDC balance before deposit
  let beforeUserUSDC;
  try {
    beforeUserUSDC = await getAccount(connection, userUSDCAccountUser);
    stepLog(`Pre-deposit User USDC balance: ${beforeUserUSDC.amount.toString()}`);
  } catch (error) {
    stepLog(`⚠️ Could not read user USDC account, proceeding anyway: ${error}`);
    stepLog(`User USDC account: ${userUSDCAccountUser.toBase58()}`);
    beforeUserUSDC = { amount: BigInt(0) }; // Set default value
  }

  // Get vault mint PDA
  const [vaultMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_mint'), vault.toBuffer()],
    programId
  );
  stepLog(`Vault mint: ${vaultMint.toBase58()}`);

  // Get user's vault token account
  stepLog(`Creating/getting user vault token account...`);
  const userVaultTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    userKeypair,
    vaultMint, // vault token mint PDA
    userWallet.publicKey,
    false,
    'processed'
  );
  stepLog(`User vault token account: ${userVaultTokenAccount.address.toBase58()}`);

  // Get fee recipient account (factory admin)
  stepLog(`Getting fee recipient USDC account...`);
  const feeRecipientUSDCAccount = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    adminWallet.publicKey, // Using admin as fee recipient for simplicity
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  stepLog(`Fee recipient USDC account: ${feeRecipientUSDCAccount.toBase58()}`);

  // Build deposit instruction and optionally prepend SOL top-up transfer to admin; send as single user-signed tx
  stepLog(`Building deposit instruction...`);
  const depositIx = await programUser.methods
    .deposit(new BN(vaultIndex), new BN(amount.toString()), new BN(etfSharePrice.toString()))
    .accountsStrict({
      user: userWallet.publicKey,
      factory: factory,
      vault: vault,
      vaultMint: vaultMint,
      userStablecoinAccount: userUSDCAccountUser,
      stablecoinMint: STABLECOIN_MINT,
      vaultStablecoinAccount: vaultUSDCAccount,
      userVaultAccount: userVaultTokenAccount.address,
      feeRecipientStablecoinAccount: feeRecipientUSDCAccount,
      vaultAdminStablecoinAccount: feeRecipientUSDCAccount, // Using same account for simplicity
      jupiterProgram: JUPITER_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const ixs: TransactionInstruction[] = [];
  if (feeLamportsArg > BigInt(0)) {
    stepLog(`🔄 Topping up admin with ${feeLamportsArg.toString()} lamports for swap fees (same tx)`);
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: userWallet.publicKey,
        toPubkey: adminWallet.publicKey,
        lamports: Number(feeLamportsArg),
      })
    );
  }
  ixs.push(depositIx);

  const combinedTx = new Transaction().add(...ixs);
  const sig = await userProvider.sendAndConfirm(combinedTx, []);
  stepLog(`✅ Deposit (and optional admin top-up) successful: ${sig}`);

  // Check user's USDC balance after deposit
  let afterUserUSDC;
  try {
    afterUserUSDC = await getAccount(connection, userUSDCAccountUser);
    stepLog(`Post-deposit User USDC balance: ${afterUserUSDC.amount.toString()}`);
    stepLog(`USDC spent: ${(beforeUserUSDC.amount - afterUserUSDC.amount).toString()}`);
  } catch (error) {
    stepLog(`⚠️ Could not read user USDC account after deposit: ${error}`);
    afterUserUSDC = { amount: BigInt(0) }; // Set default value
  }

  // Note: admin top-up already included above if provided

  // Check vault's USDC balance
  let vaultUSDCBalance;
  try {
    vaultUSDCBalance = await getAccount(connection, vaultUSDCAccount);
    stepLog(`Vault USDC balance: ${vaultUSDCBalance.amount.toString()}`);
  } catch (error) {
    stepLog(`⚠️ Could not read vault USDC account: ${error}`);
    stepLog(`Vault USDC account: ${vaultUSDCAccount.toBase58()}`);
    vaultUSDCBalance = { amount: BigInt(0) }; // Set default value
  }

  // STEP 2: Execute Jupiter swaps for each underlying asset
  stepLog(`🔄 STEP 2: Executing Jupiter swaps...`);
  
  const swapResults = [];
  const totalUSDC = vaultUSDCBalance.amount;
  const numAssets = vaultAccount.underlyingAssets.length;
  
  stepLog(`Processing ${numAssets} assets for vault ${vaultIndex}`);
  
  // Handle large number of assets efficiently
  if (numAssets > 20) {
    stepLog(`⚠️ Large number of assets detected (${numAssets}). Using batch processing for efficiency.`);
    await processAssetsInBatches(vaultAccount.underlyingAssets, totalUSDC, vaultIndex, swapResults);
  } else {
    // Use existing sequential processing for smaller vaults
    await processAssetsSequentially(vaultAccount.underlyingAssets, totalUSDC, vaultIndex, swapResults);
  }
  // New function for batch processing large numbers of assets
  async function processAssetsInBatches(assets: any[], totalUSDC: bigint, vaultIndex: number, swapResults: any[]) {
    const BATCH_SIZE = 5; // Process 5 assets at a time
    const batches = [];
    
    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
      batches.push(assets.slice(i, i + BATCH_SIZE));
    }
    
    stepLog(`Processing ${batches.length} batches of assets`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      stepLog(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} assets)`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (asset, assetIndex) => {
        const globalIndex = batchIndex * BATCH_SIZE + assetIndex;
        return await processAssetSwap(asset, globalIndex, totalUSDC, vaultIndex);
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Log results and collect successful swaps
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          stepLog(`  ✅ Asset ${batchIndex * BATCH_SIZE + index + 1}: ${result.value.assetMint.toBase58()}`);
          swapResults.push(result.value);
        } else {
          stepLog(`  ❌ Asset ${batchIndex * BATCH_SIZE + index + 1}: ${result.reason || 'Unknown error'}`);
        }
      });
      
      // Wait between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        stepLog(`⏳ Waiting 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // New function for sequential processing (existing logic)
  async function processAssetsSequentially(assets: any[], totalUSDC: bigint, vaultIndex: number, swapResults: any[]) {
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const result = await processAssetSwap(asset, i, totalUSDC, vaultIndex);
      if (result) swapResults.push(result);
    }
  }

  // Extracted asset processing logic
  async function processAssetSwap(asset: any, assetIndex: number, totalUSDC: bigint, vaultIndex: number) {
  const assetMint = asset.mintAddress;
  const assetBps = asset.mintBps;
  
  // Calculate amount for this asset based on its allocation
  const assetAmount = (totalUSDC * BigInt(assetBps)) / BigInt(10000);
  
  stepLog(`🔄 Processing Asset ${assetIndex + 1}: ${assetMint.toBase58()}`);
  stepLog(`  Allocation: ${assetBps / 100}% (${assetBps} bps)`);
  stepLog(`  Amount to swap: ${assetAmount.toString()} USDC`);
  
  if (assetAmount === BigInt(0)) {
    stepLog(`  ⏭️ Skipping asset with 0 allocation`);
    return null;
  }
    
    // Get vault's token account for this asset
    const vaultAssetAccount = await getAssociatedTokenAddress(
      assetMint,
      vault,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Ensure vault has ATA for this asset
    const vaultAssetAccountInfo = await connection.getAccountInfo(vaultAssetAccount);
    if (!vaultAssetAccountInfo) {
      stepLog(`  Creating vault ATA for ${assetMint.toBase58()}: ${vaultAssetAccount.toBase58()}`);
      const createVaultAssetIx = createAssociatedTokenAccountInstruction(
        adminWallet.publicKey, // payer
        vaultAssetAccount, // associatedToken
        vault,            // owner
        assetMint,        // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(createVaultAssetIx);
      await adminProvider.sendAndConfirm(tx, []);
    }
    
    // Check pre-swap balance
    let beforeVaultAsset;
    try {
      beforeVaultAsset = await getAccount(connection, vaultAssetAccount);
      stepLog(`  Pre-swap vault balance: ${beforeVaultAsset.amount.toString()}`);
    } catch (error) {
      stepLog(`  Pre-swap vault balance: 0 (account not found)`);
      beforeVaultAsset = { amount: BigInt(0) };
    }
    
    // First, transfer USDC from vault to user for the swap
    stepLog(`  🔄 Transferring ${assetAmount.toString()} USDC from vault to admin for swap`);
    
    try {
      const transferTx = await retryWithBackoff(async () => {
        return await programAdmin.methods
          .transferVaultToUser(new BN(vaultIndex), new BN(assetAmount.toString()))
          .accountsStrict({
            user: adminWallet.publicKey,
            factory: factory,
            vault: vault,
            vaultStablecoinAccount: vaultUSDCAccount,
            userStablecoinAccount: userUSDCAccountAdmin,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }, 5); // 5 retries for RPC calls
      
      stepLog(`  ✅ Vault to user transfer successful: ${transferTx}`);
    } catch (error) {
      stepLog(`  ❌ Failed to transfer from vault to user after retries: ${error}`);
      stepLog(`  Continuing with next asset...`);
      continue;
    }
    
    // Execute Jupiter swap for this asset
    stepLog(`  🔄 Executing Jupiter swap (USDC -> ${assetMint.toBase58()})`);
    
    try {
      const quote = await retryWithBackoff(() => 
        getJupiterQuote(STABLECOIN_MINT, assetMint, assetAmount)
      );
      
      stepLog(`  Quote: ${assetAmount.toString()} USDC -> ${quote.outAmount} ${assetMint.toBase58()}`);
      
      const instructions = await retryWithBackoff(() => 
        getJupiterInstructions(quote, adminWallet.publicKey, vaultAssetAccount) // Admin as authority, send to vault asset account
      );
      
      // Deserialize the swap instruction
      const swapInstruction = deserializeInstruction(instructions.swapInstruction);
      
      // Create Jupiter swap transaction using versioned transactions
      const swapInstructions = [];
      
      // Add setup instructions if any
      if (instructions.setupInstructions && instructions.setupInstructions.length > 0) {
        for (const setupIx of instructions.setupInstructions) {
          swapInstructions.push(deserializeInstruction(setupIx));
        }
      }
      
      // Add compute budget instructions if any
      if (instructions.computeBudgetInstructions && instructions.computeBudgetInstructions.length > 0) {
        for (const computeIx of instructions.computeBudgetInstructions) {
          swapInstructions.push(deserializeInstruction(computeIx));
        }
      }
      
      // Add the main swap instruction
      swapInstructions.push(new TransactionInstruction({
        programId: swapInstruction.programId,
        keys: swapInstruction.keys,
        data: swapInstruction.data,
      }));
      
      // Add cleanup instructions if any
      if (instructions.cleanupInstruction) {
        swapInstructions.push(deserializeInstruction(instructions.cleanupInstruction));
      }
      
      // Get address lookup table accounts if provided
      const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
      if (instructions.addressLookupTableAddresses && instructions.addressLookupTableAddresses.length > 0) {
        addressLookupTableAccounts.push(
          ...(await getAddressLookupTableAccounts(instructions.addressLookupTableAddresses))
        );
      }
      
      // Create versioned transaction
      const blockhash = (await connection.getLatestBlockhash()).blockhash;
      const messageV0 = new TransactionMessage({
        payerKey: adminWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: swapInstructions,
      }).compileToV0Message(addressLookupTableAccounts);
      
      const swapTx = new VersionedTransaction(messageV0);
      
      stepLog(`  📤 Sending Jupiter swap transaction (versioned)...`);
      const signedSwapTx = await adminWallet.signTransaction(swapTx);
      const swapTxSignature = await retryWithBackoff(async () => {
        return await connection.sendRawTransaction(signedSwapTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'processed',
        });
      }, 5); // 5 retries for RPC calls
      
      stepLog(`  ⏳ Waiting for swap confirmation...`);
      await retryWithBackoff(async () => {
        return await connection.confirmTransaction(swapTxSignature, 'processed');
      }, 3); // 3 retries for confirmation
      stepLog(`  ✅ Jupiter swap successful: ${swapTxSignature}`);
      
      // Wait a moment for account updates
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check post-swap balance
      let afterSwapVaultAsset;
      try {
        afterSwapVaultAsset = await getAccount(connection, vaultAssetAccount);
        stepLog(`  Post-swap vault balance: ${afterSwapVaultAsset.amount.toString()}`);
        
        const swappedAmount = afterSwapVaultAsset.amount - beforeVaultAsset.amount;
        stepLog(`  ✅ Swapped amount: ${swappedAmount.toString()}`);
        
        swapResults.push({
          assetMint,
          assetBps,
          inputAmount: assetAmount,
          outputAmount: swappedAmount,
          vaultAccount: vaultAssetAccount,
          txSignature: swapTxSignature
        });
        
      } catch (error) {
        stepLog(`  ⚠️ Could not read post-swap balance: ${error}`);
        // Use estimated value from quote
        const estimatedOutput = BigInt(quote.outAmount);
        stepLog(`  Estimated swapped amount: ${estimatedOutput.toString()}`);
        
        swapResults.push({
          assetMint,
          assetBps,
          inputAmount: assetAmount,
          outputAmount: estimatedOutput,
          vaultAccount: vaultAssetAccount,
          txSignature: swapTxSignature
        });
      }
      
  } catch (error) {
    stepLog(`  ❌ Failed to swap for asset ${assetMint.toBase58()}: ${error}`);
    return null;
  }
  }
  
  // Summary of all swaps
  stepLog(`🎉 Program-side deposit and swap completed!`);
  stepLog(`📊 Swap Results Summary:`);
  stepLog(`  Total assets processed: ${vaultAccount.underlyingAssets.length}`);
  stepLog(`  Processing method: ${numAssets > 20 ? 'Batch processing' : 'Sequential processing'}`);
  
  // Check final vault USDC balance
  let finalVaultUSDC;
  try {
    finalVaultUSDC = await getAccount(connection, vaultUSDCAccount);
    stepLog(`Final Vault USDC balance: ${finalVaultUSDC.amount.toString()}`);
    stepLog(`Total USDC swapped: ${(vaultUSDCBalance.amount - finalVaultUSDC.amount).toString()}`);
  } catch (error) {
    stepLog(`⚠️ Could not read final vault USDC balance: ${error}`);
    stepLog(`Vault USDC account: ${vaultUSDCAccount.toBase58()}`);
    finalVaultUSDC = { amount: BigInt(0) }; // Set default value
  }
  
  stepLog(`📊 Final Summary:`);
  stepLog(`  Vault: ${vaultAccount.vaultName} (${vaultAccount.vaultSymbol})`);
  stepLog(`  Vault Address: ${vault.toBase58()}`);
  stepLog(`  Total Assets: ${vaultAccount.underlyingAssets.length}`);
  stepLog(`  Processing Method: ${numAssets > 50 ? 'Batch processing (5 assets per batch)' : 'Sequential processing'}`);
  stepLog(`  User Vault Tokens: Check user's vault token account`);
  
}

// Parse command line arguments
const args = process.argv.slice(2);
const vaultIndex = parseInt(args[0]);
const amount = BigInt(parseInt(args[1]) || 1000000); // Default to 1 USDC if not provided
const etfSharePrice = BigInt(parseInt(args[2]) || 1000000); // Default to 1.0 USDC per share if not provided

// Validate arguments
if (isNaN(vaultIndex)) {
  console.error("❌ Please provide a valid vault index. Usage: npx ts-node deposit_program_side.ts <vault_index> [amount]");
  console.error("📝 Example: npx ts-node deposit_program_side.ts 11 1000000");
  console.error("📝 Example: npx ts-node deposit_program_side.ts 11 (uses default 1 USDC)");
  console.error("");
  console.error("💡 This script implements the two-step program-side approach:");
  console.error("   Step 1: Program handles fee deduction and USDC locking");
  console.error("   Step 2: Client executes Jupiter swaps for vault's USDC");
  console.error("   ✨ Now supports up to 240 assets with batch processing for efficiency");
  process.exit(1);
}

console.log("🚀 Starting Program-Side Deposit + Jupiter Swaps");
console.log(`📊 Vault Index: ${vaultIndex}`);
console.log(`💰 Amount: ${amount.toString()} raw units (${(Number(amount) / 1000000).toFixed(6)} USDC)`);
console.log(`💹 ETF Share Price: ${etfSharePrice.toString()} (stablecoin units per share)`);
console.log("");

depositProgramSide(vaultIndex, amount, etfSharePrice).catch(console.error);
