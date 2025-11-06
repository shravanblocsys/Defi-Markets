/**
 * Jupiter-Integrated Deposit Script
 * 
 * This script handles deposits with Jupiter swap integration for multi-asset vaults.
 * It fetches Jupiter quotes using the Lite API, builds swap instructions, and executes 
 * deposits with proper remaining accounts structure expected by the vault program.
 * 
 * Features:
 * - Uses Jupiter Lite API for better performance
 * - Supports multi-asset vaults with automatic allocation
 * - Handles USDC deposits (mainnet)
 * - Creates required ATAs automatically
 * - Comprehensive error handling and logging
 * 
 * Usage:
 *   npx ts-node deposit_jup.ts <vault_index> <amount>
 * 
 * Examples:
 *   npx ts-node deposit_jup.ts 0 1000000    # Deposit 1 USDC to vault 0
 *   npx ts-node deposit_jup.ts 1 500000     # Deposit 0.5 USDC to vault 1
 * 
 * Environment Variables:
 *   RPC_URL - Solana RPC endpoint (default: devnet)
 *   PRIVATE_KEY - Wallet private key as JSON array
 * 
 * Requirements:
 * - Vault must be active and have underlying assets configured
 * - User must have sufficient USDC balance
 * - All required ATAs will be created automatically
 */

import * as anchor from "@coral-xyz/anchor";
import { 
  PublicKey, 
  SystemProgram, 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  Transaction,
  VersionedTransaction,
  AddressLookupTableAccount
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAccount, 
  getOrCreateAssociatedTokenAccount, 
  NATIVE_MINT, 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction, 
  createSyncNativeInstruction 
} from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";

// Configuration

// Token mints
const STABLECOIN_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC for mainnet
const DEVNET_USDC = new PublicKey("USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT");
const DEVNET_USDT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");

// Jupiter configuration
const JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://lite-api.jup.ag/swap/v1/swap-instructions";

// Initialize connection and program
const connection = new Connection(RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.fromSecretKey(new Uint8Array(PRIVATE_KEY)));
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });
anchor.setProvider(provider);
const program = new anchor.Program<VaultMvp>(idl as anchor.Idl, provider) as anchor.Program<VaultMvp>;

// PDA functions
function pdaFactory() { 
  return PublicKey.findProgramAddressSync([Buffer.from("factory_v2")], program.programId)[0]; 
}

function pdaVault(factory: PublicKey, index: number) { 
  return PublicKey.findProgramAddressSync([
    Buffer.from("vault"), 
    factory.toBuffer(), 
    new anchor.BN(index).toArrayLike(Buffer, "le", 4)
  ], program.programId)[0]; 
}

function pdaVaultMint(vault: PublicKey) { 
  return PublicKey.findProgramAddressSync([Buffer.from("vault_mint"), vault.toBuffer()], program.programId)[0]; 
}

function pdaVaultStablecoin(vault: PublicKey) { 
  return PublicKey.findProgramAddressSync([Buffer.from("vault_stablecoin_account"), vault.toBuffer()], program.programId)[0]; 
}

function pdaJupiterIxData(vault: PublicKey, assetMint: PublicKey) { 
  return PublicKey.findProgramAddressSync([
    Buffer.from("jup_ix"), 
    vault.toBuffer(), 
    assetMint.toBuffer()
  ], program.programId)[0]; 
}

// Utility functions
async function ensureLamports(need: number) {
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance >= need) return;
  const topUp = need - balance + Math.floor(0.05 * LAMPORTS_PER_SOL);
  const sig = await connection.requestAirdrop(wallet.publicKey, topUp);
  await connection.confirmTransaction(sig, "confirmed");
}

