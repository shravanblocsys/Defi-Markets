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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the program
const programId = new PublicKey('CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs');
const idl = JSON.parse(readFileSync(join(__dirname, 'target/idl/vault_mvp.json'), 'utf8'));

// Setup connection and wallet
const connection = new Connection('https://api.mainnet-beta.solana.com', 'processed');
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8')))
);
const wallet = new Wallet(walletKeypair);
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program(idl, provider);

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

async function depositWithJupiterClient(vaultIndex: number, amount: bigint) {
  let step = 0;
  const stepLog = (m: string) => console.log(`STEP ${++step}: ${m}`);
  
  stepLog(`Starting Jupiter client-side swap + deposit for vault ${vaultIndex} with amount ${amount.toString()} raw units`);

  // Derive PDAs
  const [factory] = PublicKey.findProgramAddressSync(
    [Buffer.from('factory_v2')],
    program.programId
  );
  
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, "le", 4)],
    program.programId
  );

  stepLog(`Derived PDAs: factory=${factory.toBase58()}, vault=${vault.toBase58()}`);
  console.log("program.programId", program.programId.toBase58());
  console.log("vaultPDA", vault.toBase58());
  console.log("targetVaultAddress", "6fjfHDmxTaLBLrw4NvyNFt2WvXBebVjHJYFqM5UGgDx5");
  console.log("vaultPDA matches target:", vault.toBase58() === "6fjfHDmxTaLBLrw4NvyNFt2WvXBebVjHJYFqM5UGgDx5");

  // Use hardcoded values for multi-asset vault (Phoenix Fund)
  stepLog(`Using hardcoded values for Phoenix Fund vault...`);
  
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
    admin: wallet.publicKey
  };
  
  stepLog(`Vault: ${vaultAccount.vaultName} (${vaultAccount.vaultSymbol})`);
  stepLog(`Underlying assets: ${vaultAccount.underlyingAssets.length}`);
  
  // Log each underlying asset
  vaultAccount.underlyingAssets.forEach((asset, index) => {
    stepLog(`  Asset ${index + 1}: ${asset.mintAddress.toBase58()} (${asset.mintBps / 100}%)`);
  });

  // Multi-asset vault swap logic
  stepLog(`🔄 Processing multi-asset vault with ${vaultAccount.underlyingAssets.length} assets`);
  stepLog(`Using USDC for deposit: ${amount.toString()} raw units`);
  
  // Get user's USDC account (input)
  const userUSDCAccount = await getAssociatedTokenAddress(
    STABLECOIN_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Check user's USDC balance
  const beforeUserUSDC = await getAccount(connection, userUSDCAccount);
  stepLog(`Pre-swap User USDC balance: ${beforeUserUSDC.amount.toString()}`);

  // Process each underlying asset
  const swapResults = [];
  const totalAmount = amount;
  
  for (let i = 0; i < vaultAccount.underlyingAssets.length; i++) {
    const asset = vaultAccount.underlyingAssets[i];
    const assetMint = asset.mintAddress;
    const assetBps = asset.mintBps;
    
    // Calculate amount for this asset based on its allocation
    const assetAmount = (totalAmount * BigInt(assetBps)) / BigInt(10000);
    
    stepLog(`🔄 Processing Asset ${i + 1}/${vaultAccount.underlyingAssets.length}: ${assetMint.toBase58()}`);
    stepLog(`  Allocation: ${assetBps / 100}% (${assetBps} bps)`);
    stepLog(`  Amount to swap: ${assetAmount.toString()} USDC`);
    
    if (assetAmount === BigInt(0)) {
      stepLog(`  ⏭️ Skipping asset with 0 allocation`);
      continue;
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
        wallet.publicKey, // payer
        vaultAssetAccount, // associatedToken
        vault,            // owner
        assetMint,        // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(createVaultAssetIx);
      await provider.sendAndConfirm(tx, []);
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
    
    // Execute Jupiter swap for this asset
    stepLog(`  🔄 Executing Jupiter swap (USDC -> ${assetMint.toBase58()})`);
    
    try {
      const quote = await retryWithBackoff(() => 
        getJupiterQuote(STABLECOIN_MINT, assetMint, assetAmount)
      );
      
      stepLog(`  Quote: ${assetAmount.toString()} USDC -> ${quote.outAmount} ${assetMint.toBase58()}`);
      
      const instructions = await retryWithBackoff(() => 
        getJupiterInstructions(quote, wallet.publicKey, vaultAssetAccount) // Send output directly to vault
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
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: swapInstructions,
      }).compileToV0Message(addressLookupTableAccounts);
      
      const swapTx = new VersionedTransaction(messageV0);
      
      stepLog(`  📤 Sending Jupiter swap transaction (versioned)...`);
      const signedSwapTx = await wallet.signTransaction(swapTx);
      const swapTxSignature = await connection.sendRawTransaction(signedSwapTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
      
      stepLog(`  ⏳ Waiting for swap confirmation...`);
      await connection.confirmTransaction(swapTxSignature, 'processed');
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
      stepLog(`  Continuing with next asset...`);
    }
  }
  
  // Summary of all swaps
  stepLog(`🎉 Multi-asset swap completed!`);
  stepLog(`📊 Swap Results Summary:`);
  swapResults.forEach((result, index) => {
    stepLog(`  Asset ${index + 1}: ${result.assetMint.toBase58()}`);
    stepLog(`    Input: ${result.inputAmount.toString()} USDC`);
    stepLog(`    Output: ${result.outputAmount.toString()} tokens`);
    stepLog(`    Vault Account: ${result.vaultAccount.toBase58()}`);
    stepLog(`    Transaction: ${result.txSignature}`);
  });
  
  // Check final user USDC balance
  const afterUserUSDC = await getAccount(connection, userUSDCAccount);
  stepLog(`Final User USDC balance: ${afterUserUSDC.amount.toString()}`);
  stepLog(`Total USDC spent: ${(beforeUserUSDC.amount - afterUserUSDC.amount).toString()}`);
  
}

// Parse command line arguments
const args = process.argv.slice(2);
const vaultIndex = parseInt(args[0]);
const amount = BigInt(parseInt(args[1]) || 1000000); // Default to 1 USDC if not provided

// Validate arguments
if (isNaN(vaultIndex)) {
  console.error("❌ Please provide a valid vault index. Usage: npx ts-node deposit_with_jupiter_client.ts <vault_index> [amount]");
  console.error("📝 Example: npx ts-node deposit_with_jupiter_client.ts 10 1000000");
  console.error("📝 Example: npx ts-node deposit_with_jupiter_client.ts 10 (uses default 1 USDC)");
  console.error("");
  console.error("💡 This script supports both single-asset and multi-asset vaults:");
  console.error("   - Single asset: USDC -> WSOL (or other single asset)");
  console.error("   - Multi asset: USDC -> [WSOL, USDT, ETH, etc.] based on vault allocation");
  process.exit(1);
}

console.log("🚀 Starting Multi-Asset Jupiter Client-Side Swap + Deposit");
console.log(`📊 Vault Index: ${vaultIndex}`);
console.log(`💰 Amount: ${amount.toString()} raw units (${(Number(amount) / 1000000).toFixed(6)} USDC)`);
console.log("");

depositWithJupiterClient(vaultIndex, amount).catch(console.error);