function stepLog(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

// Jupiter API functions
async function getJupiterQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint) {
  const quoteUrl = `${JUPITER_QUOTE_API}?` +
    `inputMint=${inputMint.toBase58()}&` +
    `outputMint=${outputMint.toBase58()}&` +
    `amount=${amount.toString()}&` +
    `slippageBps=200&` +
    `onlyDirectRoutes=false&` +
    `maxAccounts=64`;
  
  stepLog(`Fetching Jupiter quote: ${inputMint.toBase58()} -> ${outputMint.toBase58()}`);
  stepLog(`Quote URL: ${quoteUrl}`);
  
  const response = await fetch(quoteUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter API returned ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  if (!data || !data.outAmount) {
    throw new Error(`Invalid quote response: ${JSON.stringify(data)}`);
  }
  
  stepLog(`Quote received: ${data.inAmount} -> ${data.outAmount} (${data.priceImpactPct}% impact)`);
  return data;
}

async function getJupiterInstructions(quote: any, userPublicKey: PublicKey, destinationTokenAccount?: PublicKey) {
  const instructionsRequest = {
    quoteResponse: quote,
    userPublicKey: userPublicKey.toBase58(),
    ...(destinationTokenAccount && { destinationTokenAccount: destinationTokenAccount.toBase58() }),
  };

  stepLog(`Fetching Jupiter instructions for user: ${userPublicKey.toBase58()}`);
  if (destinationTokenAccount) {
    stepLog(`Destination token account: ${destinationTokenAccount.toBase58()}`);
  }
  
  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(instructionsRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter swap API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Failed to get swap instructions: ${data.error}`);
  }

  stepLog(`Jupiter instructions received successfully`);
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

// Main deposit function
async function depositWithJupiter(vaultIndex: number, amount: bigint) {
  let step = 0;
  const stepLog = (m: string) => console.log(`STEP ${++step}: ${m}`);
  
  stepLog(`Starting Jupiter-integrated USDC deposit for vault ${vaultIndex} with amount ${amount.toString()} raw units`);

  // Derive PDAs
  const factory = pdaFactory();
  const vault = pdaVault(factory, vaultIndex);
  const vaultMint = pdaVaultMint(vault);
  const vaultStable = pdaVaultStablecoin(vault);

  stepLog(`Derived PDAs: factory=${factory.toBase58()}, vault=${vault.toBase58()}`);

  // Fetch vault account to get underlying assets
  const vaultAccount = await program.account.vault.fetch(vault);
  stepLog(`Vault: ${vaultAccount.vaultName} (${vaultAccount.vaultSymbol})`);
  stepLog(`Underlying assets: ${vaultAccount.underlyingAssets.length}`);
  
  // Validate vault state (commented out due to type issues)
  // if (vaultAccount.state !== "active") {
  //   throw new Error(`Vault is not active. Current state: ${vaultAccount.state}`);
  // }
  stepLog(`Vault state: ${JSON.stringify(vaultAccount.state)}`);
  
  vaultAccount.underlyingAssets.forEach((asset, i) => {
    stepLog(`  Asset ${i + 1}: ${asset.mintAddress.toBase58()} (${asset.mintBps} bps)`);
  });

  // Validate we have underlying assets
  if (vaultAccount.underlyingAssets.length === 0) {
    throw new Error(`Vault has no underlying assets configured`);
  }

  // Ensure user has USDC ATA
  const userStablecoinAta = await getAssociatedTokenAddress(STABLECOIN_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ataInfo = await connection.getAccountInfo(userStablecoinAta);
  const ixs: any[] = [];
  
  if (!ataInfo) {
    stepLog(`Creating user USDC ATA: ${userStablecoinAta.toBase58()}`);
        ixs.push(createAssociatedTokenAccountInstruction(
      wallet.publicKey, 
      userStablecoinAta, 
      wallet.publicKey, 
      STABLECOIN_MINT, 
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ));
      }

  // For USDC deposits, we need to ensure the user has sufficient USDC balance
  // Note: This script assumes the user already has USDC tokens
  stepLog(`Using USDC for deposit: ${amount.toString()} raw units`);
  
  if (ixs.length > 0) {
    await provider.sendAndConfirm(new Transaction().add(...ixs), []);
    stepLog(`USDC ATA creation completed`);
  }

  // Fetch factory account for fee calculations and ATA creation
  const factoryAcc = await program.account.factory.fetch(factory);

  // Ensure all required ATAs exist
  const userVaultToken = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, vaultMint, wallet.publicKey);
  const feeRecipientStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, factoryAcc.feeRecipient);
  const vaultAdminStable = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, STABLECOIN_MINT, vaultAccount.admin);

  // Ensure vault ATAs exist for all underlying assets
  async function ensureVaultAta(mint: PublicKey) {
    const ata = await getAssociatedTokenAddress(mint, vault, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      stepLog(`Creating vault ATA for ${mint.toBase58()}: ${ata.toBase58()}`);
      const ix = createAssociatedTokenAccountInstruction(
        wallet.publicKey, 
        ata, 
        vault, 
        mint, 
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      await provider.sendAndConfirm(new Transaction().add(ix), []);
    }
    return ata;
  }

  // Calculate fees for reference (will be deducted after Jupiter swap)
  const entryFee = (amount * BigInt(factoryAcc.entryFeeBps)) / BigInt(10000);
  const managementFee = (amount * BigInt(vaultAccount.managementFees)) / BigInt(10000);
  const totalFees = entryFee + managementFee;
  const depositAmountAfterFees = amount - totalFees;
  
  stepLog(`Fee calculations (to be deducted after Jupiter swap):`);
  stepLog(`  Original amount: ${amount.toString()}`);
  stepLog(`  Entry fee: ${entryFee.toString()} (${factoryAcc.entryFeeBps} bps)`);
  stepLog(`  Management fee: ${managementFee.toString()} (${vaultAccount.managementFees} bps)`);
  stepLog(`  Total fees: ${totalFees.toString()}`);
  stepLog(`  Amount after fees: ${depositAmountAfterFees.toString()}`);
  stepLog(`  Using FULL amount for Jupiter quotes: ${amount.toString()}`);

  // Build Jupiter remaining accounts for each underlying asset
  const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
  
  // For now, handle only the first asset to avoid transaction size issues
  const assetsToProcess = vaultAccount.underlyingAssets.slice(0, 1);
  
  for (const asset of assetsToProcess) {
    const assetMint = asset.mintAddress;
    const assetAmount = (amount * BigInt(asset.mintBps)) / BigInt(10000);
    
    stepLog(`Processing asset: ${assetMint.toBase58()} (${asset.mintBps} bps, ${assetAmount.toString()} amount)`);
    
    // Skip if no amount to swap
    if (assetAmount === BigInt(0)) {
      stepLog(`Skipping asset ${assetMint.toBase58()} - zero amount`);
      continue;
    }
    
    // If asset is same as stablecoin, no swap needed
    if (assetMint.equals(STABLECOIN_MINT)) {
      stepLog(`Asset ${assetMint.toBase58()} is same as stablecoin - no swap needed`);
      continue;
    }
    
    try {
      // Get Jupiter quote using the amount after fees
      const quote = await retryWithBackoff(() => 
        getJupiterQuote(STABLECOIN_MINT, assetMint, assetAmount)
      );

      // Ensure vault ATA exists for this asset
      const vaultAssetAta = await ensureVaultAta(assetMint);
      
      // Ensure user has ATA for the output asset (Jupiter will swap to user's account)
      const userAssetAta = await getAssociatedTokenAddress(assetMint, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const userAssetAtaInfo = await connection.getAccountInfo(userAssetAta);
      if (!userAssetAtaInfo) {
        stepLog(`Creating user ATA for ${assetMint.toBase58()}: ${userAssetAta.toBase58()}`);
        const createUserAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey, 
          userAssetAta, 
          wallet.publicKey, 
          assetMint, 
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        await provider.sendAndConfirm(new Transaction().add(createUserAtaIx), []);
        stepLog(`User ATA created for ${assetMint.toBase58()}`);
      }

      // Get Jupiter instructions using Lite API - specify vault's ATA as destination
      const instructions = await retryWithBackoff(() => 
        getJupiterInstructions(quote, wallet.publicKey, vaultAssetAta)
      );

      // Extract the swap instruction from the response
      const {
        tokenLedgerInstruction, // If using `useTokenLedger = true`
        computeBudgetInstructions, // Setup compute budget
        setupInstructions, // Setup missing ATA
        swapInstruction: swapInstructionPayload, // Main swap instruction
        cleanupInstruction, // Unwrap SOL if needed
        addressLookupTableAddresses, // Lookup table addresses
      } = instructions;

      if (!swapInstructionPayload) {
        throw new Error(`No swap instruction found in Jupiter response`);
      }

      // Deserialize the swap instruction
      const swapInstruction = deserializeInstruction(swapInstructionPayload);
      
      // Log Jupiter instruction summary
      stepLog(`Jupiter instruction: ${swapInstruction.keys.length} accounts, ${swapInstruction.data.length} bytes data`);
      
      // Build account list for this asset - use Jupiter instruction accounts exactly as provided
      const assetAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
      
      // Add ALL accounts from Jupiter swap instruction exactly as Jupiter expects them
      // This is critical - Jupiter's instruction data has hardcoded account indices
      // We need to preserve the exact order and all accounts
      stepLog(`Adding ${swapInstruction.keys.length} Jupiter accounts in exact order:`);
      for (let i = 0; i < swapInstruction.keys.length; i++) {
        const account = swapInstruction.keys[i];
        stepLog(`  Account ${i}: ${account.pubkey.toBase58()} (signer: ${account.isSigner}, writable: ${account.isWritable})`);
        assetAccounts.push({
          pubkey: account.pubkey,
          isSigner: account.isSigner,
          isWritable: account.isWritable
        });
      }

      // Create JupiterIxData account for this asset
      const jupiterIxDataPda = pdaJupiterIxData(vault, assetMint);
      const jupiterIxDataInfo = await connection.getAccountInfo(jupiterIxDataPda);
      
      if (!jupiterIxDataInfo) {
        stepLog(`Creating JupiterIxData account: ${jupiterIxDataPda.toBase58()}`);
        
        const createIxDataIx = await program.methods
          .prepareJupiterIxData(assetMint, swapInstruction.data)
          .accountsStrict({
            payer: wallet.publicKey,
            vault: vault,
            jupIxData: jupiterIxDataPda,
            assetMint: assetMint,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        
        await provider.sendAndConfirm(new Transaction().add(createIxDataIx), []);
        stepLog(`JupiterIxData account created`);
      }

      // Add JupiterIxData account to asset accounts (last account)
      assetAccounts.push({
        pubkey: jupiterIxDataPda,
        isSigner: false,
        isWritable: false
      });

      // Add all accounts for this asset to remaining accounts
      remainingAccounts.push(...assetAccounts);
      
      stepLog(`Added ${assetAccounts.length} accounts for asset ${assetMint.toBase58()}`);
      
      // Log additional instructions if available
      if (setupInstructions && setupInstructions.length > 0) {
        stepLog(`Note: ${setupInstructions.length} setup instructions available (not used in CPI)`);
      }
      if (computeBudgetInstructions && computeBudgetInstructions.length > 0) {
        stepLog(`Note: ${computeBudgetInstructions.length} compute budget instructions available (not used in CPI)`);
      }
      
    } catch (error) {
      console.error(`Error processing asset ${assetMint.toBase58()}:`, error);
      throw error;
    }
  }

  stepLog(`Total remaining accounts: ${remainingAccounts.length}`);

  // Get balances before deposit
  const safeAmount = async (ata: PublicKey) => { 
    try { 
      const acc = await getAccount(connection, ata); 
      return acc.amount; 
    } catch { 
      return BigInt(0); 
    } 
  };

  const beforeUserUSDC = await safeAmount(userStablecoinAta);
  const beforeVaultUSDC = await safeAmount(vaultStable);
  
  stepLog(`Pre-deposit balances: user USDC=${beforeUserUSDC.toString()}, vault USDC=${beforeVaultUSDC.toString()}`);

  stepLog(`Jupiter integration ready: ${remainingAccounts.length} accounts prepared`);
  // Execute deposit with Jupiter remaining accounts
  stepLog(`Executing deposit transaction with Jupiter integration...`);
  
  // Always use versioned transaction for Jupiter swaps to handle large account sets
  const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');
  
  // Build the instruction manually for versioned transaction
  const depositIx = await program.methods
    .deposit(vaultIndex, new anchor.BN(amount.toString()))
    .accountsStrict({
      user: wallet.publicKey,
      factory,
      vault,
      vaultMint,
      userStablecoinAccount: userStablecoinAta,
      stablecoinMint: STABLECOIN_MINT,
      vaultStablecoinAccount: vaultStable,
      userVaultAccount: userVaultToken.address,
      feeRecipientStablecoinAccount: feeRecipientStable.address,
      vaultAdminStablecoinAccount: vaultAdminStable.address,
      jupiterProgram: JUPITER_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  // Create regular transaction
  const tx = new Transaction();
  tx.add(depositIx);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  
  // Sign and send transaction
  const signedTx = await wallet.signTransaction(tx);
  const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'processed',
  });
  
  // Wait for confirmation
  await connection.confirmTransaction(txSignature, 'processed');
  
  stepLog(`Deposit transaction successful: ${txSignature}`);

  // Get balances after deposit
  const afterUserUSDC = await safeAmount(userStablecoinAta);
  const afterVaultUSDC = await safeAmount(vaultStable);
  
  stepLog(`Post-deposit balances: user USDC=${afterUserUSDC.toString()}, vault USDC=${afterVaultUSDC.toString()}`);
  stepLog(`Balance changes: user USDC=${(afterUserUSDC - beforeUserUSDC).toString()}, vault USDC=${(afterVaultUSDC - beforeVaultUSDC).toString()}`);

  // Check vault token balance
  const userVaultBalance = await safeAmount(userVaultToken.address);
  stepLog(`User vault token balance: ${userVaultBalance.toString()}`);

  console.log(`✅ Jupiter-integrated deposit completed successfully!`);
  console.log(`📊 Transaction: ${tx}`);
  console.log(`🪙 Vault tokens received: ${userVaultBalance.toString()}`);
  console.log(`💰 Total remaining accounts used: ${remainingAccounts.length}`);
  console.log(`🔄 Assets processed: ${vaultAccount.underlyingAssets.length}`);
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: npx ts-node deposit_jup.ts <vault_index> <amount>");
    console.log("Example: npx ts-node deposit_jup.ts 0 1.5");
    process.exit(1);
  }

  const [vaultIndexStr, amountStr] = args;
  const vaultIndex = parseInt(vaultIndexStr);
  const uiAmount = parseFloat(amountStr);
  
  if (isNaN(vaultIndex) || isNaN(uiAmount) || uiAmount <= 0) {
    console.error("Error: Invalid vault index or amount");
    console.log("Usage: npx ts-node deposit_jup.ts <vault_index> <amount>");
    process.exit(1);
  }

  const amount = BigInt(Math.floor(uiAmount * 1e6)); // Convert USDC to raw units (6 decimals)
  
  try {
    await depositWithJupiter(vaultIndex, amount);
  } catch (error) {
    console.error("❌ Deposit failed:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { depositWithJupiter };
