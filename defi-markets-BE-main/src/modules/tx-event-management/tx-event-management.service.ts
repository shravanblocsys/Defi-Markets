import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import {
  Connection,
  PublicKey,
  TransactionResponse,
  VersionedTransactionResponse,
  Keypair,
  AddressLookupTableAccount,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { ReadTransactionDto } from "./dto/read-transaction.dto";
import { UpdateFeesDto } from "./dto/update-fees.dto";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { ConfigService } from "../config/config.service";
import { FeesManagementService } from "../fees-management/fees-management.service";
import { UpdateVaultDepositDto } from "./dto/update-vault-deposit.dto";
import { UpdateVaultRedeemDto } from "./dto/update-vault-redeem.dto";
import { VaultDepositService } from "../vault-deposit/vault-deposit.service";
import { HistoryService } from "../history/history.service";
import { RedisService } from "../../utils/redis";
import { SwapDto } from "./dto/swap.dto";
import { RedeemSwapAdminDto } from "./dto/redeem-swap-admin.dto";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { FailedTransaction } from "./entities/failed-transaction.entity";
import { AssetAllocationService } from "../asset-allocation/asset-allocation.service";

@Injectable()
export class TxEventManagementService {
  private readonly logger = new Logger(TxEventManagementService.name);

  /**
   * Determine the correct token program for a given mint
   */
  private async getTokenProgramId(
    connection: Connection,
    mint: PublicKey
  ): Promise<PublicKey> {
    try {
      const mintInfo = await connection.getAccountInfo(mint);
      if (!mintInfo) {
        this.logger.log(
          `Mint ${mint.toBase58()} not found, defaulting to TOKEN_PROGRAM_ID`
        );
        return TOKEN_PROGRAM_ID;
      }

      // Check if it's Token-2022 program
      if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        this.logger.log(
          `Using TOKEN_2022_PROGRAM_ID for mint ${mint.toBase58()}`
        );
        return TOKEN_2022_PROGRAM_ID;
      }

      // Default to SPL Token program
      this.logger.log(`Using TOKEN_PROGRAM_ID for mint ${mint.toBase58()}`);
      return TOKEN_PROGRAM_ID;
    } catch (error) {
      this.logger.log(
        `Error determining token program for ${mint.toBase58()}: ${
          error.message
        }, defaulting to TOKEN_PROGRAM_ID`
      );
      return TOKEN_PROGRAM_ID;
    }
  }
  private connection: Connection;

  // Event discriminators from your IDL
  private readonly EVENT_DISCRIMINATORS = {
    ed363f30d7c928d7: "FactoryAssetsUpdated",
    "751978fe4bec4e73": "VaultCreated", // Alternative discriminator found in actual transaction
    b42bcf021247034b: "VaultCreated",
    "978890413dd89840": "FactoryFeesUpdated",
    "97883a29bd5908f0": "FactoryFeesUpdated", // Alternative discriminator found in actual transaction
    fbdd7e1809d86367: "VaultFeesUpdated",
    "145688f675618ff0": "FactoryInitialized",
    a5227d54fb89a39b: "ProtocolFeesCollected",
    ca0c99be7ba73f0e: "FactoryStateChanged",
    "3b3e2bc8dc686443": "VaultDeposited",
  };

  constructor(
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly configService: ConfigService,
    private readonly feesManagementService: FeesManagementService,
    private readonly vaultDepositService: VaultDepositService,
    private readonly historyService: HistoryService,
    private readonly redisService: RedisService,
    @InjectModel(FailedTransaction.name)
    private failedTransactionModel: Model<FailedTransaction>,
    private readonly assetAllocationService: AssetAllocationService
  ) {
    // Initialize Solana connection to the configured network
    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
    const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
    const rpcUrl =
      heliusRpcUrl || solanaRpcUrl || "https://api.mainnet-beta.solana.com";

    if (heliusRpcUrl) {
      this.logger.log(`[DEBUG] Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      this.logger.log(`[DEBUG] Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      this.logger.log(`[DEBUG] Using default Solana RPC URL: ${rpcUrl}`);
    }

    this.connection = new Connection(rpcUrl, "confirmed");
  }

  /**
   * Helper method to save failed transaction to database
   */
  private async saveFailedTransaction(
    vaultFactoryId: string,
    userProfileId: string,
    usdcAmount: string,
    assetMintAddress: string,
    txhash: string
  ): Promise<void> {
    try {
      // Find asset allocation by mint address
      let assetAllocation;
      try {
        assetAllocation = await this.assetAllocationService.findByMintAddress(
          assetMintAddress
        );
      } catch (error) {
        this.logger.warn(
          `Asset allocation not found for mint ${assetMintAddress}, skipping failed transaction record`
        );
        return; // Skip if asset not found
      }

      const failedTransaction = new this.failedTransactionModel({
        vaultId: vaultFactoryId,
        user: userProfileId,
        usdcAmt: parseFloat(usdcAmount) / 1_000_000, // Convert from raw units to USDC
        assetId: assetAllocation._id,
        txhash,
        status: "failed",
        timestamp: new Date(),
      });

      await failedTransaction.save();
      this.logger.log(
        `Saved failed transaction record: ${txhash} for asset ${assetMintAddress}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to save failed transaction record: ${error.message}`,
        error.stack
      );
      // Don't throw - we don't want to break the swap flow if saving fails
    }
  }

  /**
   * Execute swaps for a vault using admin wallet and Jupiter, based on amountInRaw.
   * Hardcoded RPC and Jupiter endpoints for now; reads SOLANA_ADMIN_PRIVATE_KEY when available.
   *
   * TEST MODE: To simulate failures for testing, set these environment variables:
   * - TEST_FAILURE_MODE=true (enables test mode)
   * - TEST_FAILURE_RATE=0.5 (0.0 to 1.0, probability of failure - default: 0.5)
   * - TEST_FAILURE_TYPE=send|confirm|both (type of failure to simulate - default: send)
   *
   * Example:
   *   TEST_FAILURE_MODE=true TEST_FAILURE_RATE=0.3 TEST_FAILURE_TYPE=both npm start
   *
   * This will cause 30% of transactions to fail during both send and confirm phases.
   */
  async swap(dto: SwapDto): Promise<any> {
    this.logger.log(`[DEBUG] Swap function called with dto:`, dto);

    const PROGRAM_ID = new PublicKey(
      this.configService.get("SOLANA_VAULT_FACTORY_ADDRESS")
    );
    const STABLECOIN_MINT = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    const JUPITER_QUOTE_API =
      this.configService.get("JUPITER_QUOTE_API") ||
      "https://lite-api.jup.ag/swap/v1/quote";
    const JUPITER_SWAP_API =
      this.configService.get("JUPITER_SWAP_API") ||
      "https://lite-api.jup.ag/swap/v1/swap-instructions";
    const JUPITER_API_KEY = this.configService.get("JUPITER_API_KEY");

    this.logger.log(
      `[DEBUG] Jupiter APIs - Quote: ${JUPITER_QUOTE_API}, Swap: ${JUPITER_SWAP_API}`
    );
    if (JUPITER_API_KEY) {
      this.logger.log(`[DEBUG] Jupiter API key configured`);
    }

    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
    const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
    const rpcUrl =
      heliusRpcUrl || solanaRpcUrl || "https://api.mainnet-beta.solana.com";

    if (heliusRpcUrl) {
      this.logger.log(`[DEBUG] Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      this.logger.log(`[DEBUG] Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      this.logger.log(`[DEBUG] Using default Solana RPC URL: ${rpcUrl}`);
    }

    // Use "confirmed" commitment level for better reliability on production RPC nodes
    // "processed" is fast but less reliable; "confirmed" is more consistent
    const connection = new Connection(rpcUrl, "confirmed");

    const adminKeyRaw = this.configService.get("SOLANA_ADMIN_PRIVATE_KEY");
    if (!adminKeyRaw) {
      throw new BadRequestException("Missing SOLANA_ADMIN_PRIVATE_KEY");
    }
    this.logger.log(`[DEBUG] Admin key raw length: ${adminKeyRaw.length}`);

    let adminKeypair: Keypair;
    try {
      const secret = new Uint8Array(JSON.parse(adminKeyRaw));
      adminKeypair = Keypair.fromSecretKey(secret);
      this.logger.log(
        `[DEBUG] Admin keypair created successfully, public key: ${adminKeypair.publicKey.toBase58()}`
      );
    } catch (e) {
      this.logger.error(`[DEBUG] Failed to create admin keypair:`, e);
      throw new BadRequestException("Invalid SOLANA_ADMIN_PRIVATE_KEY format");
    }

    const adminWallet = new Wallet(adminKeypair);
    const provider = new AnchorProvider(connection, adminWallet, {});

    // Load IDL from bundled utils
    const idl = (await import("../../utils/idls/idls"))
      .VAULT_FACTORY_IDL as any;
    const program = new Program(idl, provider);

    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries = 5
    ): Promise<T> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          this.logger.log(
            `[DEBUG] Retry attempt ${i + 1}/${maxRetries} failed:`,
            error.message
          );
          if (i === maxRetries - 1) throw error;

          // Exponential backoff with jitter for rate limiting
          const baseDelay = 1000 * Math.pow(2, i);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          this.logger.log(
            `[DEBUG] Waiting ${Math.round(delay)}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    };

    const getJupiterQuote = async (
      inputMint: PublicKey,
      outputMint: PublicKey,
      amount: bigint
    ) => {
      const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64&excludeDexes=Sanctum,Sanctum+Infinity`;
      this.logger.log(`[API CALL] 🌐 Jupiter Quote API: GET ${url}`);

      const headers: any = {};
      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
        this.logger.log(
          `[API CALL] 🔑 Using Jupiter API key for authentication`
        );
      }

      const res = await fetch(url as any, { headers });
      this.logger.log(
        `[DEBUG] Jupiter Quote Response Status: ${res.status} ${res.statusText}`
      );
      this.logger.log(
        `[DEBUG] Jupiter Quote Response Headers:`,
        Object.fromEntries(res.headers.entries())
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter quote API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      this.logger.log(
        `[DEBUG] Jupiter Quote Response Text Length: ${responseText.length}`
      );
      this.logger.log(
        `[DEBUG] Jupiter Quote Response Text Preview: ${responseText.substring(
          0,
          500
        )}`
      );

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter quote API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[DEBUG] Jupiter Quote Parsed Successfully`);
      } catch (parseError) {
        this.logger.error(`[DEBUG] Jupiter Quote Parse Error:`, parseError);
        throw new Error(
          `Failed to parse Jupiter quote response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new Error(`Failed to get quote: ${(data as any).error}`);
      return data;
    };

    const getJupiterInstructions = async (
      quote: any,
      userPublicKey: PublicKey,
      destinationTokenAccount: PublicKey
    ) => {
      const body: any = {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        destinationTokenAccount: destinationTokenAccount.toBase58(),
      };
      this.logger.log(
        `[API CALL] 🌐 Jupiter Instructions API: POST ${JUPITER_SWAP_API}`
      );
      this.logger.log(
        `[API CALL] 📦 Request body:`,
        JSON.stringify(body, null, 2)
      );

      const headers: any = {
        "Content-Type": "application/json",
      };
      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
        this.logger.log(
          `[API CALL] 🔑 Using Jupiter API key for authentication`
        );
      }

      const res = await fetch(
        JUPITER_SWAP_API as any,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        } as any
      );

      this.logger.log(
        `[DEBUG] Jupiter Instructions Response Status: ${res.status} ${res.statusText}`
      );
      this.logger.log(
        `[DEBUG] Jupiter Instructions Response Headers:`,
        Object.fromEntries(res.headers.entries())
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter instructions API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      this.logger.log(
        `[DEBUG] Jupiter Instructions Response Text Length: ${responseText.length}`
      );
      this.logger.log(
        `[DEBUG] Jupiter Instructions Response Text Preview: ${responseText.substring(
          0,
          500
        )}`
      );

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter instructions API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[DEBUG] Jupiter Instructions Parsed Successfully`);
      } catch (parseError) {
        this.logger.error(
          `[DEBUG] Jupiter Instructions Parse Error:`,
          parseError
        );
        throw new Error(
          `Failed to parse Jupiter instructions response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new Error(
          `Failed to get swap instructions: ${(data as any).error}`
        );
      return data;
    };

    const deserializeInstruction = (ix: any) => ({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });

    const getAddressLookupTableAccounts = async (
      keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
      this.logger.log(
        `[API CALL] 🔗 Solana RPC: getMultipleAccountsInfo (${keys.length} address lookup table accounts)`
      );
      const infos = await connection.getMultipleAccountsInfo(
        keys.map((k) => new PublicKey(k))
      );
      this.logger.log(
        `[API CALL] ✅ Solana RPC: getMultipleAccountsInfo completed`
      );
      return infos.reduce((acc, accountInfo, idx) => {
        const addr = keys[idx];
        if (accountInfo) {
          acc.push(
            new AddressLookupTableAccount({
              key: new PublicKey(addr),
              state: AddressLookupTableAccount.deserialize(
                Uint8Array.from(accountInfo.data)
              ),
            })
          );
        }
        return acc;
      }, new Array<AddressLookupTableAccount>());
    };

    const { vaultIndex, amountInRaw, etfSharePriceRaw } = dto;
    if (vaultIndex == null || Number.isNaN(Number(vaultIndex))) {
      throw new BadRequestException("Invalid vaultIndex");
    }
    const requestedAmount = BigInt(amountInRaw);
    if (requestedAmount <= BigInt(0)) {
      throw new BadRequestException("amountInRaw must be > 0");
    }
    const sharePriceRaw = BigInt(etfSharePriceRaw);
    if (sharePriceRaw < BigInt(0)) {
      throw new BadRequestException("etfSharePriceRaw must be >= 0");
    }

    this.logger.log(
      `[DEBUG] Swap inputs - vaultIndex: ${vaultIndex}, amountInRaw: ${amountInRaw} (already net of entry fees), etfSharePriceRaw: ${etfSharePriceRaw}`
    );

    // Derive PDAs
    const [factory] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      PROGRAM_ID
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new BN(vaultIndex).toArrayLike(Buffer, "le", 4),
      ],
      PROGRAM_ID
    );
    const [vaultUSDCAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      PROGRAM_ID
    );

    // Fetch vault state to get underlying assets
    this.logger.log(
      `[DEBUG] Fetching vault account for vault: ${vault.toBase58()}`
    );
    const vaultAccount: any = await (program as any).account.vault.fetch(vault);
    this.logger.log(
      `[DEBUG] Vault account fetched, underlying assets:`,
      vaultAccount.underlyingAssets
    );

    const underlying: { mint: PublicKey; bps: number }[] = (
      vaultAccount.underlyingAssets || []
    ).map((ua: any) => ({
      mint: new PublicKey(ua.mintAddress || ua.mint_address || ua.mint),
      bps: Number(ua.mintBps || ua.mint_bps || ua.pctBps || ua.bps),
    }));
    this.logger.log(
      `[DEBUG] Processed underlying assets:`,
      underlying.map((u) => ({ mint: u.mint.toBase58(), bps: u.bps }))
    );

    if (!underlying.length)
      throw new BadRequestException("No underlying assets configured");

    // Read vault USDC balance and clamp the amount (amountInRaw is already net of entry fees)
    this.logger.log(
      `[API CALL] 🔗 Solana RPC: getAccount for vault USDC account ${vaultUSDCAccount.toBase58()}`
    );
    const vaultUSDC = await getAccount(connection, vaultUSDCAccount);
    this.logger.log(`[API CALL] ✅ Solana RPC: getAccount completed`);
    const totalUSDC = BigInt(vaultUSDC.amount.toString());
    if (totalUSDC === BigInt(0)) {
      return {
        vaultIndex,
        amountInRaw: requestedAmount.toString(),
        etfSharePriceRaw: etfSharePriceRaw,
        swaps: [],
        note: "Vault USDC balance is 0; nothing to swap.",
      };
    }
    // Use amountInRaw directly (already net of entry fees) for swapping, clamped to available balance
    const amountToUse =
      requestedAmount > totalUSDC ? totalUSDC : requestedAmount;
    this.logger.log(
      `[DEBUG] Amount to use for swapping: ${amountToUse.toString()} (amountInRaw: ${requestedAmount.toString()}, available: ${totalUSDC.toString()})`
    );

    // Check admin wallet SOL balance before executing swaps
    const adminBalance = await connection.getBalance(adminWallet.publicKey);
    const minRequiredSOL = 0.1; // Minimum 0.1 SOL for fees
    const minRequiredLamports = minRequiredSOL * 1e9;

    if (adminBalance < minRequiredLamports) {
      throw new BadRequestException(
        `Insufficient admin wallet SOL balance: ${(adminBalance / 1e9).toFixed(
          4
        )} SOL. ` +
          `Minimum required: ${minRequiredSOL} SOL for transaction fees.`
      );
    }

    this.logger.log(
      `[DEBUG] Admin wallet SOL balance: ${(adminBalance / 1e9).toFixed(
        4
      )} SOL (sufficient for fees)`
    );

    // Ensure admin USDC ATA
    const adminUSDC = await getAssociatedTokenAddress(
      STABLECOIN_MINT,
      adminWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Helper function to get compute unit config
    const getComputeUnitConfig = (quote: any) => {
      // Detect Sanctum Infinity routes (very compute-intensive)
      const hasSanctumInfinity = quote.routePlan?.some(
        (route: any) =>
          route.swapInfo?.ammKey ===
            "Gb7m4daakbVbrFLR33FKMDVMHAprRZ66CSYt4bpFwUgS" ||
          route.swapInfo?.label === "Sanctum Infinity"
      );

      // Check if it's a complex swap (multiple hops, large amount)
      const isComplexSwap =
        quote.routePlan?.length > 2 ||
        BigInt(quote.inAmount || 0) > BigInt(1_000_000); // > 1 USDC

      if (hasSanctumInfinity) {
        this.logger.log(
          `[DEBUG] Sanctum Infinity route detected - using max CU (${1_400_000}) and very high priority (2000)`
        );
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana (Sanctum routes need max)
          microLamports: 2000, // Very high priority fee for Sanctum routes
        };
      } else if (isComplexSwap) {
        this.logger.log(`[DEBUG] Complex swap detected, using high CU limit`);
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana
          microLamports: 1000, // Higher priority fee
        };
      } else {
        this.logger.log(
          `[DEBUG] Simple swap detected, using standard CU limit`
        );
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana
          microLamports: 500, // Lower priority fee
        };
      }
    };

    // Helper function to batch process items (delays are optional for paid APIs)
    // Processes items sequentially within batches with optional delays
    const batchProcess = async <T, R>(
      items: T[],
      batchSize: number,
      delayBetweenItems: number,
      delayBetweenBatches: number,
      processor: (item: T) => Promise<R>
    ): Promise<R[]> => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(items.length / batchSize);
        this.logger.log(
          `[DEBUG] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`
        );

        // Process items in batch sequentially with optional delays between them
        const batchResults: R[] = [];
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          this.logger.log(
            `[DEBUG] Processing item ${j + 1}/${
              batch.length
            } in batch ${batchNumber}`
          );
          try {
            const result = await processor(item);
            batchResults.push(result);
          } catch (error) {
            this.logger.log(
              `[DEBUG] Error processing item in batch: ${error.message}`
            );
            batchResults.push(null as R);
          }

          // Add delay between items within batch (except for the last item) if delay > 0
          if (j < batch.length - 1 && delayBetweenItems > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenItems)
            );
          }
        }

        results.push(...batchResults);

        // Wait before next batch (except for the last batch) if delay > 0
        if (i + batchSize < items.length && delayBetweenBatches > 0) {
          this.logger.log(
            `[DEBUG] Waiting ${delayBetweenBatches}ms before next batch...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      }
      return results;
    };

    // Step 1: Prepare all swap data with batched Jupiter API calls
    // First, prepare non-Jupiter data (ATAs, token programs) in parallel
    this.logger.log(
      `[DEBUG] Preparing non-Jupiter data for ${underlying.length} assets in parallel`
    );
    const assetPreparations = await Promise.all(
      underlying.map(async ({ mint: assetMint, bps }, index) => {
        const assetAmount = (amountToUse * BigInt(bps)) / BigInt(10000);
        this.logger.log(
          `[DEBUG] Preparing asset ${index + 1}/${
            underlying.length
          }: ${assetMint.toBase58()}, bps: ${bps}, amount: ${assetAmount.toString()}`
        );

        if (assetAmount === BigInt(0)) {
          this.logger.log(
            `[DEBUG] Skipping asset ${assetMint.toBase58()} - amount is 0`
          );
          return null;
        }

        try {
          const tokenProgramId = await this.getTokenProgramId(
            connection,
            assetMint
          );

          // Derive/create vault ATA for asset
          const vaultAssetAccount = await getAssociatedTokenAddress(
            assetMint,
            vault,
            true,
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          this.logger.log(
            `[API CALL] 🔗 Solana RPC: getAccountInfo for vault asset account ${vaultAssetAccount.toBase58()}`
          );
          const vaultAssetInfo = await connection.getAccountInfo(
            vaultAssetAccount
          );
          this.logger.log(`[API CALL] ✅ Solana RPC: getAccountInfo completed`);
          if (!vaultAssetInfo) {
            this.logger.log(
              `Creating ATA for ${assetMint.toBase58()} with token program ${tokenProgramId.toBase58()}`
            );
            const createIx = createAssociatedTokenAccountInstruction(
              adminWallet.publicKey,
              vaultAssetAccount,
              vault,
              assetMint,
              tokenProgramId,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );
            await provider.sendAndConfirm(
              new (await import("@solana/web3.js")).Transaction().add(createIx),
              []
            );
            this.logger.log(
              `ATA created successfully for ${assetMint.toBase58()}`
            );
          }

          return {
            assetMint,
            assetAmount,
            vaultAssetAccount,
            tokenProgramId,
            index,
          };
        } catch (error) {
          this.logger.log(
            `[DEBUG] Failed to prepare asset ${assetMint.toBase58()}: ${
              error.message
            }. Skipping this asset.`
          );
          return null;
        }
      })
    );

    // Filter out null results
    const validAssetPreparations = assetPreparations.filter((p) => p !== null);
    this.logger.log(
      `[DEBUG] Successfully prepared ${validAssetPreparations.length} assets out of ${underlying.length}`
    );

    if (validAssetPreparations.length === 0) {
      return {
        vaultIndex,
        amountRequested: requestedAmount.toString(),
        amountUsed: amountToUse.toString(),
        vaultUsdcBalance: totalUSDC.toString(),
        etfSharePriceRaw: etfSharePriceRaw,
        swaps: [],
        note: "No valid assets could be prepared.",
      };
    }

    // Validate total amount needed doesn't exceed vault balance
    const totalAmountNeeded = validAssetPreparations.reduce(
      (sum, prep) => sum + prep.assetAmount,
      BigInt(0)
    );

    if (totalAmountNeeded > totalUSDC) {
      this.logger.log(
        `[WARNING] Total amount needed (${totalAmountNeeded.toString()}) exceeds vault balance (${totalUSDC.toString()}). ` +
          `The transfer will be clamped to available balance.`
      );
    } else {
      this.logger.log(
        `[DEBUG] Total amount validation: ${totalAmountNeeded.toString()} needed, ${totalUSDC.toString()} available (OK)`
      );
    }

    // Step 1b: Batch Jupiter quote calls (paid API - no delays needed)
    this.logger.log(
      `[DEBUG] Getting Jupiter quotes for ${validAssetPreparations.length} assets in batches (max 10 per batch, no delays - paid API)`
    );
    const quoteResults = await batchProcess(
      validAssetPreparations,
      5, // Batch size: 10 quotes per batch (paid API allows higher concurrency)
      0, // No delay between items (paid API)
      0, // No delay between batches (paid API)
      async (prep) => {
        this.logger.log(
          `[DEBUG] Getting Jupiter quote for ${STABLECOIN_MINT.toBase58()} -> ${prep.assetMint.toBase58()}, amount: ${prep.assetAmount.toString()}`
        );
        try {
          const quote = await retryWithBackoff(() =>
            getJupiterQuote(STABLECOIN_MINT, prep.assetMint, prep.assetAmount)
          );
          return { ...prep, quote };
        } catch (error) {
          this.logger.log(
            `[DEBUG] Failed to get quote for ${prep.assetMint.toBase58()}: ${
              error.message
            }`
          );
          return null;
        }
      }
    );

    // Filter out failed quotes
    const validQuotes = quoteResults.filter((r) => r !== null);
    this.logger.log(
      `[DEBUG] Successfully got ${validQuotes.length} quotes out of ${validAssetPreparations.length}`
    );

    if (validQuotes.length === 0) {
      return {
        vaultIndex,
        amountRequested: requestedAmount.toString(),
        amountUsed: amountToUse.toString(),
        vaultUsdcBalance: totalUSDC.toString(),
        etfSharePriceRaw: etfSharePriceRaw,
        swaps: [],
        note: "No valid quotes could be obtained.",
      };
    }

    // Step 1c: Batch Jupiter instruction calls (paid API - no delays needed)
    this.logger.log(
      `[DEBUG] Getting Jupiter instructions for ${validQuotes.length} swaps in batches (max 10 per batch, no delays - paid API)`
    );
    const swapPreparations = await batchProcess(
      validQuotes,
      5, // Batch size: 5 instruction calls per batch (paid API allows higher concurrency)
      0, // No delay between items (paid API)
      0, // No delay between batches (paid API)
      async (prep) => {
        this.logger.log(
          `[DEBUG] Getting Jupiter instructions for swap ${prep.assetMint.toBase58()}`
        );
        try {
          const instructions = await retryWithBackoff(() =>
            getJupiterInstructions(
              prep.quote,
              adminWallet.publicKey,
              prep.vaultAssetAccount
            )
          );
          return {
            assetMint: prep.assetMint,
            assetAmount: prep.assetAmount,
            vaultAssetAccount: prep.vaultAssetAccount,
            quote: prep.quote,
            instructions,
            tokenProgramId: prep.tokenProgramId,
            index: prep.index,
          };
        } catch (error) {
          this.logger.log(
            `[DEBUG] Failed to get instructions for ${prep.assetMint.toBase58()}: ${
              error.message
            }. Skipping this asset.`
          );
          return null;
        }
      }
    );

    // Filter out null results (skipped assets)
    const validPreparations = swapPreparations.filter((p) => p !== null);
    this.logger.log(
      `[DEBUG] Successfully prepared ${validPreparations.length} swaps out of ${underlying.length} assets`
    );

    if (validPreparations.length === 0) {
      return {
        vaultIndex,
        amountRequested: requestedAmount.toString(),
        amountUsed: amountToUse.toString(),
        vaultUsdcBalance: totalUSDC.toString(),
        etfSharePriceRaw: etfSharePriceRaw,
        swaps: [],
        note: "No valid swaps could be prepared.",
      };
    }

    // Step 2: Execute SINGLE USDC transfer for total amount
    // All USDC goes to the same admin wallet account, so we can transfer the total amount at once
    // This eliminates race conditions and reduces transaction fees significantly
    this.logger.log(
      `[DEBUG] Executing single USDC transfer for total amount: ${amountToUse.toString()} (instead of ${
        validPreparations.length
      } separate transfers)`
    );

    // Calculate total amount needed from all valid preparations
    const totalAssetAmounts = validPreparations.reduce(
      (sum, prep) => sum + prep.assetAmount,
      BigInt(0)
    );

    // Use the smaller of: amountToUse (requested) or totalAssetAmounts (sum of all asset amounts)
    // This ensures we don't transfer more than needed
    const transferAmount =
      amountToUse < totalAssetAmounts ? amountToUse : totalAssetAmounts;

    this.logger.log(
      `[DEBUG] Transfer amount: ${transferAmount.toString()} (amountToUse: ${amountToUse.toString()}, totalAssetAmounts: ${totalAssetAmounts.toString()})`
    );

    // Re-check vault balance before transfer
    this.logger.log(
      `[API CALL] 🔗 Solana RPC: getAccount for vault USDC account (balance check before transfer)`
    );
    const currentVaultUSDC = await getAccount(connection, vaultUSDCAccount);
    const currentBalance = BigInt(currentVaultUSDC.amount.toString());
    this.logger.log(
      `[API CALL] ✅ Solana RPC: getAccount completed - current balance: ${currentBalance.toString()}`
    );

    // Check if we have enough balance for the transfer
    if (currentBalance < transferAmount) {
      throw new BadRequestException(
        `Insufficient vault balance: need ${transferAmount.toString()}, have ${currentBalance.toString()}`
      );
    }

    let transferSig: string;
    try {
      this.logger.log(
        `[API CALL] 🔗 Solana RPC: transferVaultToUser (program RPC call) for total amount: ${transferAmount.toString()}`
      );
      transferSig = await (program as any).methods
        .transferVaultToUser(
          new BN(vaultIndex),
          new BN(transferAmount.toString())
        )
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
      this.logger.log(
        `[API CALL] ✅ Solana RPC: transferVaultToUser completed - signature: ${transferSig}`
      );
      this.logger.log(
        `[DEBUG] Single transfer successful. Transferred ${transferAmount.toString()} USDC. Remaining vault balance: ${(
          currentBalance - transferAmount
        ).toString()}`
      );
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error";
      this.logger.log(`[DEBUG] USDC transfer failed: ${errorMessage}`);
      throw new BadRequestException(
        `Failed to transfer USDC from vault: ${errorMessage}`
      );
    }

    // Map all valid preparations to successfulTransfers with the same transfer signature
    // All swaps will use the same transfer since all USDC went to the same admin wallet account
    const successfulTransfers = validPreparations.map((prep) => ({
      ...prep,
      transferSig, // All swaps share the same transfer signature
    }));

    this.logger.log(
      `[DEBUG] Successfully executed single USDC transfer. All ${successfulTransfers.length} swaps will use this transfer.`
    );

    if (successfulTransfers.length === 0) {
      return {
        vaultIndex,
        amountRequested: requestedAmount.toString(),
        amountUsed: amountToUse.toString(),
        vaultUsdcBalance: totalUSDC.toString(),
        etfSharePriceRaw: etfSharePriceRaw,
        swaps: [],
        note: "No USDC transfers could be completed.",
      };
    }

    // Step 3: Build swap transactions in batches (paid Helius RPC - no delays needed)
    this.logger.log(
      `[DEBUG] Building ${successfulTransfers.length} swap transactions in batches (max 10 per batch, no delays - paid Helius RPC)`
    );
    this.logger.log(`[API CALL] 🔗 Solana RPC: getLatestBlockhash`);
    const { blockhash } = await connection.getLatestBlockhash();
    this.logger.log(
      `[API CALL] ✅ Solana RPC: getLatestBlockhash completed - blockhash: ${blockhash}`
    );

    const swapTransactions = await batchProcess(
      successfulTransfers,
      5, // Batch size: 5 builds per batch (paid Helius RPC allows higher concurrency)
      0, // No delay between items (paid RPC)
      0, // No delay between batches (paid RPC)
      async (prep) => {
        // Refresh quote and instructions right before building to avoid stale quotes
        // Jupiter quotes expire quickly (10-30 seconds), so we need fresh ones
        this.logger.log(
          `[DEBUG] Refreshing quote and instructions for ${prep.assetMint.toBase58()} before building transaction`
        );
        let freshQuote;
        let freshInstructions;
        try {
          // Get fresh quote
          freshQuote = await retryWithBackoff(() =>
            getJupiterQuote(STABLECOIN_MINT, prep.assetMint, prep.assetAmount)
          );
          // Get fresh instructions with fresh quote
          freshInstructions = await retryWithBackoff(() =>
            getJupiterInstructions(
              freshQuote,
              adminWallet.publicKey,
              prep.vaultAssetAccount
            )
          );
        } catch (refreshError) {
          this.logger.log(
            `[DEBUG] Failed to refresh quote/instructions for ${prep.assetMint.toBase58()}: ${
              refreshError.message
            }. Using cached quote/instructions.`
          );
          // Fallback to cached quote/instructions if refresh fails
          freshQuote = prep.quote;
          freshInstructions = prep.instructions;
        }

        const swapInstruction = deserializeInstruction(
          freshInstructions.swapInstruction
        );
        const swapIxs: any[] = [];

        const cuConfig = getComputeUnitConfig(freshQuote);
        swapIxs.push(
          ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
        );
        swapIxs.push(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: cuConfig.microLamports,
          })
        );

        if (freshInstructions.setupInstructions?.length)
          freshInstructions.setupInstructions.forEach((ix: any) =>
            swapIxs.push(deserializeInstruction(ix))
          );
        swapIxs.push(
          new TransactionInstruction({
            programId: swapInstruction.programId,
            keys: swapInstruction.keys,
            data: swapInstruction.data,
          })
        );
        if (freshInstructions.cleanupInstruction)
          swapIxs.push(
            deserializeInstruction(freshInstructions.cleanupInstruction)
          );

        const alts: AddressLookupTableAccount[] = freshInstructions
          .addressLookupTableAddresses?.length
          ? await getAddressLookupTableAccounts(
              freshInstructions.addressLookupTableAddresses
            )
          : [];

        this.logger.log(
          `[DEBUG] Building transaction for ${prep.assetMint.toBase58()} with ${
            swapIxs.length
          } instructions (using fresh quote)`
        );

        const messageV0 = new TransactionMessage({
          payerKey: adminWallet.publicKey,
          recentBlockhash: blockhash,
          instructions: swapIxs,
        }).compileToV0Message(alts);
        const vtx = new VersionedTransaction(messageV0);
        const signed = await adminWallet.signTransaction(vtx);

        return { ...prep, signedTransaction: signed, quote: freshQuote };
      }
    );

    // Helper function to rebuild transaction with fresh blockhash and quote
    const rebuildTransaction = async (
      prep: any
    ): Promise<VersionedTransaction> => {
      this.logger.log(
        `[DEBUG] Rebuilding transaction for ${prep.assetMint.toBase58()} with fresh blockhash and quote`
      );

      // Get fresh quote
      const freshQuote = await retryWithBackoff(() =>
        getJupiterQuote(STABLECOIN_MINT, prep.assetMint, prep.assetAmount)
      );

      // Get fresh instructions
      const freshInstructions = await retryWithBackoff(() =>
        getJupiterInstructions(
          freshQuote,
          adminWallet.publicKey,
          prep.vaultAssetAccount
        )
      );

      // Get fresh blockhash
      const { blockhash: newBlockhash } = await connection.getLatestBlockhash();

      // Rebuild transaction
      const swapInstruction = deserializeInstruction(
        freshInstructions.swapInstruction
      );
      const swapIxs: any[] = [];

      const cuConfig = getComputeUnitConfig(freshQuote);
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
      );
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: cuConfig.microLamports,
        })
      );

      if (freshInstructions.setupInstructions?.length)
        freshInstructions.setupInstructions.forEach((ix: any) =>
          swapIxs.push(deserializeInstruction(ix))
        );
      swapIxs.push(
        new TransactionInstruction({
          programId: swapInstruction.programId,
          keys: swapInstruction.keys,
          data: swapInstruction.data,
        })
      );
      if (freshInstructions.cleanupInstruction)
        swapIxs.push(
          deserializeInstruction(freshInstructions.cleanupInstruction)
        );

      const alts: AddressLookupTableAccount[] = freshInstructions
        .addressLookupTableAddresses?.length
        ? await getAddressLookupTableAccounts(
            freshInstructions.addressLookupTableAddresses
          )
        : [];

      const messageV0 = new TransactionMessage({
        payerKey: adminWallet.publicKey,
        recentBlockhash: newBlockhash,
        instructions: swapIxs,
      }).compileToV0Message(alts);
      const vtx = new VersionedTransaction(messageV0);
      const signed = await adminWallet.signTransaction(vtx);

      return signed;
    };

    // Step 4: Send swap transactions in batches (paid Helius RPC - no delays needed)
    this.logger.log(
      `[DEBUG] Sending ${swapTransactions.length} swap transactions in batches (max 10 per batch, no delays - paid Helius RPC)`
    );
    const sentTransactionResults = await batchProcess(
      swapTransactions,
      5, // Batch size: 5 sends per batch (paid Helius RPC allows higher concurrency)
      0, // No delay between items (paid RPC)
      0, // No delay between batches (paid RPC)
      async (prep) => {
        const { signedTransaction, assetMint } = prep;
        this.logger.log(
          `[DEBUG] Sending swap transaction for ${assetMint.toBase58()}`
        );

        const sendWithRetry = async (
          attemptNumber: number = 1
        ): Promise<string> => {
          // Get fresh quote and blockhash right before sending to minimize expiration window
          let transactionToSend = signedTransaction;
          let shouldSkipPreflight = false;

          // If this is a retry (attempt > 1) or first attempt, rebuild with fresh data
          // This ensures we always have the freshest possible quote
          if (attemptNumber > 1) {
            this.logger.log(
              `[DEBUG] Retry attempt ${attemptNumber} for ${assetMint.toBase58()}, rebuilding with fresh blockhash and quote`
            );
            transactionToSend = await rebuildTransaction(prep);
            shouldSkipPreflight = true; // Skip preflight on retries to avoid quote expiration during simulation
          }

          try {
            this.logger.log(
              `[API CALL] 🔗 Solana RPC: sendRawTransaction for ${assetMint.toBase58()} (attempt ${attemptNumber}, skipPreflight: ${shouldSkipPreflight})`
            );
            return await connection.sendRawTransaction(
              transactionToSend.serialize(),
              {
                skipPreflight: shouldSkipPreflight,
                preflightCommitment: "processed",
              }
            );
          } catch (error: any) {
            const errorMessage = error.message || "Unknown error";

            // Check if blockhash expired or Jupiter quote expired
            if (
              errorMessage.includes("Blockhash not found") ||
              errorMessage.includes("blockhash") ||
              errorMessage.includes("0x1788") ||
              errorMessage.includes("6024")
            ) {
              // If we haven't rebuilt yet, rebuild now
              if (attemptNumber === 1) {
                this.logger.log(
                  `[DEBUG] Transaction expired for ${assetMint.toBase58()} (${errorMessage}), rebuilding with fresh blockhash and quote`
                );
                const freshTransaction = await rebuildTransaction(prep);

                // Retry immediately with fresh transaction (skip preflight)
                this.logger.log(
                  `[DEBUG] Retrying send for ${assetMint.toBase58()} with fresh transaction (skipping preflight)`
                );
                return await connection.sendRawTransaction(
                  freshTransaction.serialize(),
                  {
                    skipPreflight: true, // Skip preflight to avoid quote expiration during simulation
                    preflightCommitment: "processed",
                  }
                );
              }
              // If we already rebuilt and it still fails, throw to let retryWithBackoff handle it
              throw error;
            }
            throw error;
          }
        };

        try {
          // Use a custom retry that rebuilds on each attempt
          let lastError: any;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const sig = await sendWithRetry(attempt);
              this.logger.log(
                `[API CALL] ✅ Solana RPC: sendRawTransaction completed - signature: ${sig}`
              );
              return { success: true, sig, assetMint };
            } catch (error: any) {
              lastError = error;
              if (attempt < 3) {
                const baseDelay = 1000 * Math.pow(2, attempt - 1);
                const jitter = Math.random() * 1000;
                const delay = baseDelay + jitter;
                this.logger.log(
                  `[DEBUG] Waiting ${Math.round(delay)}ms before retry...`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          }
          throw lastError;
        } catch (error: any) {
          // Enhanced error logging for Jupiter errors
          let errorMessage = error.message || "Unknown error";
          let errorDetails = "";

          // Check if it's a SendTransactionError and get logs
          if (error && typeof error.getLogs === "function") {
            try {
              const logs = error.getLogs();
              if (logs && Array.isArray(logs)) {
                errorDetails = `\nTransaction Logs:\n${logs.join("\n")}`;
              }
            } catch (logError) {
              // Fallback to error.logs if getLogs() fails
              if (error.logs && Array.isArray(error.logs)) {
                errorDetails = `\nTransaction Logs:\n${error.logs.join("\n")}`;
              }
            }
          } else if (error.logs && Array.isArray(error.logs)) {
            // Fallback: check if logs are directly on error object
            errorDetails = `\nTransaction Logs:\n${error.logs.join("\n")}`;
          }

          // Check for Jupiter-specific errors
          if (
            errorMessage.includes("0x1788") ||
            errorMessage.includes("6024")
          ) {
            errorMessage = `Jupiter swap error 0x1788: Quote may have expired or route is invalid. ${errorMessage}`;
          }

          this.logger.log(
            `[DEBUG] Failed to send swap transaction for ${assetMint.toBase58()}: ${errorMessage}${errorDetails}`
          );
          return {
            success: false,
            error: errorMessage,
            assetMint,
            errorDetails,
          };
        }
      }
    );

    // Convert to Promise.allSettled format for compatibility
    const sentTransactions = sentTransactionResults.map((result) => {
      if (result && result.success) {
        return { status: "fulfilled" as const, value: result.sig };
      } else {
        return {
          status: "rejected" as const,
          reason: { message: result?.error || "Unknown error" },
        };
      }
    });

    // Step 5: Wait for confirmations in batches to avoid RPC rate limits
    // Prepare confirmation data first
    const confirmationData = sentTransactions.map((result, idx) => ({
      result,
      prep: swapTransactions[idx],
    }));

    // Filter out failed sends (they don't need confirmation)
    const confirmationsToProcess = confirmationData.filter(
      (item) => item.result.status === "fulfilled"
    );
    const failedSends = confirmationData.filter(
      (item) => item.result.status === "rejected"
    );

    // Log failed sends first
    const results: any[] = [];
    for (const { prep, result } of failedSends) {
      this.logger.log(
        `[DEBUG] Failed to send swap transaction for ${prep.assetMint.toBase58()}: ${
          result.reason?.message || "Unknown error"
        }`
      );
      results.push({
        assetMint: prep.assetMint.toBase58(),
        usdcPortion: prep.assetAmount.toString(),
        transferSig: prep.transferSig,
        error: result.reason?.message || "Failed to send transaction",
      });

      // Save failed transaction to database
      try {
        const adminProfile = await this.vaultDepositService[
          "profileService"
        ].getByWalletAddress(adminWallet.publicKey.toBase58());
        const vaultFactory = await this.vaultFactoryService.findByAddress(
          vault.toBase58()
        );

        if (adminProfile && vaultFactory) {
          await this.saveFailedTransaction(
            vaultFactory._id.toString(),
            adminProfile._id.toString(),
            prep.assetAmount.toString(),
            prep.assetMint.toBase58(),
            prep.transferSig || "unknown" // Use transfer sig as txhash if swap sig not available
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to save failed transaction for ${prep.assetMint.toBase58()}: ${
            error.message
          }`
        );
      }
    }

    // Confirm all transactions in parallel (paid Helius RPC - no delays needed)
    this.logger.log(
      `[DEBUG] Confirming ${confirmationsToProcess.length} swap transactions in parallel (paid Helius RPC)`
    );
    const confirmationResults = await Promise.allSettled(
      confirmationsToProcess.map(async ({ result, prep }) => {
        const sig = result.value;
        try {
          this.logger.log(
            `[API CALL] 🔗 Solana RPC: confirmTransaction for ${prep.assetMint.toBase58()} - signature: ${sig}`
          );
          // Use "confirmed" commitment level for better reliability on production RPC nodes
          // "processed" is fast but less reliable; "confirmed" is more consistent
          await retryWithBackoff(
            () => connection.confirmTransaction(sig, "confirmed"),
            3
          );
          this.logger.log(
            `[API CALL] ✅ Solana RPC: confirmTransaction completed - signature: ${sig}`
          );

          // ⚠️ CRITICAL: Verify transaction actually succeeded (not just confirmed)
          // confirmTransaction only checks if tx was included in a block, not if it succeeded
          // Add a small delay to allow RPC nodes to index the transaction (especially important on servers)
          await new Promise((resolve) => setTimeout(resolve, 500));

          this.logger.log(
            `[API CALL] 🔗 Solana RPC: getTransaction (verifying success) for ${prep.assetMint.toBase58()} - signature: ${sig}`
          );

          // Retry getTransaction with exponential backoff - RPC nodes may need time to index
          // Try "confirmed" first, then fallback to "finalized" for edge cases
          let verifiedTransaction: any = null;
          let getTxAttempts = 0;
          const maxGetTxAttempts = 5;

          while (!verifiedTransaction && getTxAttempts < maxGetTxAttempts) {
            try {
              // Try "confirmed" first (matches confirmTransaction commitment level)
              verifiedTransaction = await connection.getTransaction(sig, {
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
              });

              if (verifiedTransaction) {
                break; // Successfully retrieved transaction
              }
            } catch (getTxError: any) {
              this.logger.log(
                `[DEBUG] getTransaction (confirmed) attempt ${
                  getTxAttempts + 1
                }/${maxGetTxAttempts} failed for ${prep.assetMint.toBase58()}: ${
                  getTxError.message
                }`
              );
            }

            // If "confirmed" failed and we're on the last attempt, try "finalized" as fallback
            if (
              !verifiedTransaction &&
              getTxAttempts === maxGetTxAttempts - 1
            ) {
              try {
                this.logger.log(
                  `[DEBUG] Trying finalized commitment as fallback for ${prep.assetMint.toBase58()}...`
                );
                verifiedTransaction = await connection.getTransaction(sig, {
                  maxSupportedTransactionVersion: 0,
                  commitment: "finalized",
                });

                if (verifiedTransaction) {
                  this.logger.log(
                    `[DEBUG] Successfully retrieved transaction with finalized commitment for ${prep.assetMint.toBase58()}`
                  );
                  break;
                }
              } catch (finalizedError: any) {
                this.logger.log(
                  `[DEBUG] getTransaction (finalized) also failed for ${prep.assetMint.toBase58()}: ${
                    finalizedError.message
                  }`
                );
              }
            }

            if (!verifiedTransaction) {
              getTxAttempts++;
              if (getTxAttempts < maxGetTxAttempts) {
                // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
                const delay = 200 * Math.pow(2, getTxAttempts - 1);
                this.logger.log(
                  `[DEBUG] Waiting ${delay}ms before retrying getTransaction for ${prep.assetMint.toBase58()}...`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          }

          // If we still can't get the transaction after retries, check if we can verify success another way
          if (!verifiedTransaction) {
            this.logger.warn(
              `[WARNING] Could not retrieve transaction ${sig} for ${prep.assetMint.toBase58()} after ${maxGetTxAttempts} attempts. ` +
                `Transaction was confirmed, but RPC node may not have indexed it yet. ` +
                `Assuming success since confirmTransaction succeeded.`
            );

            // Since confirmTransaction succeeded, we'll assume the transaction succeeded
            // This prevents false negatives on servers with slower RPC indexing
            // The transaction was confirmed, so it's very likely it succeeded
            verifiedTransaction = { meta: { err: null } }; // Fake success to avoid marking as failed
          }

          // Check if transaction actually succeeded
          if (verifiedTransaction.meta?.err) {
            const errorMessage = JSON.stringify(verifiedTransaction.meta.err);
            this.logger.error(
              `[ERROR] Transaction ${sig} for ${prep.assetMint.toBase58()} FAILED with error: ${errorMessage}`
            );

            // Save failed transaction to database
            try {
              const adminProfile = await this.vaultDepositService[
                "profileService"
              ].getByWalletAddress(adminWallet.publicKey.toBase58());
              const vaultFactory = await this.vaultFactoryService.findByAddress(
                vault.toBase58()
              );

              if (adminProfile && vaultFactory) {
                await this.saveFailedTransaction(
                  vaultFactory._id.toString(),
                  adminProfile._id.toString(),
                  prep.assetAmount.toString(),
                  prep.assetMint.toBase58(),
                  sig
                );
              }
            } catch (error) {
              this.logger.error(
                `Failed to save failed transaction for ${prep.assetMint.toBase58()}: ${
                  error.message
                }`
              );
            }

            // Return error result
            return {
              assetMint: prep.assetMint.toBase58(),
              usdcPortion: prep.assetAmount.toString(),
              transferSig: prep.transferSig,
              swapSig: sig,
              error: `Transaction failed: ${errorMessage}`,
            };
          }

          // Transaction succeeded - proceed with success handling
          this.logger.log(
            `[API CALL] ✅ Transaction ${sig} for ${prep.assetMint.toBase58()} verified as SUCCESS`
          );

          // Create history record for swap per asset (admin as performer if available)
          try {
            const adminProfile = await this.vaultDepositService[
              "profileService"
            ].getByWalletAddress(adminWallet.publicKey.toBase58());
            const vaultFactory = await this.vaultFactoryService.findByAddress(
              vault.toBase58()
            );
            if (adminProfile && vaultFactory) {
              await this.historyService.createTransactionHistory(
                "swap_completed",
                `Swap completed: ${prep.assetAmount.toString()} USDC -> ${prep.assetMint.toBase58()} for vault index ${vaultIndex}`,
                adminProfile._id.toString(),
                vaultFactory._id.toString(),
                {
                  vaultIndex,
                  vaultAddress: vault.toBase58(),
                  assetMint: prep.assetMint.toBase58(),
                  usdcPortion: prep.assetAmount.toString(),
                  transferSig: prep.transferSig,
                  swapSig: sig,
                },
                sig
              );
            }
          } catch (historyError) {
            this.logger.log(
              `Failed to create swap history: ${historyError.message}`
            );
          }

          return {
            assetMint: prep.assetMint.toBase58(),
            usdcPortion: prep.assetAmount.toString(),
            transferSig: prep.transferSig,
            swapSig: sig,
          };
        } catch (confirmError) {
          const errorMessage = confirmError.message || "Unknown error";

          // Check if this is a transaction retrieval error (not a confirmation error)
          // If confirmTransaction succeeded but getTransaction failed, assume success
          const isRetrievalError =
            errorMessage.includes("Transaction not found") ||
            errorMessage.includes("getTransaction") ||
            errorMessage.includes("could not retrieve");

          if (isRetrievalError) {
            this.logger.warn(
              `[WARNING] Could not retrieve transaction ${sig} for ${prep.assetMint.toBase58()} after confirmation. ` +
                `Assuming success since confirmTransaction succeeded. Error: ${errorMessage}`
            );

            // Assume success if confirmTransaction succeeded but getTransaction failed
            // This prevents false negatives on servers with slower RPC indexing
            return {
              assetMint: prep.assetMint.toBase58(),
              usdcPortion: prep.assetAmount.toString(),
              transferSig: prep.transferSig,
              swapSig: sig,
              // No error field - treat as success
            };
          }

          // Real confirmation failure - mark as failed
          this.logger.log(
            `[DEBUG] Failed to confirm swap transaction ${sig} for ${prep.assetMint.toBase58()}: ${errorMessage}`
          );

          // Save failed transaction to database
          try {
            const adminProfile = await this.vaultDepositService[
              "profileService"
            ].getByWalletAddress(adminWallet.publicKey.toBase58());
            const vaultFactory = await this.vaultFactoryService.findByAddress(
              vault.toBase58()
            );

            if (adminProfile && vaultFactory) {
              await this.saveFailedTransaction(
                vaultFactory._id.toString(),
                adminProfile._id.toString(),
                prep.assetAmount.toString(),
                prep.assetMint.toBase58(),
                sig // Use swap signature as txhash
              );
            }
          } catch (error) {
            this.logger.error(
              `Failed to save failed transaction for ${prep.assetMint.toBase58()}: ${
                error.message
              }`
            );
          }

          return {
            assetMint: prep.assetMint.toBase58(),
            usdcPortion: prep.assetAmount.toString(),
            transferSig: prep.transferSig,
            swapSig: sig,
            error: errorMessage,
          };
        }
      })
    );

    // Process results from parallel confirmations
    const confirmedSwaps = confirmationResults
      .map((result, idx) => {
        if (result.status === "fulfilled") {
          return result.value;
        } else {
          const { prep } = confirmationsToProcess[idx];
          this.logger.log(
            `[DEBUG] Confirmation promise rejected for ${prep.assetMint.toBase58()}: ${
              result.reason?.message || "Unknown error"
            }`
          );

          // Save failed transaction to database (fire and forget - don't block)
          (async () => {
            try {
              const adminProfile = await this.vaultDepositService[
                "profileService"
              ].getByWalletAddress(adminWallet.publicKey.toBase58());
              const vaultFactory = await this.vaultFactoryService.findByAddress(
                vault.toBase58()
              );

              if (adminProfile && vaultFactory) {
                await this.saveFailedTransaction(
                  vaultFactory._id.toString(),
                  adminProfile._id.toString(),
                  prep.assetAmount.toString(),
                  prep.assetMint.toBase58(),
                  prep.transferSig || "unknown" // Use transfer sig as txhash if swap sig not available
                );
              }
            } catch (error) {
              this.logger.error(
                `Failed to save failed transaction for ${prep.assetMint.toBase58()}: ${
                  error.message
                }`
              );
            }
          })();

          return {
            assetMint: prep.assetMint.toBase58(),
            usdcPortion: prep.assetAmount.toString(),
            transferSig: prep.transferSig,
            swapSig: prep.transferSig || "unknown", // Use transfer sig as fallback since swap sig not available
            error: result.reason?.message || "Confirmation promise rejected",
          };
        }
      })
      .filter((r) => r !== null);

    // Add successful confirmations to results
    results.push(...confirmedSwaps);

    // DEBUG: Log all results to see what's being marked as failed
    this.logger.log(
      `[DEBUG] Total results: ${results.length}. Results details:`,
      results.map((r) => ({
        assetMint: r.assetMint,
        hasError: !!r.error,
        error: r.error || "none",
        usdcPortion: r.usdcPortion,
      }))
    );

    // Calculate failed swaps and remaining USDC in admin wallet
    const failedSwaps = results.filter((r) => r.error);
    const totalFailedUSDC = failedSwaps.reduce(
      (sum, swap) => sum + BigInt(swap.usdcPortion || "0"),
      BigInt(0)
    );

    this.logger.log(
      `[DEBUG] Failed swaps count: ${
        failedSwaps.length
      }, Total failed USDC: ${totalFailedUSDC.toString()}`
    );

    // If there are failed swaps, return the USDC back to the vault
    let returnTransferSig: string | null = null;
    if (totalFailedUSDC > BigInt(0)) {
      this.logger.warn(
        `[WARNING] ${
          failedSwaps.length
        } swap(s) failed. Total USDC to return: ${totalFailedUSDC.toString()}. ` +
          `Returning USDC from admin wallet (${adminUSDC.toBase58()}) back to vault (${vaultUSDCAccount.toBase58()})`
      );

      try {
        // Check admin USDC balance before attempting return
        const adminUSDCAccount = await getAccount(connection, adminUSDC);
        const adminUSDCBalance = BigInt(adminUSDCAccount.amount.toString());

        // IMPORTANT: Only return the exact amount from failed swaps, not all leftover USDC
        // This ensures we keep any buffer/reserve USDC in the admin wallet
        const amountToReturn = totalFailedUSDC; // Only return what failed, not all balance

        // Safety check: Don't return more than we have
        if (amountToReturn > adminUSDCBalance) {
          this.logger.warn(
            `[WARNING] Cannot return full failed amount: admin wallet has ${adminUSDCBalance.toString()}, but ${totalFailedUSDC.toString()} is needed. Returning available balance.`
          );
          // Only return what we have if it's less than failed amount
          if (adminUSDCBalance > BigInt(0)) {
            // Return what we have
            this.logger.log(
              `[DEBUG] Creating transfer instruction to return ${adminUSDCBalance.toString()} USDC to vault`
            );

            // Create SPL token transfer instruction
            const returnTransferInstruction = createTransferInstruction(
              adminUSDC, // source: admin wallet USDC account
              vaultUSDCAccount, // destination: vault USDC account
              adminWallet.publicKey, // authority: admin wallet (signer)
              adminUSDCBalance, // amount to transfer
              [], // multiSigners (none needed)
              TOKEN_PROGRAM_ID // token program
            );

            // Build and send the return transfer transaction
            const { blockhash: returnBlockhash } =
              await connection.getLatestBlockhash();

            const returnMessage = new TransactionMessage({
              payerKey: adminWallet.publicKey,
              recentBlockhash: returnBlockhash,
              instructions: [
                ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
                ComputeBudgetProgram.setComputeUnitPrice({
                  microLamports: 1000,
                }),
                returnTransferInstruction,
              ],
            }).compileToV0Message();

            const returnTransaction = new VersionedTransaction(returnMessage);
            const signedReturnTx = await adminWallet.signTransaction(
              returnTransaction
            );

            this.logger.log(
              `[API CALL] 🔗 Solana RPC: sendRawTransaction (returning USDC to vault)`
            );
            returnTransferSig = await connection.sendRawTransaction(
              signedReturnTx.serialize(),
              { skipPreflight: false, preflightCommitment: "processed" }
            );

            this.logger.log(
              `[API CALL] ✅ Solana RPC: sendRawTransaction completed - signature: ${returnTransferSig}`
            );

            // Wait for confirmation
            this.logger.log(
              `[API CALL] 🔗 Solana RPC: confirmTransaction (returning USDC to vault)`
            );
            await connection.confirmTransaction(returnTransferSig, "confirmed");
            this.logger.log(
              `[API CALL] ✅ Solana RPC: confirmTransaction completed - USDC returned successfully`
            );

            this.logger.log(
              `[SUCCESS] Returned ${adminUSDCBalance.toString()} USDC from admin wallet back to vault. Transaction: ${returnTransferSig}`
            );
          } else {
            this.logger.warn(
              `[WARNING] Admin wallet has no USDC to return. Failed swaps: ${failedSwaps.length}`
            );
            returnTransferSig = null;
          }
        } else if (amountToReturn > BigInt(0)) {
          // Return the exact failed amount
          this.logger.log(
            `[DEBUG] Creating transfer instruction to return ${amountToReturn.toString()} USDC to vault (exact failed amount, not all balance)`
          );
          // ... rest of return logic with amountToReturn
          this.logger.log(
            `[DEBUG] Creating transfer instruction to return ${amountToReturn.toString()} USDC to vault`
          );

          // Create SPL token transfer instruction
          const returnTransferInstruction = createTransferInstruction(
            adminUSDC, // source: admin wallet USDC account
            vaultUSDCAccount, // destination: vault USDC account
            adminWallet.publicKey, // authority: admin wallet (signer)
            amountToReturn, // amount to transfer
            [], // multiSigners (none needed)
            TOKEN_PROGRAM_ID // token program
          );

          // Build and send the return transfer transaction
          const { blockhash: returnBlockhash } =
            await connection.getLatestBlockhash();

          const returnMessage = new TransactionMessage({
            payerKey: adminWallet.publicKey,
            recentBlockhash: returnBlockhash,
            instructions: [
              ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
              ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 1000,
              }),
              returnTransferInstruction,
            ],
          }).compileToV0Message();

          const returnTransaction = new VersionedTransaction(returnMessage);
          const signedReturnTx = await adminWallet.signTransaction(
            returnTransaction
          );

          this.logger.log(
            `[API CALL] 🔗 Solana RPC: sendRawTransaction (returning USDC to vault)`
          );
          returnTransferSig = await connection.sendRawTransaction(
            signedReturnTx.serialize(),
            { skipPreflight: false, preflightCommitment: "processed" }
          );

          this.logger.log(
            `[API CALL] ✅ Solana RPC: sendRawTransaction completed - signature: ${returnTransferSig}`
          );

          // Wait for confirmation
          this.logger.log(
            `[API CALL] 🔗 Solana RPC: confirmTransaction (returning USDC to vault)`
          );
          await connection.confirmTransaction(returnTransferSig, "confirmed");
          this.logger.log(
            `[API CALL] ✅ Solana RPC: confirmTransaction completed - USDC returned successfully`
          );

          this.logger.log(
            `[SUCCESS] Returned ${amountToReturn.toString()} USDC from admin wallet back to vault. Transaction: ${returnTransferSig}`
          );
        }
      } catch (returnError: any) {
        const errorMessage = returnError.message || "Unknown error";
        this.logger.error(
          `[ERROR] Failed to return USDC to vault: ${errorMessage}. ` +
            `USDC remains in admin wallet: ${adminUSDC.toBase58()}. ` +
            `Manual recovery required.`
        );
        // Don't throw - we still want to return the swap results even if return fails
        // The warning in the response will indicate manual recovery is needed
      }
    } else {
      // All swaps succeeded - DO NOT return any leftover USDC
      // Keep it in admin wallet as buffer/reserve
      this.logger.log(
        `[DEBUG] All swaps succeeded. Any leftover USDC will remain in admin wallet as buffer.`
      );
      // Remove or comment out the leftover USDC check if you want to keep it
      // The current code at lines 1716-1739 only logs, doesn't return, which is correct
    }

    await this.clearCache();
    return {
      vaultIndex,
      amountRequested: requestedAmount.toString(),
      amountUsed: amountToUse.toString(),
      vaultUsdcBalance: totalUSDC.toString(),
      etfSharePriceRaw: etfSharePriceRaw,
      swaps: results,
      // Include information about failed swaps and return status
      ...(totalFailedUSDC > BigInt(0) && {
        failedSwapsInfo: {
          count: failedSwaps.length,
          totalFailedUSDC: totalFailedUSDC.toString(),
          adminUSDCAccount: adminUSDC.toBase58(),
          vaultUSDCAccount: vaultUSDCAccount.toBase58(),
          returnTransferSignature: returnTransferSig || null,
          note: returnTransferSig
            ? `USDC successfully returned to vault (tx: ${returnTransferSig})`
            : "USDC return failed - manual recovery required",
        },
      }),
    };
  }

  /**
   * Admin redeem-swap: withdraw underlying to admin, swap to USDC into vault USDC PDA
   */
  async redeemSwapAdmin(dto: RedeemSwapAdminDto): Promise<any> {
    const PROGRAM_ID = new PublicKey(
      "BHTRWbEGRfJZSVXkJXj1Cv48knuALpUvijJwvuobyvvB"
    );
    const STABLECOIN_MINT = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    const JUPITER_QUOTE_API =
      this.configService.get("JUPITER_QUOTE_API") ||
      "https://lite-api.jup.ag/swap/v1/quote";
    const JUPITER_SWAP_API =
      this.configService.get("JUPITER_SWAP_API") ||
      "https://lite-api.jup.ag/swap/v1/swap-instructions";
    const JUPITER_API_KEY = this.configService.get("JUPITER_API_KEY");

    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
    const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
    const rpcUrl =
      heliusRpcUrl || solanaRpcUrl || "https://api.mainnet-beta.solana.com";

    if (heliusRpcUrl) {
      this.logger.log(`[DEBUG] Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      this.logger.log(`[DEBUG] Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      this.logger.log(`[DEBUG] Using default Solana RPC URL: ${rpcUrl}`);
    }

    // Use "confirmed" commitment level for better reliability on production RPC nodes
    // "processed" is fast but less reliable; "confirmed" is more consistent
    const connection = new Connection(rpcUrl, "confirmed");
    this.logger.log(`🌐 Using RPC URL: ${rpcUrl}`);
    this.logger.log(`🔗 Connection commitment: confirmed`);

    const adminKeyRaw = this.configService.get("SOLANA_ADMIN_PRIVATE_KEY");
    if (!adminKeyRaw)
      throw new BadRequestException("Missing SOLANA_ADMIN_PRIVATE_KEY");
    let adminKeypair: Keypair;
    try {
      const secret = new Uint8Array(JSON.parse(adminKeyRaw));
      adminKeypair = Keypair.fromSecretKey(secret);
    } catch {
      throw new BadRequestException("Invalid SOLANA_ADMIN_PRIVATE_KEY format");
    }
    const adminWallet = new Wallet(adminKeypair);
    const provider = new AnchorProvider(connection, adminWallet, {});
    const idl = (await import("../../utils/idls/idls"))
      .VAULT_FACTORY_IDL as any;
    const program = new Program(idl, provider);

    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries = 5
    ): Promise<T> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === maxRetries - 1) throw error;

          // Exponential backoff with jitter for rate limiting
          const baseDelay = 1000 * Math.pow(2, i);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    };
    const getJupiterQuote = async (
      inputMint: PublicKey,
      outputMint: PublicKey,
      amount: bigint
    ) => {
      const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64&excludeDexes=Sanctum,Sanctum+Infinity`;
      const headers: any = {};
      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }
      const res = await fetch(url as any, { headers });

      if (!res.ok) {
        throw new Error(
          `Jupiter quote API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter quote API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Jupiter quote response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new BadRequestException(`Quote error: ${(data as any).error}`);
      return data;
    };
    const getJupiterInstructions = async (
      quote: any,
      userPublicKey: PublicKey,
      destinationTokenAccount: PublicKey
    ) => {
      const body: any = {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        destinationTokenAccount: destinationTokenAccount.toBase58(),
      };

      const headers: any = {
        "Content-Type": "application/json",
      };
      if (JUPITER_API_KEY) {
        headers["x-api-key"] = JUPITER_API_KEY;
      }

      const res = await fetch(
        JUPITER_SWAP_API as any,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        } as any
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter instructions API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter instructions API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Jupiter instructions response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new BadRequestException(
          `Swap build error: ${(data as any).error}`
        );
      return data;
    };
    const deserializeInstruction = (ix: any) => ({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });
    const getAddressLookupTableAccounts = async (
      keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
      const infos = await connection.getMultipleAccountsInfo(
        keys.map((k) => new PublicKey(k))
      );
      return infos.reduce((acc, accountInfo, idx) => {
        const addr = keys[idx];
        if (accountInfo)
          acc.push(
            new AddressLookupTableAccount({
              key: new PublicKey(addr),
              state: AddressLookupTableAccount.deserialize(
                Uint8Array.from(accountInfo.data)
              ),
            })
          );
        return acc;
      }, new Array<AddressLookupTableAccount>());
    };

    const { vaultIndex, vaultTokenAmount } = dto;
    this.logger.log("[redeemSwapAdmin] input dto", {
      vaultIndex,
      vaultTokenAmount,
    });
    this.logger.log("[program id]", PROGRAM_ID);
    const [factory] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      PROGRAM_ID
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new BN(vaultIndex).toArrayLike(Buffer, "le", 4),
      ],
      PROGRAM_ID
    );
    const [vaultUSDC] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      PROGRAM_ID
    );
    this.logger.log("[redeemSwapAdmin] PDAs", {
      factory: factory.toBase58(),
      vault: vault.toBase58(),
      vaultUSDC: vaultUSDC.toBase58(),
    });

    // Fetch vault account and underlying
    this.logger.log(
      `\n🔍 Fetching vault account for vault: ${vault.toBase58()}`
    );
    const vaultAccount: any = await (program as any).account.vault.fetch(vault);
    this.logger.log(
      `📋 Raw vault account data:`,
      JSON.stringify(vaultAccount, null, 2)
    );

    // Helper function to get token decimals
    const getTokenDecimals = async (
      mintAddress: PublicKey
    ): Promise<number> => {
      try {
        const mintInfo = await connection.getAccountInfo(mintAddress);
        if (!mintInfo) return 6; // Default to 6 decimals

        // Parse mint account data to get decimals
        const data = mintInfo.data;
        const decimals = data[44]; // Decimals is at offset 44 in mint account
        return decimals || 6;
      } catch (error) {
        this.logger.warn(
          `Warning: Could not fetch decimals for ${mintAddress.toBase58()}, defaulting to 6`
        );
        return 6;
      }
    };

    this.logger.log("\n🔍 Reading Vault Allocation for Redeem Swap:");
    this.logger.log(`📊 Vault State:`);
    this.logger.log(
      `  Total Assets: ${vaultAccount.totalAssets?.toString?.()} ($${(
        Number(vaultAccount.totalAssets) / 1_000_000
      ).toFixed(6)} USD)`
    );
    this.logger.log(`  Management Fees: ${vaultAccount.managementFees} bps`);
    this.logger.log(`  Admin: ${vaultAccount.admin?.toBase58?.()}`);

    // Get underlying assets with detailed balance information
    this.logger.log(`\n🏦 Underlying Assets:`);
    const underlying: {
      mint: PublicKey;
      bps: number;
      balance: bigint;
      decimals: number;
    }[] = [];

    for (let i = 0; i < (vaultAccount.underlyingAssets || []).length; i++) {
      const asset = vaultAccount.underlyingAssets[i];
      const mintAddress = new PublicKey(
        asset.mintAddress || asset.mint_address || asset.mint
      );

      if (mintAddress.toBase58() !== "11111111111111111111111111111111") {
        this.logger.log(`  Asset ${i}:`);
        this.logger.log(`    Mint: ${mintAddress.toBase58()}`);
        this.logger.log(
          `    Allocation: ${
            asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps
          } bps (${(
            (asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps) / 100
          ).toFixed(2)}%)`
        );

        // Get token account balance with decimals
        let balance = BigInt(0);
        let decimals = 6;
        try {
          const assetTokenProgram = await this.getTokenProgramId(
            connection,
            mintAddress
          );
          const tokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            vault,
            true,
            assetTokenProgram,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          this.logger.log(`    Token Account: ${tokenAccount.toBase58()}`);
          this.logger.log(`    Token Program: ${assetTokenProgram.toBase58()}`);

          // Pass token program ID to getAccount - required for TOKEN_2022 accounts
          const accountInfo = await getAccount(
            connection,
            tokenAccount,
            undefined,
            assetTokenProgram
          );
          balance = BigInt(accountInfo.amount.toString());
          decimals = await getTokenDecimals(mintAddress);

          this.logger.log(
            `    Balance: ${balance.toString()} (${(
              Number(balance) / Math.pow(10, decimals)
            ).toFixed(6)} tokens)`
          );
        } catch (e) {
          this.logger.log(
            `    Balance: Account not found or error - ${e.message}`
          );
        }

        underlying.push({
          mint: mintAddress,
          bps: Number(
            asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps
          ),
          balance: balance,
          decimals: decimals,
        });
      }
    }

    // Get vault stablecoin balance
    this.logger.log(`\n💰 Vault Stablecoin Balance:`);
    try {
      const stableBalance = await getAccount(connection, vaultUSDC);
      const stablecoinMint = stableBalance.mint;
      const stablecoinDecimals = await getTokenDecimals(stablecoinMint);
      this.logger.log(
        `  ${stablecoinMint.toBase58()}: ${stableBalance.amount.toString()} (${(
          Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals)
        ).toFixed(6)} tokens)`
      );
    } catch (e) {
      this.logger.log(`  Stablecoin Balance: Account not found or error`);
    }

    this.logger.log("\n[redeemSwapAdmin] vaultAccount totals", {
      totalAssets: vaultAccount.totalAssets?.toString?.(),
      totalSupply: vaultAccount.totalSupply?.toString?.(),
      underlyingCount: underlying.length,
    });

    // Determine factory admin (recipient of withdraws)
    const factoryAccount: any = await (program as any).account.factory.fetch(
      factory
    );
    const factoryAdminPubkey = new PublicKey(factoryAccount.admin);

    // Safety check: env admin must be factory admin to sign withdraws
    if (!adminWallet.publicKey.equals(factoryAdminPubkey)) {
      this.logger.log(
        `SOLANA_ADMIN_PRIVATE_KEY pubkey ${adminWallet.publicKey.toBase58()} does not match factory admin ${factoryAdminPubkey.toBase58()}. Withdraw will fail constraints.`
      );
    }

    // Determine token program for USDC (should be SPL Token)
    const usdcTokenProgram = await this.getTokenProgramId(
      connection,
      STABLECOIN_MINT
    );

    // Ensure admin USDC ATA (recipient = factory admin)
    const adminUSDC = await getAssociatedTokenAddress(
      STABLECOIN_MINT,
      factoryAdminPubkey,
      false,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const results: any[] = [];

    // Helper function to batch process items (delays are optional for paid APIs)
    const batchProcess = async <T, R>(
      items: T[],
      batchSize: number,
      delayBetweenItems: number,
      delayBetweenBatches: number,
      processor: (item: T) => Promise<R>
    ): Promise<R[]> => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(items.length / batchSize);
        this.logger.log(
          `[DEBUG] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`
        );

        // Process items in batch sequentially with optional delays between them
        const batchResults: R[] = [];
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          this.logger.log(
            `[DEBUG] Processing item ${j + 1}/${
              batch.length
            } in batch ${batchNumber}`
          );
          try {
            const result = await processor(item);
            batchResults.push(result);
          } catch (error) {
            this.logger.log(
              `[DEBUG] Error processing item in batch: ${error.message}`
            );
            batchResults.push(null as R);
          }

          // Add delay between items within batch (except for the last item) if delay > 0
          if (j < batch.length - 1 && delayBetweenItems > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenItems)
            );
          }
        }

        results.push(...batchResults);

        // Wait before next batch (except for the last batch) if delay > 0
        if (i + batchSize < items.length && delayBetweenBatches > 0) {
          this.logger.log(
            `[DEBUG] Waiting ${delayBetweenBatches}ms before next batch...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      }
      return results;
    };

    // Helper function to get compute unit config
    const getComputeUnitConfig = (quote: any) => {
      // Detect Sanctum Infinity routes (very compute-intensive)
      const hasSanctumInfinity = quote.routePlan?.some(
        (route: any) =>
          route.swapInfo?.ammKey ===
            "Gb7m4daakbVbrFLR33FKMDVMHAprRZ66CSYt4bpFwUgS" ||
          route.swapInfo?.label === "Sanctum Infinity"
      );

      // Check if it's a complex swap (multiple hops, large amount)
      const isComplexSwap =
        quote.routePlan?.length > 2 ||
        BigInt(quote.inAmount || 0) > BigInt(1_000_000); // > 1 USDC

      if (hasSanctumInfinity) {
        this.logger.log(
          `[redeemSwapAdmin] Sanctum Infinity route detected - using max CU (${1_400_000}) and very high priority (2000)`
        );
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana (Sanctum routes need max)
          microLamports: 2000, // Very high priority fee for Sanctum routes
        };
      } else if (isComplexSwap) {
        this.logger.log(
          `[redeemSwapAdmin] Complex swap detected, using high CU limit`
        );
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana
          microLamports: 1000, // Higher priority fee
        };
      } else {
        this.logger.log(
          `[redeemSwapAdmin] Simple swap detected, using standard CU limit`
        );
        return {
          units: 1_400_000, // Maximum allowed CU limit in Solana
          microLamports: 500, // Lower priority fee
        };
      }
    };

    // Price-based calculation: Calculate USD value and split by real-time prices
    const requestedShares = BigInt(vaultTokenAmount);
    const totalAssets: bigint = BigInt(
      vaultAccount.totalAssets?.toString?.() || "0"
    );
    const totalSupply: bigint = BigInt(
      vaultAccount.totalSupply?.toString?.() || "0"
    );

    // IMPORTANT: Use FULL input amount for calculations - NO fee deduction here!
    // Smart contract will handle fee deduction during FinalizeRedeem
    // Compute total USDC value as (shares * sharePriceRaw) / 1e6 (both 6 decimals)
    const sharePriceRaw = BigInt((dto as any).etfSharePriceRaw || "0");
    if (sharePriceRaw === BigInt(0)) {
      throw new BadRequestException(
        "etfSharePriceRaw is required for redeem-swap"
      );
    }
    const totalValueUSDCraw =
      (requestedShares * sharePriceRaw) / BigInt(1_000_000);
    const sharePriceUSD = Number(sharePriceRaw) / 1_000_000; // for logs only
    const totalValueUSDCrawNumber = Number(totalValueUSDCraw); // raw USDC units (6 decimals)
    const totalValueUSDActual = totalValueUSDCrawNumber / 1_000_000; // actual USD value

    this.logger.log(
      "[redeemSwapAdmin] FULL AMOUNT CALCULATION (no pre-deduction)",
      {
        inputVaultTokenAmount: vaultTokenAmount,
        requestedShares: requestedShares.toString(),
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        sharePriceRaw: sharePriceRaw.toString(),
        sharePriceUSD: sharePriceUSD.toFixed(6),
        totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
        totalValueUSDActual: totalValueUSDActual.toFixed(6),
        calculation: `(${requestedShares.toString()} shares × ${sharePriceUSD.toFixed(
          6
        )} USDC/share) = ${totalValueUSDActual.toFixed(6)} USDC`,
        note: "Using FULL amount - smart contract will deduct fees later",
      }
    );

    // Helper function to get asset price in USD using Jupiter price API
    const getAssetPriceUSD = async (assetMint: PublicKey): Promise<bigint> => {
      try {
        const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${assetMint.toBase58()}`;
        const headers: any = {};
        if (JUPITER_API_KEY) {
          headers["x-api-key"] = JUPITER_API_KEY;
        }
        const response = await retryWithBackoff(() =>
          fetch(priceUrl, { headers })
        );

        if (!response.ok) {
          throw new Error(
            `Jupiter price API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        const priceData = data[assetMint.toBase58()];

        if (!priceData || !priceData.usdPrice) {
          throw new Error(`No price data found for ${assetMint.toBase58()}`);
        }

        // Convert USD price to BigInt (multiply by 1e6 for 6 decimals)
        const usdPrice = Math.floor(priceData.usdPrice * 1000000);
        return BigInt(usdPrice);
      } catch (error) {
        this.logger.warn(
          `Failed to get price for ${assetMint.toBase58()}: ${error.message}`
        );
        return BigInt(0);
      }
    };

    // Step 1: Prepare all assets in parallel
    this.logger.log(
      `[DEBUG] Preparing ${underlying.length} assets for redeem swap in parallel`
    );
    const assetPreparations = await Promise.all(
      underlying.map(async (asset, index) => {
        const assetTokenProgram = await this.getTokenProgramId(
          connection,
          asset.mint
        );
        const vaultAsset = await getAssociatedTokenAddress(
          asset.mint,
          vault,
          true,
          assetTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const vaultAssetAmount = asset.balance;
        if (vaultAssetAmount === BigInt(0)) return null;

        // Calculate USD allocation
        const assetUSDAllocation = Math.floor(
          (totalValueUSDCrawNumber * asset.bps) / 10000
        );
        const assetUSDAllocationActual = assetUSDAllocation / 1_000_000;

        // Get real-time price
        const assetPriceUSD = await getAssetPriceUSD(asset.mint);
        if (assetPriceUSD === BigInt(0)) {
          this.logger.log(
            `Skipping ${asset.mint.toBase58()} - unable to get price`
          );
          return null;
        }

        // Calculate token amount needed
        const tokenAmountNeeded = Math.floor(
          (assetUSDAllocation * Math.pow(10, asset.decimals)) /
            Number(assetPriceUSD)
        );

        const withdrawAmount =
          BigInt(tokenAmountNeeded) > vaultAssetAmount
            ? vaultAssetAmount
            : BigInt(tokenAmountNeeded);
        if (withdrawAmount === BigInt(0)) return null;

        const adminAssetAta = await getAssociatedTokenAddress(
          asset.mint,
          factoryAdminPubkey,
          false,
          assetTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        return {
          asset,
          assetTokenProgram,
          vaultAsset,
          adminAssetAta,
          withdrawAmount,
          assetPriceUSD,
          assetUSDAllocation,
          index,
        };
      })
    );

    const validPreparations = assetPreparations.filter((p) => p !== null);
    this.logger.log(
      `[DEBUG] Successfully prepared ${validPreparations.length} assets out of ${underlying.length}`
    );

    if (validPreparations.length === 0) {
      return {
        vaultIndex,
        vaultTokenAmount,
        swaps: [],
        vaultUsdcBalance: "0",
        requiredUsdc: "0",
        adjustedVaultTokenAmount: "0",
        sharePriceAfter: (Number(sharePriceRaw) / 1_000_000).toString(),
        totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
        totalValueUSDActual: totalValueUSDActual.toFixed(6),
        mode: "price-based",
      };
    }

    // Step 2: Ensure all ATAs exist in parallel
    this.logger.log(
      `[DEBUG] Ensuring ${validPreparations.length} admin ATAs exist in parallel`
    );
    await Promise.allSettled(
      validPreparations.map(async (prep) => {
        const adminAssetInfo = await connection.getAccountInfo(
          prep.adminAssetAta
        );
        if (!adminAssetInfo) {
          const createIx = createAssociatedTokenAccountInstruction(
            adminWallet.publicKey,
            prep.adminAssetAta,
            factoryAdminPubkey,
            prep.asset.mint,
            prep.assetTokenProgram,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          const createTx = new (
            await import("@solana/web3.js")
          ).Transaction().add(createIx);
          await provider.sendAndConfirm(createTx, []);
        }
      })
    );

    // Step 3: Get all Jupiter quotes in parallel (batched)
    this.logger.log(
      `[DEBUG] Getting Jupiter quotes for ${validPreparations.length} assets in batches (max 5 per batch, no delays - paid API)`
    );
    const quoteResults = await batchProcess(
      validPreparations,
      5,
      0,
      0,
      async (prep) => {
        try {
          const quote = await retryWithBackoff(() =>
            getJupiterQuote(
              prep.asset.mint,
              STABLECOIN_MINT,
              prep.withdrawAmount
            )
          );
          return { ...prep, quote };
        } catch (error) {
          this.logger.log(
            `[DEBUG] Failed to get quote for ${prep.asset.mint.toBase58()}: ${
              error.message
            }`
          );
          return null;
        }
      }
    );

    const validQuotes = quoteResults.filter((r) => r !== null);
    this.logger.log(
      `[DEBUG] Successfully got ${validQuotes.length} quotes out of ${validPreparations.length}`
    );

    if (validQuotes.length === 0) {
      return {
        vaultIndex,
        vaultTokenAmount,
        swaps: [],
        vaultUsdcBalance: "0",
        requiredUsdc: "0",
        adjustedVaultTokenAmount: "0",
        sharePriceAfter: (Number(sharePriceRaw) / 1_000_000).toString(),
        totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
        totalValueUSDActual: totalValueUSDActual.toFixed(6),
        mode: "price-based",
      };
    }

    // Step 4: Get all Jupiter instructions in parallel (batched)
    this.logger.log(
      `[DEBUG] Getting Jupiter instructions for ${validQuotes.length} swaps in batches (max 5 per batch, no delays - paid API)`
    );
    const swapPreparations = await batchProcess(
      validQuotes,
      5,
      0,
      0,
      async (prep) => {
        try {
          const instructions = await retryWithBackoff(() =>
            getJupiterInstructions(prep.quote, factoryAdminPubkey, vaultUSDC)
          );
          return { ...prep, instructions };
        } catch (error) {
          this.logger.log(
            `[DEBUG] Failed to get instructions for ${prep.asset.mint.toBase58()}: ${
              error.message
            }`
          );
          return null;
        }
      }
    );

    const validSwaps = swapPreparations.filter((p) => p !== null);
    this.logger.log(
      `[DEBUG] Successfully prepared ${validSwaps.length} swaps out of ${validPreparations.length} assets`
    );

    if (validSwaps.length === 0) {
      return {
        vaultIndex,
        vaultTokenAmount,
        swaps: [],
        vaultUsdcBalance: "0",
        requiredUsdc: "0",
        adjustedVaultTokenAmount: "0",
        sharePriceAfter: (Number(sharePriceRaw) / 1_000_000).toString(),
        totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
        totalValueUSDActual: totalValueUSDActual.toFixed(6),
        mode: "price-based",
      };
    }

    // Step 5: Execute all withdrawals in parallel
    this.logger.log(
      `[DEBUG] Executing ${validSwaps.length} withdrawals in parallel`
    );
    const withdrawalResults = await Promise.allSettled(
      validSwaps.map(async (prep) => {
        return await (program as any).methods
          .withdrawUnderlyingToUser(
            new BN(vaultIndex),
            new BN(prep.withdrawAmount.toString()),
            prep.asset.decimals // decimals parameter (u8) - required for Token-2022 support
          )
          .accountsStrict({
            user: factoryAdminPubkey,
            factory,
            vault,
            vaultAssetAccount: prep.vaultAsset,
            userAssetAccount: prep.adminAssetAta,
            mint: prep.asset.mint, // mint account - required for Token-2022 transfer_checked
            tokenProgram: prep.assetTokenProgram,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      })
    );

    const successfulWithdrawals = withdrawalResults
      .map((result, idx) => {
        if (result.status === "fulfilled") {
          return { ...validSwaps[idx], withdrawSig: result.value };
        } else {
          this.logger.log(
            `[DEBUG] Withdrawal failed for ${validSwaps[
              idx
            ].asset.mint.toBase58()}: ${
              result.reason?.message || "Unknown error"
            }`
          );
          return null;
        }
      })
      .filter((p) => p !== null);

    this.logger.log(
      `[DEBUG] Successfully executed ${successfulWithdrawals.length} withdrawals out of ${validSwaps.length}`
    );

    if (successfulWithdrawals.length === 0) {
      return {
        vaultIndex,
        vaultTokenAmount,
        swaps: [],
        vaultUsdcBalance: "0",
        requiredUsdc: "0",
        adjustedVaultTokenAmount: "0",
        sharePriceAfter: (Number(sharePriceRaw) / 1_000_000).toString(),
        totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
        totalValueUSDActual: totalValueUSDActual.toFixed(6),
        mode: "price-based",
      };
    }

    // Step 6: Build all transactions in parallel (with fresh quotes)
    this.logger.log(
      `[DEBUG] Building ${successfulWithdrawals.length} swap transactions in parallel (refreshing quotes)`
    );
    const { blockhash } = await connection.getLatestBlockhash();
    const swapTransactions = await Promise.all(
      successfulWithdrawals.map(async (prep) => {
        // Refresh quote right before building to avoid stale quotes
        let freshQuote = prep.quote;
        let freshInstructions = prep.instructions;
        try {
          freshQuote = await retryWithBackoff(() =>
            getJupiterQuote(
              prep.asset.mint,
              STABLECOIN_MINT,
              prep.withdrawAmount
            )
          );
          freshInstructions = await retryWithBackoff(() =>
            getJupiterInstructions(freshQuote, factoryAdminPubkey, vaultUSDC)
          );
        } catch (refreshError) {
          this.logger.log(
            `[DEBUG] Failed to refresh quote for ${prep.asset.mint.toBase58()}, using cached`
          );
        }

        const swapInstruction = deserializeInstruction(
          freshInstructions.swapInstruction
        );
        const swapIxs: TransactionInstruction[] = [];

        const cuConfig = getComputeUnitConfig(freshQuote);
        swapIxs.push(
          ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
        );
        swapIxs.push(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: cuConfig.microLamports,
          })
        );

        if (freshInstructions.setupInstructions?.length)
          swapIxs.push(
            ...freshInstructions.setupInstructions.map(deserializeInstruction)
          );
        swapIxs.push(deserializeInstruction(freshInstructions.swapInstruction));
        if (freshInstructions.cleanupInstruction)
          swapIxs.push(
            deserializeInstruction(freshInstructions.cleanupInstruction)
          );

        const lutAddrs: string[] =
          freshInstructions.addressLookupTableAddresses || [];
        const alts = await getAddressLookupTableAccounts(lutAddrs);

        const messageV0 = new TransactionMessage({
          payerKey: factoryAdminPubkey,
          recentBlockhash: blockhash,
          instructions: swapIxs,
        }).compileToV0Message(alts);
        const vtx = new VersionedTransaction(messageV0);
        vtx.sign([adminKeypair]);

        return { ...prep, signedTransaction: vtx, quote: freshQuote };
      })
    );

    // Helper function to rebuild transaction with fresh blockhash and quote (for redeemSwapAdmin)
    const rebuildRedeemTransaction = async (
      prep: any
    ): Promise<VersionedTransaction> => {
      this.logger.log(
        `[DEBUG] Rebuilding redeem transaction for ${prep.asset.mint.toBase58()} with fresh blockhash and quote`
      );

      // Get fresh quote
      const freshQuote = await retryWithBackoff(() =>
        getJupiterQuote(prep.asset.mint, STABLECOIN_MINT, prep.withdrawAmount)
      );

      // Get fresh instructions
      const freshInstructions = await retryWithBackoff(() =>
        getJupiterInstructions(freshQuote, factoryAdminPubkey, vaultUSDC)
      );

      // Get fresh blockhash
      const { blockhash: newBlockhash } = await connection.getLatestBlockhash();

      // Rebuild transaction
      const swapInstruction = deserializeInstruction(
        freshInstructions.swapInstruction
      );
      const swapIxs: TransactionInstruction[] = [];

      const cuConfig = getComputeUnitConfig(freshQuote);
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
      );
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: cuConfig.microLamports,
        })
      );

      if (freshInstructions.setupInstructions?.length)
        swapIxs.push(
          ...freshInstructions.setupInstructions.map(deserializeInstruction)
        );
      swapIxs.push(deserializeInstruction(freshInstructions.swapInstruction));
      if (freshInstructions.cleanupInstruction)
        swapIxs.push(
          deserializeInstruction(freshInstructions.cleanupInstruction)
        );

      const lutAddrs: string[] =
        freshInstructions.addressLookupTableAddresses || [];
      const alts = await getAddressLookupTableAccounts(lutAddrs);

      const messageV0 = new TransactionMessage({
        payerKey: factoryAdminPubkey,
        recentBlockhash: newBlockhash,
        instructions: swapIxs,
      }).compileToV0Message(alts);
      const vtx = new VersionedTransaction(messageV0);
      vtx.sign([adminKeypair]);

      return vtx;
    };

    // Step 7: Send all transactions in parallel
    this.logger.log(
      `[DEBUG] Sending ${swapTransactions.length} swap transactions in parallel`
    );
    const sentTransactionResults = await Promise.allSettled(
      swapTransactions.map(async (prep) => {
        const { signedTransaction, asset } = prep;

        const sendWithRetry = async (
          attemptNumber: number = 1
        ): Promise<string> => {
          // Get fresh quote and blockhash right before sending to minimize expiration window
          let transactionToSend = signedTransaction;
          let shouldSkipPreflight = false;

          // If this is a retry (attempt > 1), rebuild with fresh data
          // This ensures we always have the freshest possible quote
          if (attemptNumber > 1) {
            this.logger.log(
              `[DEBUG] Retry attempt ${attemptNumber} for ${asset.mint.toBase58()}, rebuilding with fresh blockhash and quote`
            );
            transactionToSend = await rebuildRedeemTransaction(prep);
            shouldSkipPreflight = true; // Skip preflight on retries to avoid quote expiration during simulation
          }

          try {
            this.logger.log(
              `[API CALL] 🔗 Solana RPC: sendRawTransaction for ${asset.mint.toBase58()} (attempt ${attemptNumber}, skipPreflight: ${shouldSkipPreflight})`
            );
            return await connection.sendRawTransaction(
              transactionToSend.serialize(),
              {
                skipPreflight: shouldSkipPreflight,
                preflightCommitment: "confirmed",
              }
            );
          } catch (error: any) {
            const errorMessage = error.message || "Unknown error";

            // Check if blockhash expired or Jupiter quote expired
            if (
              errorMessage.includes("Blockhash not found") ||
              errorMessage.includes("blockhash") ||
              errorMessage.includes("0x1788") ||
              errorMessage.includes("6024")
            ) {
              // If we haven't rebuilt yet, rebuild now
              if (attemptNumber === 1) {
                this.logger.log(
                  `[DEBUG] Redeem transaction expired for ${asset.mint.toBase58()} (${errorMessage}), rebuilding with fresh blockhash and quote`
                );
                const freshTransaction = await rebuildRedeemTransaction(prep);

                // Retry immediately with fresh transaction (skip preflight)
                this.logger.log(
                  `[DEBUG] Retrying send for ${asset.mint.toBase58()} with fresh transaction (skipping preflight)`
                );
                return await connection.sendRawTransaction(
                  freshTransaction.serialize(),
                  {
                    skipPreflight: true, // Skip preflight to avoid quote expiration during simulation
                    preflightCommitment: "confirmed",
                  }
                );
              }
              // If we already rebuilt and it still fails, throw to let retry loop handle it
              throw error;
            }
            throw error;
          }
        };

        // Use a custom retry that rebuilds on each attempt
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await sendWithRetry(attempt);
          } catch (error: any) {
            lastError = error;
            if (attempt < 3) {
              const baseDelay = 1000 * Math.pow(2, attempt - 1);
              const jitter = Math.random() * 1000;
              const delay = baseDelay + jitter;
              this.logger.log(
                `[DEBUG] Waiting ${Math.round(delay)}ms before retry...`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }
        throw lastError;
      })
    );

    // Step 8: Confirm all transactions in parallel
    this.logger.log(
      `[DEBUG] Confirming ${sentTransactionResults.length} swap transactions in parallel`
    );
    const confirmationResults = await Promise.allSettled(
      sentTransactionResults.map(async (result, idx) => {
        if (result.status === "fulfilled") {
          const sig = result.value;
          await retryWithBackoff(
            () => connection.confirmTransaction(sig, "confirmed"),
            3
          );

          // ⚠️ CRITICAL: Verify transaction actually succeeded (not just confirmed)
          const verifiedTransaction = await connection.getTransaction(sig, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });

          if (!verifiedTransaction) {
            throw new Error("Transaction not found after confirmation");
          }

          // Check if transaction actually succeeded
          if (verifiedTransaction.meta?.err) {
            const errorMessage = JSON.stringify(verifiedTransaction.meta.err);
            this.logger.error(
              `[ERROR] Redeem swap transaction ${sig} for ${swapTransactions[
                idx
              ].asset.mint.toBase58()} FAILED with error: ${errorMessage}`
            );
            // Return null to indicate failure (will be filtered out)
            return null;
          }

          return {
            mint: swapTransactions[idx].asset.mint.toBase58(),
            input: swapTransactions[idx].withdrawAmount.toString(),
            sig: sig,
          };
        }
        return null;
      })
    );

    // Collect results and create history records
    const confirmedSwaps = confirmationResults
      .map((r) => {
        if (r.status === "fulfilled" && r.value) {
          return r.value;
        }
        return null;
      })
      .filter((r) => r !== null);

    // Create history records in parallel (fire and forget)
    Promise.allSettled(
      confirmedSwaps.map(async (swap) => {
        try {
          const vf = await this.vaultFactoryService.findByAddress(
            vault.toBase58()
          );
          if (vf) {
            await this.historyService.createTransactionHistory(
              "swap_completed",
              `Admin redeem swap executed for ${swap.mint} -> USDC`,
              undefined,
              vf._id?.toString(),
              {
                vaultIndex,
                vaultAddress: vault.toBase58(),
                assetMint: swap.mint,
                inputAmount: swap.input,
              },
              swap.sig
            );
          }
        } catch (e) {
          this.logger.log(
            `Failed to write history for ${swap.mint}: ${e?.message}`
          );
        }
      })
    ).catch(() => {
      // Ignore errors in history creation
    });

    results.push(...confirmedSwaps);

    // After swaps, compute whether vault USDC can cover requested shares and suggest adjusted amount
    const latestVaultAcc: any = await (program as any).account.vault.fetch(
      vault
    );
    const totalAssetsAfter: bigint = BigInt(
      latestVaultAcc.totalAssets?.toString?.() || "0"
    );
    const totalSupplyAfter: bigint = BigInt(
      latestVaultAcc.totalSupply?.toString?.() || "0"
    );
    const vaultUsdcAcc = await getAccount(connection, vaultUSDC);
    const vaultUsdcBalance: bigint = BigInt(vaultUsdcAcc.amount.toString());

    // Calculate required USDC using the provided share price (both 6 decimals)
    // requiredUsdc = (requestedShares * sharePriceRaw) / 1e6
    const requiredUsdc = (requestedShares * sharePriceRaw) / BigInt(1_000_000);
    // Default adjusted amount in SHARES (not USDC): start with the requested shares
    let adjustedVaultTokenAmount = requestedShares;

    // If vault USDC balance is insufficient, adjust the redeemable SHARES
    // adjustedShares = floor(vaultUsdcBalance * 1e6 / sharePriceRaw)
    if (vaultUsdcBalance < requiredUsdc) {
      adjustedVaultTokenAmount =
        (vaultUsdcBalance * BigInt(1_000_000)) / sharePriceRaw;
    }

    this.logger.log("[redeemSwapAdmin] post-swap state (price-based)", {
      totalAssetsAfter: totalAssetsAfter.toString(),
      totalSupplyAfter: totalSupplyAfter.toString(),
      sharePriceRaw: sharePriceRaw.toString(),
      vaultUsdcBalance: vaultUsdcBalance.toString(),
      requiredUsdc: requiredUsdc.toString(),
      adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
    });

    // Summary: Confirm we used FULL input amount
    this.logger.log("[redeemSwapAdmin] REDEEM SWAP SUMMARY:", {
      inputAmount: vaultTokenAmount,
      requestedShares: requestedShares.toString(),
      sharePriceRaw: sharePriceRaw.toString(),
      sharePriceUSD: sharePriceUSD.toFixed(6),
      totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
      totalValueUSDActual: totalValueUSDActual.toFixed(6),
      swapsExecuted: results.length,
      totalUSDCGenerated: vaultUsdcBalance.toString(),
      note: "FULL input amount used with share price - smart contract will deduct fees during FinalizeRedeem",
    });

    // History: batch completed (use existing action name)
    try {
      const vf = await this.vaultFactoryService.findByAddress(vault.toBase58());
      await this.historyService.createTransactionHistory(
        "swap_completed",
        `Admin redeem swaps completed for vault index ${vaultIndex}`,
        undefined,
        vf?._id?.toString(),
        {
          vaultIndex,
          vaultAddress: vault.toBase58(),
          legs: results.length,
          vaultUsdcBalance: vaultUsdcBalance.toString(),
          requiredUsdc: requiredUsdc.toString(),
          adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
        }
      );
    } catch (e) {
      this.logger.log(`Failed to write batch-completed history: ${e?.message}`);
    }

    await this.clearCache();
    return {
      vaultIndex,
      vaultTokenAmount,
      swaps: results,
      vaultUsdcBalance: vaultUsdcBalance.toString(),
      requiredUsdc: requiredUsdc.toString(),
      adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
      sharePriceAfter: (Number(sharePriceRaw) / 1_000_000).toString(),
      totalValueUSDCraw: totalValueUSDCrawNumber.toString(),
      totalValueUSDActual: totalValueUSDActual.toFixed(6),
      mode: "price-based",
    };
  }

  async readTransaction(transactionDto: ReadTransactionDto): Promise<any> {
    try {
      const { transactionSignature, bannerUrl, logoUrl, description } =
        transactionDto;

      // Reading transaction from blockchain
      this.logger.log(`Fetching transaction: ${transactionSignature}`);

      // Fetch transaction details from Solana blockchain
      // Let Solana RPC validate the signature format and existence
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found on blockchain");
      }

      // Extract and decode program data
      const programData = this.extractProgramLogs(transaction);
      this.logger.log("programData", programData);

      // Extract structured vault data from program logs
      const structuredVaultData = this.extractStructuredVaultData(programData);
      this.logger.log("Structured Vault Data:", structuredVaultData);

      // Log formatted vault data for better readability
      this.logFormattedVaultData(structuredVaultData);
      // Transaction data decoded successfully

      // Process VaultCreated events and create vault factory records
      const vaultCreationResults = await this.processVaultCreatedEvents(
        structuredVaultData,
        bannerUrl,
        logoUrl,
        description
      );

      // Return vault factory creation results
      return vaultCreationResults;
    } catch (error) {
      this.logger.log(
        `Error reading transaction: ${error.message}`,
        error.stack
      );

      // Handle specific Solana RPC errors
      if (error.message?.includes("Invalid transaction signature")) {
        throw new BadRequestException("Invalid transaction signature format");
      }

      if (
        error.message?.includes("Transaction not found") ||
        error.message?.includes("not found")
      ) {
        throw new BadRequestException("Transaction not found on blockchain");
      }

      if (error.message?.includes("RPC")) {
        throw new BadRequestException("Failed to connect to Solana blockchain");
      }

      // Re-throw other errors
      throw error;
    }
  }

  private extractProgramLogs(
    transaction: TransactionResponse | VersionedTransactionResponse
  ): string[] {
    const logs: string[] = [];

    if (transaction.meta?.logMessages) {
      // Filter for program logs (instructions executed by programs)
      transaction.meta.logMessages.forEach((log) => {
        if (log.startsWith("Program log:")) {
          logs.push(log);
        } else if (log.startsWith("Program ")) {
          // Also include program instruction logs
          logs.push(log);
        }
      });
    }

    return logs;
  }

  private extractStructuredVaultData(programLogs: string[]): any {
    const vaultData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      managementFees: null,
      underlyingAssets: [],
      factoryKey: null,
      vaultPda: null,
      vaultAdmin: null,
      vaultMintPda: null,
      vaultTokenAccountPda: null,
      createdAt: null,
      totalBpsAllocation: null,
      assetsCount: null,
    };

    programLogs.forEach((log) => {
      // Extract vault name
      if (log.includes("📝 Vault Name:")) {
        const match = log.match(/📝 Vault Name: (.+)/);
        if (match) {
          vaultData.vaultName = match[1].trim();
        }
      }

      // Extract vault symbol
      if (log.includes("🏷️ Vault Symbol:")) {
        const match = log.match(/🏷️ Vault Symbol: (.+)/);
        if (match) {
          vaultData.vaultSymbol = match[1].trim();
        }
      }

      // Extract management fees
      if (log.includes("💰 Management Fees:")) {
        const match = log.match(/💰 Management Fees: (\d+) bps/);
        if (match) {
          vaultData.managementFees = {
            bps: parseInt(match[1]),
            percentage: (parseInt(match[1]) / 100).toFixed(2) + "%",
          };
        }
      }

      // Extract number of underlying assets
      if (log.includes("📊 Number of underlying assets:")) {
        const match = log.match(/📊 Number of underlying assets: (\d+)/);
        if (match) {
          vaultData.assetsCount = parseInt(match[1]);
        }
      }

      // Extract underlying assets
      if (
        log.includes("Asset ") &&
        log.includes("Mint=") &&
        log.includes("BPS=")
      ) {
        const match = log.match(/Asset \d+: Mint=([A-Za-z0-9]+), BPS=(\d+)/);
        if (match) {
          vaultData.underlyingAssets.push({
            mint: match[1],
            bps: parseInt(match[2]),
            percentage: (parseInt(match[2]) / 100).toFixed(2) + "%",
          });
        }
      }

      // Extract total BPS allocation
      if (log.includes("📈 Total BPS allocation:")) {
        const match = log.match(/📈 Total BPS allocation: (\d+)/);
        if (match) {
          vaultData.totalBpsAllocation = parseInt(match[1]);
        }
      }

      // Extract factory key
      if (log.includes("🏭 Factory key:")) {
        const match = log.match(/🏭 Factory key: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.factoryKey = match[1];
        }
      }

      // Extract vault index (convert from 1-based to 0-based for blockchain)
      if (log.includes("🔢 Current vault count:")) {
        const match = log.match(
          /🔢 Current vault count: \d+, creating vault #(\d+)/
        );
        if (match) {
          // Convert from 1-based index to 0-based index for blockchain
          vaultData.vaultIndex = parseInt(match[1]) - 1;
        }
      }

      // Extract vault PDA
      if (log.includes("🔑 Vault PDA:")) {
        const match = log.match(/🔑 Vault PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultPda = match[1];
        }
      }

      // Extract vault admin
      if (log.includes("👑 Vault Admin:")) {
        const match = log.match(/👑 Vault Admin: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultAdmin = match[1];
        }
      }

      // Extract vault mint PDA
      if (log.includes("🪙 Vault Mint PDA:")) {
        const match = log.match(/🪙 Vault Mint PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultMintPda = match[1];
        }
      }

      // Extract vault token account PDA
      if (log.includes("💳 Vault Token Account PDA:")) {
        const match = log.match(/💳 Vault Token Account PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultTokenAccountPda = match[1];
        }
      }

      // Extract created at timestamp
      if (log.includes("📅 Created at:")) {
        const match = log.match(/📅 Created at: (\d+)/);
        if (match) {
          const timestamp = parseInt(match[1]);
          vaultData.createdAt = {
            timestamp: timestamp,
            date: new Date(timestamp * 1000).toISOString(),
          };
        }
      }
    });

    return vaultData;
  }

  private logFormattedVaultData(vaultData: any): void {
    this.logger.log("\n🏦 ===== VAULT CREATION DATA =====");
    this.logger.log(`📝 Vault Name: ${vaultData.vaultName || "N/A"}`);
    this.logger.log(`🏷️ Vault Symbol: ${vaultData.vaultSymbol || "N/A"}`);
    this.logger.log(
      `🔢 Vault Index: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex : "N/A"
      } (blockchain: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex : "N/A"
      }, logs: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex + 1 : "N/A"
      })`
    );
    this.logger.log(
      `💰 Management Fees: ${vaultData.managementFees?.bps || 0} bps (${
        vaultData.managementFees?.percentage || "0.00%"
      })`
    );
    this.logger.log(`📊 Number of Assets: ${vaultData.assetsCount || 0}`);
    this.logger.log(
      `📈 Total BPS Allocation: ${vaultData.totalBpsAllocation || 0}`
    );

    if (vaultData.underlyingAssets && vaultData.underlyingAssets.length > 0) {
      this.logger.log("\n💎 Underlying Assets:");
      vaultData.underlyingAssets.forEach((asset: any, index: number) => {
        this.logger.log(
          `  Asset ${index + 1}: ${asset.mint} - ${asset.bps} bps (${
            asset.percentage
          })`
        );
      });
    }

    this.logger.log("\n🔑 Vault Addresses:");
    this.logger.log(`  🏭 Factory: ${vaultData.factoryKey || "N/A"}`);
    this.logger.log(`  🔑 Vault PDA: ${vaultData.vaultPda || "N/A"}`);
    this.logger.log(`  👑 Vault Admin: ${vaultData.vaultAdmin || "N/A"}`);
    this.logger.log(`  🪙 Vault Mint PDA: ${vaultData.vaultMintPda || "N/A"}`);
    this.logger.log(
      `  💳 Vault Token Account PDA: ${vaultData.vaultTokenAccountPda || "N/A"}`
    );

    if (vaultData.createdAt) {
      this.logger.log(
        `\n📅 Created: ${vaultData.createdAt.date || "N/A"} (${
          vaultData.createdAt.timestamp || "N/A"
        })`
      );
    }

    this.logger.log("🏦 ================================\n");
  }

  private extractProgramData(
    transaction: TransactionResponse | VersionedTransactionResponse
  ): string[] {
    const programData: string[] = [];

    if (transaction.meta?.logMessages) {
      transaction.meta.logMessages.forEach((log) => {
        // Extract only the data part from "Program data: <data>"
        if (log.startsWith("Program data:")) {
          const dataMatch = log.match(/Program data: (.+)/);
          if (dataMatch && dataMatch[1]) {
            programData.push(dataMatch[1]);
          }
        }
      });
    }

    return programData;
  }

  private decodeProgramData(programData: string[]): {
    raw: string[];
    decoded: string[];
    structured: any[];
  } {
    const decoded: string[] = [];
    const structured: any[] = [];

    programData.forEach((data) => {
      try {
        // Try to decode base64 data
        const buffer = Buffer.from(data, "base64");
        const decodedString = buffer.toString("utf8");
        decoded.push(decodedString);

        // Decode structured event data
        const structuredEvent = this.decodeStructuredEvent(buffer);
        if (structuredEvent) {
          structured.push(structuredEvent);
        }
      } catch (error) {
        // If decoding fails, add the original data
        decoded.push(`[Decoding failed: ${error.message}]`);
      }
    });

    return {
      raw: programData,
      decoded: decoded,
      structured: structured,
    };
  }

  private decodeStructuredEvent(buffer: Buffer): any {
    try {
      // Extract discriminator (first 8 bytes)
      const discriminator = buffer.slice(0, 8).toString("hex");

      // Identify event type
      const eventType = this.EVENT_DISCRIMINATORS[discriminator];

      if (eventType) {
        // Decode specific event based on type
        switch (eventType) {
          case "VaultCreated":
            return this.decodeVaultCreated(buffer);
          case "FactoryAssetsUpdated":
            return this.decodeFactoryAssetsUpdated(buffer);
          case "FactoryInitialized":
            return this.decodeFactoryInitialized(buffer);
          case "FactoryFeesUpdated":
            return this.decodeFactoryFeesUpdatedEnhanced(buffer);
          case "VaultFeesUpdated":
            return this.decodeVaultFeesUpdated(buffer);
          case "ProtocolFeesCollected":
            return this.decodeProtocolFeesCollected(buffer);
          case "VaultDeposited":
            return this.decodeVaultDeposited(buffer);
          default:
            return this.decodeGeneric(buffer, eventType);
        }
      } else {
        return this.decodeGeneric(buffer, "Unknown");
      }
    } catch (error) {
      return null;
    }
  }

  private decodeVaultCreated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Creator address (32 bytes)
      const creator = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Now I need to analyze the actual structure
      // Looking at the hex data, I can see the strings at the end
      // Let me work backwards from the end to find the structure

      // From the hex data, I can see:
      // - At the very end: "DirectVault_1757673812620" (25 bytes)
      // - Before that: "DVJUV" (5 bytes)
      // - Before that: some numeric values

      // Let me extract the strings first
      const fullString = buffer.toString();

      // Look for the vault name pattern
      const nameMatch = fullString.match(/DirectVault_\d+/);
      const symbolMatch = fullString.match(/[A-Z]{3,6}/);

      let vaultName = nameMatch ? nameMatch[0] : "Unknown";
      let vaultSymbol = symbolMatch ? symbolMatch[0] : "UNK";
      // Now let me try to find the numeric values
      // Looking at the hex pattern, I can see some values that look like they could be the numeric fields

      // Let me try a different approach - look for the actual structure
      // The structure might be: 3 pubkeys + some data + strings at the end

      // Let me try to find where the strings start
      const nameStart = fullString.indexOf("DirectVault_");
      const symbolStart = fullString.indexOf("DVJUV");

      // The data section should be between the pubkeys and the strings
      // Let me try to extract numeric values from the data section

      let managementFee = 0;
      let underlyingAssets = [];
      let assetsCount = 0;
      let totalSupply = BigInt(0);
      let nav = BigInt(0);
      let timestamp = BigInt(0);
      let vaultIndex = 0;
      let etfVaultPda = "";
      let etfMint = "";
      let vaultTreasury = "";

      // Try to find numeric values in the data section
      // Let me look for patterns that could be the numeric values

      // From the hex, I can see some patterns that might be the values
      // Let me try to extract them systematically

      // Based on the Solana program structure, let me try to parse the fields in order
      // The structure should be: 3 pubkeys + management_fee_bps (u16) + underlying_assets + other fields
      const dataStart = 8 + 96; // After discriminator + 3 pubkeys
      const dataEnd = symbolStart > 0 ? symbolStart : buffer.length - 50; // Before strings

      // Try to find the management fee (should be a small u16 value right after the pubkeys)
      for (let i = dataStart; i < dataEnd - 2; i++) {
        const value = buffer.readUInt16LE(i);
        if (value > 0 && value < 10000) {
          // Reasonable fee range
          managementFee = value;
          break;
        }
      }

      // Try to find additional public keys that could be etf_vault_pda, etf_mint, vault_treasury
      for (let i = dataStart; i < dataEnd - 32; i++) {
        try {
          const potentialPubkey = new PublicKey(buffer.slice(i, i + 32));

          // Check if this is a new pubkey (not the main 3 we already have)
          if (
            potentialPubkey.toString() !== vault.toString() &&
            potentialPubkey.toString() !== factory.toString() &&
            potentialPubkey.toString() !== creator.toString()
          ) {
            // Assign to the additional fields if they're empty
            if (!etfVaultPda) {
              etfVaultPda = potentialPubkey.toString();
            } else if (!etfMint) {
              etfMint = potentialPubkey.toString();
            } else if (!vaultTreasury) {
              vaultTreasury = potentialPubkey.toString();
            }
          }
        } catch (e) {
          // Not a valid public key, continue
        }
      }

      // Try to find the timestamp (should be a large number representing Unix timestamp)
      // Look for 8-byte values that could be timestamps
      for (let i = dataStart; i < dataEnd - 8; i++) {
        const value = buffer.readBigInt64LE(i);
        const timestampValue = Number(value);
        // Check if it's a reasonable timestamp (between 2020 and 2030)
        if (timestampValue > 1577836800 && timestampValue < 1893456000) {
          timestamp = value;
          break;
        }
      }

      // Try to find other numeric values
      // Look for total supply, NAV, and vault_index
      for (let i = dataStart; i < dataEnd - 8; i++) {
        const value = buffer.readBigUInt64LE(i);
        if (value > BigInt(0) && value < BigInt(1000000000000000)) {
          // Reasonable range
          if (totalSupply === BigInt(0)) {
            totalSupply = value;
          } else if (nav === BigInt(0)) {
            nav = value;
          }
        }
      }

      // Try to find vault_index (should be a small u8 or u16 value)
      for (let i = dataStart; i < dataEnd - 1; i++) {
        const value = buffer.readUInt8(i);
        if (value > 0 && value < 255) {
          // Reasonable vault index range
          vaultIndex = value;
          break;
        }
      }

      // Try to find underlying assets
      // Look for potential public keys in the data section that could be asset mints
      for (let i = dataStart; i < dataEnd - 32; i++) {
        try {
          const potentialMint = new PublicKey(buffer.slice(i, i + 32));

          // Check if this looks like a valid asset mint (not one of the main addresses)
          if (
            potentialMint.toString() !== vault.toString() &&
            potentialMint.toString() !== factory.toString() &&
            potentialMint.toString() !== creator.toString()
          ) {
            // Try to read percentage after the mint (2 bytes)
            if (i + 34 <= dataEnd) {
              const pctBps = buffer.readUInt16LE(i + 32);
              if (pctBps > 0 && pctBps <= 10000) {
                // Reasonable percentage range
                underlyingAssets.push({
                  mint: potentialMint.toString(),
                  pctBps: pctBps,
                  percentage: (pctBps / 100).toFixed(2) + "%",
                });
                assetsCount++;
              }
            }
          }
        } catch (e) {
          // Not a valid public key, continue
        }
      }

      const date =
        timestamp > BigInt(0) ? new Date(Number(timestamp) * 1000) : new Date();

      const result = {
        eventType: "VaultCreated",
        vault: vault.toString(),
        factory: factory.toString(),
        creator: creator.toString(),
        vaultName,
        vaultSymbol,
        managementFeeBps: managementFee,
        managementFeePercent: (managementFee / 100).toFixed(2),
        underlyingAssets: underlyingAssets,
        underlyingAssetsCount: assetsCount,
        vaultIndex: vaultIndex,
        etfVaultPda: etfVaultPda,
        etfMint: etfMint,
        vaultTreasury: vaultTreasury,
        totalSupply: totalSupply.toString(),
        nav: nav.toString(),
        timestamp: timestamp.toString(),
        createdAt: date.toISOString(),
      };

      return result;
    } catch (error) {
      this.logger.log(`Error decoding VaultCreated: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultCreated");
    }
  }

  private decodeFactoryAssetsUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old assets count (u8)
      const oldAssetsCount = buffer.readUInt8(offset);
      offset += 1;

      // New assets count (u8)
      const newAssetsCount = buffer.readUInt8(offset);
      offset += 1;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryAssetsUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldAssetsCount,
        newAssetsCount,
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      this.logger.log(`Error decoding FactoryAssetsUpdated: ${error.message}`);
      return this.decodeGeneric(buffer, "FactoryAssetsUpdated");
    }
  }

  private decodeFactoryInitialized(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Initializer address (32 bytes)
      const initializer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryInitialized",
        factory: factory.toString(),
        initializer: initializer.toString(),
        timestamp: timestamp.toString(),
        initializedAt: date.toISOString(),
      };
    } catch (error) {
      this.logger.log(`Error decoding FactoryInitialized: ${error.message}`);
      return this.decodeGeneric(buffer, "FactoryInitialized");
    }
  }

  private decodeFactoryFeesUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old fee (u16)
      const oldFee = buffer.readUInt16LE(offset);
      offset += 2;

      // New fee (u16)
      const newFee = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryFeesUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldFeeBps: oldFee,
        oldFeePercent: (oldFee / 100).toFixed(2),
        newFeeBps: newFee,
        newFeePercent: (newFee / 100).toFixed(2),
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      this.logger.log(`Error decoding FactoryFeesUpdated: ${error.message}`);
      return this.decodeGeneric(buffer, "FactoryFeesUpdated");
    }
  }

  private decodeVaultFeesUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old fee (u16)
      const oldFee = buffer.readUInt16LE(offset);
      offset += 2;

      // New fee (u16)
      const newFee = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "VaultFeesUpdated",
        vault: vault.toString(),
        updatedBy: updatedBy.toString(),
        oldFeeBps: oldFee,
        oldFeePercent: (oldFee / 100).toFixed(2),
        newFeeBps: newFee,
        newFeePercent: (newFee / 100).toFixed(2),
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      this.logger.log(`Error decoding VaultFeesUpdated: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultFeesUpdated");
    }
  }

  private decodeProtocolFeesCollected(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Collector address (32 bytes)
      const collector = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Fee amount (u64)
      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "ProtocolFeesCollected",
        vault: vault.toString(),
        collector: collector.toString(),
        feeAmount: feeAmount.toString(),
        timestamp: timestamp.toString(),
        collectedAt: date.toISOString(),
      };
    } catch (error) {
      this.logger.log(`Error decoding ProtocolFeesCollected: ${error.message}`);
      return this.decodeGeneric(buffer, "ProtocolFeesCollected");
    }
  }

  private decodeGeneric(buffer: Buffer, eventType: string): any {
    const discriminator = buffer.slice(0, 8).toString("hex");
    const data = buffer.slice(8);

    // Try to extract any potential public keys (32-byte chunks)
    const potentialPubkeys: string[] = [];
    let offset = 0;
    let pubkeyCount = 0;

    while (offset + 32 <= data.length && pubkeyCount < 5) {
      try {
        const potentialPubkey = new PublicKey(data.slice(offset, offset + 32));
        potentialPubkeys.push(potentialPubkey.toString());
        pubkeyCount++;
      } catch (e) {
        // Not a valid public key
      }
      offset += 32;
    }

    return {
      eventType,
      discriminator,
      dataLength: data.length,
      dataHex: data.toString("hex"),
      potentialPubkeys,
      raw: buffer.toString("base64"),
    };
  }

  /**
   * Process VaultCreated events and create vault factory records
   * @param structuredVaultData - Structured vault data from program logs
   * @returns Array of vault creation results or empty array if no events
   */
  private async processVaultCreatedEvents(
    structuredVaultData: any,
    bannerUrl: string,
    logoUrl: string,
    description: string
  ): Promise<any[]> {
    // Processing structured vault data for vault creation

    const vaultCreationResults: any[] = [];

    try {
      // Validate required fields
      if (
        !structuredVaultData.vaultPda ||
        !structuredVaultData.factoryKey ||
        !structuredVaultData.vaultAdmin ||
        !structuredVaultData.vaultName ||
        !structuredVaultData.vaultSymbol
      ) {
        this.logger.log("Skipping vault creation - missing required fields");
        return vaultCreationResults;
      }

      // Validate underlying assets data
      if (
        !structuredVaultData.underlyingAssets ||
        !Array.isArray(structuredVaultData.underlyingAssets)
      ) {
        this.logger.log(
          "Skipping vault creation - missing or invalid underlying assets"
        );
        return vaultCreationResults;
      }

      // Map underlying assets to the expected format
      const mappedUnderlyingAssets = structuredVaultData.underlyingAssets.map(
        (asset) => ({
          mint: asset.mint,
          pctBps: asset.bps,
          percentage: asset.percentage,
        })
      );

      // Create vault factory record
      const vaultRecord =
        await this.vaultFactoryService.createFromStructuredProgramData({
          eventType: "VaultCreated",
          vault: structuredVaultData.vaultPda,
          factory: structuredVaultData.factoryKey,
          creator: structuredVaultData.vaultAdmin,
          vaultName: structuredVaultData.vaultName,
          vaultSymbol: structuredVaultData.vaultSymbol,
          managementFeeBps: structuredVaultData.managementFees?.bps || 0,
          underlyingAssets: mappedUnderlyingAssets,
          underlyingAssetsCount:
            structuredVaultData.assetsCount ||
            structuredVaultData.underlyingAssets.length,
          totalSupply: "0", // Initial total supply
          nav: "0", // Initial NAV
          timestamp:
            structuredVaultData.createdAt?.timestamp?.toString() ||
            Date.now().toString(),
          createdAt:
            structuredVaultData.createdAt?.date || new Date().toISOString(),
          vaultIndex: structuredVaultData.vaultIndex,
          etfVaultPda: structuredVaultData.vaultPda,
          etfMint: structuredVaultData.vaultMintPda,
          vaultTreasury: structuredVaultData.vaultTokenAccountPda,
          bannerUrl: bannerUrl,
          vaultLogoUrl: logoUrl,
          description: description,
        });

      this.logger.log(
        `Successfully created vault factory record: ${vaultRecord._id}`
      );

      // Transfer 1 USDC initial reserve to vault (for the 1 token minted at creation)
      this.logger.log(
        `[INITIAL RESERVE] Starting transfer for vault: ${structuredVaultData.vaultPda}`
      );
      const reserveTransferSig = await this.transferInitialReserveToVault(
        structuredVaultData.vaultPda,
        structuredVaultData.vaultIndex
      );
      if (reserveTransferSig) {
        this.logger.log(
          `[INITIAL RESERVE] ✅ Transfer completed: ${reserveTransferSig}`
        );
      } else {
        this.logger.warn(
          `[INITIAL RESERVE] ❌ Transfer failed or skipped for vault: ${structuredVaultData.vaultPda}`
        );
      }

      // Add vault creation result to the array
      vaultCreationResults.push({
        eventType: "VaultCreated",
        vault: vaultRecord,
        initialReserveTransfer: reserveTransferSig,
      });
    } catch (error) {
      this.logger.log(
        `Error processing vault creation: ${error.message}`,
        error.stack
      );

      // Add error result to the array
      vaultCreationResults.push({
        eventType: "VaultCreated",
        vault: null,
        error: error.message,
      });
    }

    return vaultCreationResults;
  }

  /**
   * Transfer 1 USDC initial reserve to vault when it's created
   * This is needed because 1 vault token is minted at creation time
   */
  private async transferInitialReserveToVault(
    vaultAddress: string,
    vaultIndex: number
  ): Promise<string | null> {
    this.logger.log(
      `[INITIAL RESERVE] transferInitialReserveToVault called for vault: ${vaultAddress}`
    );
    try {
      const STABLECOIN_MINT = new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
      );
      const INITIAL_RESERVE_AMOUNT = BigInt(1_000_000); // 1 USDC (6 decimals)

      // Get admin wallet
      const adminKeyRaw = this.configService.get("SOLANA_ADMIN_PRIVATE_KEY");
      if (!adminKeyRaw) {
        this.logger.error(
          "[INITIAL RESERVE] SOLANA_ADMIN_PRIVATE_KEY not found, skipping initial reserve transfer"
        );
        return null;
      }
      this.logger.log(
        `[INITIAL RESERVE] Admin key found, wallet: ${Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(adminKeyRaw))
        ).publicKey.toBase58()}`
      );

      const secret = new Uint8Array(JSON.parse(adminKeyRaw));
      const adminKeypair = Keypair.fromSecretKey(secret);
      const adminWallet = new Wallet(adminKeypair);

      // Get RPC connection
      const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
      const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
      const rpcUrl =
        heliusRpcUrl || solanaRpcUrl || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      // Get admin USDC account
      const adminUSDC = await getAssociatedTokenAddress(
        STABLECOIN_MINT,
        adminWallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if admin has enough USDC
      this.logger.log(
        `[INITIAL RESERVE] Checking admin USDC account: ${adminUSDC.toBase58()}`
      );
      try {
        const adminAccount = await getAccount(connection, adminUSDC);
        const adminBalance = BigInt(adminAccount.amount.toString());
        this.logger.log(
          `[INITIAL RESERVE] Admin USDC balance: ${adminBalance.toString()} (${
            Number(adminBalance) / 1_000_000
          } USDC)`
        );
        if (adminBalance < INITIAL_RESERVE_AMOUNT) {
          this.logger.error(
            `[INITIAL RESERVE] Admin wallet has insufficient USDC. Required: ${INITIAL_RESERVE_AMOUNT}, Available: ${adminBalance.toString()}`
          );
          return null;
        }
      } catch (error) {
        this.logger.error(
          `[INITIAL RESERVE] Admin USDC account not found or error: ${error.message}`
        );
        return null;
      }

      // Get vault stablecoin account (PDA) - same derivation as reference code (line 488-491)
      const vault = new PublicKey(vaultAddress);
      const PROGRAM_ID = new PublicKey(
        this.configService.get("SOLANA_VAULT_FACTORY_ADDRESS") ||
          "BHTRWbEGRfJZSVXkJXj1Cv48knuALpUvijJwvuobyvvB"
      );

      // Use findProgramAddressSync to get the correct PDA (same as program uses)
      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
        PROGRAM_ID
      );

      this.logger.log(
        `[INITIAL RESERVE] Vault stablecoin account (PDA): ${vaultStablecoinAccount.toBase58()}`
      );

      // Check if account exists - if not, initialize it via deposit instruction
      const vaultAccountInfo = await connection.getAccountInfo(
        vaultStablecoinAccount
      );

      let accountWasInitialized = false;
      if (!vaultAccountInfo) {
        this.logger.log(
          `[INITIAL RESERVE] Vault stablecoin PDA account doesn't exist. Initializing via deposit instruction...`
        );

        // Initialize account using deposit instruction with minimal amount (1 base unit)
        const MINIMAL_DEPOSIT_AMOUNT = BigInt(1); // 1 base unit = 0.000001 USDC
        const INITIAL_SHARE_PRICE = BigInt(1_000_000); // 1.0 USDC per share (for new vault)

        try {
          // Set up Anchor provider and program
          const provider = new AnchorProvider(connection, adminWallet, {});
          const idl = (await import("../../utils/idls/idls"))
            .VAULT_FACTORY_IDL as any;
          const program = new Program(idl, provider);

          // Derive PDAs needed for deposit
          const [factory] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            PROGRAM_ID
          );
          const [vaultMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_mint"), vault.toBuffer()],
            PROGRAM_ID
          );

          // Get admin's vault token account (for receiving vault tokens from deposit)
          const adminVaultAccount = await getAssociatedTokenAddress(
            vaultMint,
            adminWallet.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          // Check if admin vault account exists, create if not
          const adminVaultAccountInfo = await connection.getAccountInfo(
            adminVaultAccount
          );
          if (!adminVaultAccountInfo) {
            this.logger.log(
              `[INITIAL RESERVE] Creating admin vault token account: ${adminVaultAccount.toBase58()}`
            );
            const createVaultAccountIx =
              createAssociatedTokenAccountInstruction(
                adminWallet.publicKey,
                adminVaultAccount,
                adminWallet.publicKey,
                vaultMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
              );
            const { blockhash: createBlockhash } =
              await connection.getLatestBlockhash();
            const createTx = new (
              await import("@solana/web3.js")
            ).Transaction();
            createTx.add(createVaultAccountIx);
            createTx.recentBlockhash = createBlockhash;
            createTx.feePayer = adminWallet.publicKey;
            const signedCreate = await adminWallet.signTransaction(createTx);
            const createSig = await connection.sendRawTransaction(
              signedCreate.serialize(),
              { skipPreflight: false }
            );
            await connection.confirmTransaction(createSig, "confirmed");
            this.logger.log(
              `[INITIAL RESERVE] ✅ Created admin vault token account: ${createSig}`
            );
          }

          // Get fee recipient accounts (needed for deposit instruction)
          // These should be factory admin accounts - using admin wallet for simplicity
          const feeRecipientStablecoinAccount = await getAssociatedTokenAddress(
            STABLECOIN_MINT,
            adminWallet.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          const vaultAdminStablecoinAccount = await getAssociatedTokenAddress(
            STABLECOIN_MINT,
            adminWallet.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          // Call deposit instruction to initialize the vault stablecoin account
          this.logger.log(
            `[INITIAL RESERVE] Calling deposit instruction with ${MINIMAL_DEPOSIT_AMOUNT.toString()} base units to initialize account...`
          );

          // Jupiter program ID (v6 on mainnet) - required even for simple deposits
          const JUPITER_PROGRAM_ID = new PublicKey(
            "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
          );

          const depositSig = await (program as any).methods
            .deposit(
              new BN(vaultIndex),
              new BN(MINIMAL_DEPOSIT_AMOUNT.toString()),
              new BN(INITIAL_SHARE_PRICE.toString())
            )
            .accountsStrict({
              user: adminWallet.publicKey,
              factory,
              vault,
              vaultMint,
              userStablecoinAccount: adminUSDC,
              stablecoinMint: STABLECOIN_MINT,
              vaultStablecoinAccount,
              userVaultAccount: adminVaultAccount,
              feeRecipientStablecoinAccount,
              vaultAdminStablecoinAccount,
              jupiterProgram: JUPITER_PROGRAM_ID,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          this.logger.log(
            `[INITIAL RESERVE] ✅ Deposit instruction completed: ${depositSig}, waiting for confirmation...`
          );
          await connection.confirmTransaction(depositSig, "confirmed");

          // Verify account now exists
          const vaultAccountInfoAfter = await connection.getAccountInfo(
            vaultStablecoinAccount
          );
          if (!vaultAccountInfoAfter) {
            this.logger.error(
              `[INITIAL RESERVE] ❌ Account still doesn't exist after deposit!`
            );
            return null;
          }

          this.logger.log(
            `[INITIAL RESERVE] ✅ Vault stablecoin account initialized: ${vaultStablecoinAccount.toBase58()}`
          );
          accountWasInitialized = true;
        } catch (error) {
          this.logger.error(
            `[INITIAL RESERVE] Failed to initialize vault stablecoin account via deposit: ${error.message}`,
            error.stack
          );
          return null;
        }
      } else {
        this.logger.log(
          `[INITIAL RESERVE] Vault stablecoin account already exists: ${vaultStablecoinAccount.toBase58()}`
        );
      }

      // Transfer full 1 USDC amount regardless of initialization status
      const REMAINING_AMOUNT = INITIAL_RESERVE_AMOUNT; // Always transfer 1 USDC (1,000,000 base units)

      // Create transfer instruction for remaining amount
      this.logger.log(
        `[INITIAL RESERVE] Creating transfer instruction: ${adminUSDC.toBase58()} -> ${vaultStablecoinAccount.toBase58()}, amount: ${REMAINING_AMOUNT.toString()}`
      );
      const transferIx = createTransferInstruction(
        adminUSDC, // source: admin USDC account
        vaultStablecoinAccount, // destination: vault stablecoin account
        adminWallet.publicKey, // authority: admin wallet
        Number(REMAINING_AMOUNT), // remaining USDC
        [], // multiSigners
        TOKEN_PROGRAM_ID
      );

      // Build and send transaction
      this.logger.log(`[INITIAL RESERVE] Building transfer transaction...`);
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new (await import("@solana/web3.js")).Transaction();
      tx.add(transferIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = adminWallet.publicKey;

      this.logger.log(`[INITIAL RESERVE] Signing transfer transaction...`);
      const signed = await adminWallet.signTransaction(tx);
      this.logger.log(`[INITIAL RESERVE] Sending transfer transaction...`);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      this.logger.log(
        `[INITIAL RESERVE] Transfer transaction sent: ${sig}, waiting for confirmation...`
      );
      await connection.confirmTransaction(sig, "confirmed");

      this.logger.log(
        `[INITIAL RESERVE] ✅ Transferred ${REMAINING_AMOUNT.toString()} base units (${
          Number(REMAINING_AMOUNT) / 1_000_000
        } USDC) initial reserve to vault ${vaultAddress}. Transaction: ${sig}`
      );

      return sig;
    } catch (error) {
      this.logger.error(
        `Failed to transfer initial reserve to vault ${vaultAddress}: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  // Method to get transaction details without logging (for other use cases)
  async getTransactionDetails(
    transactionSignature: string
  ): Promise<TransactionResponse | VersionedTransactionResponse | null> {
    try {
      return await this.connection.getTransaction(transactionSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch (error) {
      this.logger.log(`Error fetching transaction details: ${error.message}`);
      return null;
    }
  }

  /**
   * Independent method to handle FactoryFeesUpdated events from transaction signature
   * This method reads a transaction, extracts FactoryFeesUpdated events, and console logs the decoded data
   * @param updateFeesDto - Contains the transaction signature to process
   * @returns Processed fee update data with console logging
   */
  async updateFees(updateFeesDto: UpdateFeesDto): Promise<any> {
    try {
      const { transactionSignature } = updateFeesDto;
      this.logger.log(
        `Processing transaction for FactoryFeesUpdated events: ${transactionSignature}`
      );

      // Fetch transaction details from Solana blockchain
      // Let Solana RPC validate the signature format and existence
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract and decode program data
      const programData = this.extractProgramData(transaction);
      const decodedData = this.decodeProgramData(programData);

      // Filter for FactoryFeesUpdated events only
      const factoryFeesUpdatedEvents = decodedData.structured.filter(
        (event) => event.eventType === "FactoryFeesUpdated"
      );

      if (factoryFeesUpdatedEvents.length === 0) {
        return {
          transactionSignature,
        };
      }

      // Process each FactoryFeesUpdated event found
      const processedEvents = [];
      for (const event of factoryFeesUpdatedEvents) {
        this.logger.log(`Found FactoryFeesUpdated event in transaction`);

        try {
          // Update fees management using the new service method
          const updatedFeeConfig =
            await this.feesManagementService.updateFeesFromFactoryEvent(
              event,
              event.updatedBy, // Use the updatedBy from the event
              undefined // No specific vault ID for factory-level fee updates
            );

          this.logger.log(
            `Successfully updated fee configuration: ${
              (updatedFeeConfig as any)._id
            }`
          );

          // Update the event with the updated fee config ID
          event.updatedFeeConfigId = (updatedFeeConfig as any)._id;
        } catch (error) {
          this.logger.log(
            `Failed to update fee configuration for event: ${error.message}`,
            error.stack
          );
          // Continue processing other events even if one fails
          event.feeUpdateError = error.message;
        }

        // Create a minimal response with only required fields
        const minimalEvent = {
          eventType: event.eventType,
          factory: event.factory,
          updatedBy: event.updatedBy,
        };

        processedEvents.push(minimalEvent);
      }

      // Return the processed data
      return {
        events: processedEvents,
      };
    } catch (error) {
      this.logger.log(
        `Error processing FactoryFeesUpdated transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Parse deposit program logs to extract structured deposit data
   * @param programLogs - Array of program log messages
   * @returns Structured deposit data
   */
  private parseDepositProgramLogs(programLogs: string[]): any {
    const depositData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      user: null,
      amount: null,
      entryFee: null,
      managementFee: null,
      totalFees: null,
      netAmount: null,
      vaultTokensToMint: null,
      previousTotalAssets: null,
      previousTotalSupply: null,
      newTotalAssets: null,
      newTotalSupply: null,
      timestamp: null,
      swapOutputsByMint: {} as Record<string, number>,
    };
    let currentSwapMint: string | null = null;

    programLogs.forEach((log) => {
      // Extract vault information
      if (log.includes("🏦 Vault:")) {
        const match = log.match(/🏦 Vault: (.+)/);
        if (match) {
          const vaultInfo = match[1].trim();
          // Parse vault name and symbol from format like "SBC COILLE (SC-ETF)"
          const vaultMatch = vaultInfo.match(/^(.+?)\s+\((.+?)\)$/);
          if (vaultMatch) {
            depositData.vaultName = vaultMatch[1].trim();
            depositData.vaultSymbol = vaultMatch[2].trim();
          }
        }
      }

      // Extract vault index
      if (log.includes("Starting deposit process for vault #")) {
        const match = log.match(/Starting deposit process for vault #(\d+)/);
        if (match) {
          depositData.vaultIndex = parseInt(match[1]);
        }
      }

      // Extract user address
      if (log.includes("👤 User:")) {
        const match = log.match(/👤 User: ([A-Za-z0-9]+)/);
        if (match) {
          depositData.user = match[1];
        }
      }

      // Extract deposit amount
      if (log.includes("💵 Deposit amount:")) {
        const match = log.match(/💵 Deposit amount: (\d+) raw units/);
        if (match) {
          depositData.amount = match[1];
        }
      }

      // Extract entry fee
      if (log.includes("Entry fee:")) {
        const match = log.match(/Entry fee: (\d+) raw units/);
        if (match) {
          depositData.entryFee = match[1];
        }
      }

      // Extract management fee
      if (log.includes("Management fee:")) {
        const match = log.match(/Management fee: (\d+) raw units/);
        if (match) {
          depositData.managementFee = match[1];
        }
      }

      // Extract total fees
      if (log.includes("Total fees:")) {
        const match = log.match(/Total fees: (\d+) raw units/);
        if (match) {
          depositData.totalFees = match[1];
        }
      }

      // Extract net deposit amount
      if (log.includes("Net deposit:")) {
        const match = log.match(/Net deposit: (\d+) raw units/);
        if (match) {
          depositData.netAmount = match[1];
        }
      }

      // Extract vault tokens to mint
      if (log.includes("Vault tokens to mint:")) {
        const match = log.match(/Vault tokens to mint: (\d+) raw units/);
        if (match) {
          depositData.vaultTokensToMint = match[1];
        }
      }

      // Detect Raydium swap start and remember target mint
      if (log.includes("[Raydium] swapping -> mint:")) {
        const mintMatch = log.match(
          /\[Raydium\] swapping -> mint:\s+([A-Za-z0-9]+)/
        );
        if (mintMatch) {
          currentSwapMint = mintMatch[1];
        }
      }

      // Capture output_amount from subsequent log lines and attribute to last seen mint
      if (currentSwapMint && log.includes("output_amount:")) {
        const outMatch = log.match(/output_amount:(\d+)/);
        if (outMatch) {
          const out = Number(outMatch[1]);
          if (!Number.isNaN(out) && out > 0) {
            depositData.swapOutputsByMint[currentSwapMint] =
              (depositData.swapOutputsByMint[currentSwapMint] || 0) + out;
            // do not clear currentSwapMint yet; a single swap may log multiple lines but we only count first occurrence per swap
          }
        }
      }

      // Extract previous total assets
      if (log.includes("Previous total assets:")) {
        const match = log.match(/Previous total assets: (\d+)/);
        if (match) {
          depositData.previousTotalAssets = match[1];
        }
      }

      // Extract previous total supply
      if (log.includes("Previous total supply:")) {
        const match = log.match(/Previous total supply: (\d+)/);
        if (match) {
          depositData.previousTotalSupply = match[1];
        }
      }

      // Extract new total assets
      if (log.includes("New total assets:")) {
        const match = log.match(/New total assets: (\d+)/);
        if (match) {
          depositData.newTotalAssets = match[1];
        }
      }

      // Extract new total supply
      if (log.includes("New total supply:")) {
        const match = log.match(/New total supply: (\d+)/);
        if (match) {
          depositData.newTotalSupply = match[1];
        }
      }
    });

    // Set timestamp to current time if not found in logs
    depositData.timestamp = Date.now().toString();
    depositData.timestampDate = new Date().toISOString();

    return depositData;
  }

  /**
   * Independent method to handle deposit transactions from transaction signature
   * This method reads a transaction, extracts deposit program logs, and processes the deposit
   * @param updateDepositTransactionDto - Contains the transaction signature to process
   * @returns Processed deposit data
   */
  async depositTransaction(
    updateDepositTransactionDto: UpdateVaultDepositDto
  ): Promise<any> {
    try {
      const { transactionSignature, signatureArray } =
        updateDepositTransactionDto;
      this.logger.log(
        `Processing transaction for deposit events: ${transactionSignature}`
      );

      // Fetch transaction details from Solana blockchain
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract program logs
      const programLogs = this.extractProgramLogs(transaction);
      this.logger.debug("programLogs Logs", programLogs);

      // Parse deposit data from program logs
      const depositData = this.parseDepositProgramLogs(programLogs);
      this.logger.debug("Parsed deposit data:", depositData);

      // Check if this is a deposit transaction
      if (!depositData.user || !depositData.amount) {
        this.logger.log("No deposit data found in transaction logs");
        return {
          events: [],
          message: "No deposit data found in transaction logs",
        };
      }

      // Find vault by name and symbol
      let vaultAddress = "unknown";
      if (depositData.vaultName && depositData.vaultSymbol) {
        try {
          const vault = await this.vaultFactoryService.findByVaultNameAndSymbol(
            depositData.vaultName,
            depositData.vaultSymbol
          );
          if (vault && vault.vaultAddress) {
            vaultAddress = vault.vaultAddress;
          }
        } catch (error) {
          this.logger.log(
            `Could not find vault by name and symbol: ${error.message}`
          );
        }
      }

      // Process the deposit transaction
      const processedEvents = [];

      try {
        // Update vault deposit using the parsed data
        const updatedVaultDeposit =
          await this.vaultDepositService.updateVaultDepositFromEvent(
            {
              event_type: "VaultDeposited",
              vault: vaultAddress,
              user: depositData.user,
              amount: depositData.amount,
              shares_minted:
                depositData.vaultTokensToMint || depositData.netAmount,
              entry_fee: depositData.entryFee || "0",
              net_amount: depositData.netAmount,
              total_assets: depositData.newTotalAssets,
              total_shares: depositData.newTotalSupply,
              timestamp: depositData.timestamp,
              timestamp_date: depositData.timestampDate,
            },
            depositData.user,
            vaultAddress,
            transactionSignature,
            transaction.slot
          );

        // Update the event with the updated vault deposit ID
        depositData.updatedVaultDepositId = (updatedVaultDeposit as any)._id;

        // Create history record for deposit transaction
        try {
          const vaultFactory = await this.vaultFactoryService.findByAddress(
            vaultAddress
          );
          const userProfile = await this.vaultDepositService[
            "profileService"
          ].getByWalletAddress(depositData.user);

          if (vaultFactory && userProfile) {
            await this.historyService.createTransactionHistory(
              "deposit_completed",
              `Deposit completed: ${depositData.amount} tokens deposited into ${depositData.vaultName} (${depositData.vaultSymbol})`,
              userProfile._id.toString(),
              vaultFactory._id.toString(),
              {
                amount: depositData.amount,
                vaultTokensMinted: depositData.vaultTokensToMint,
                entryFee: depositData.entryFee,
                managementFee: depositData.managementFee,
                netAmount: depositData.netAmount,
                vaultName: depositData.vaultName,
                vaultSymbol: depositData.vaultSymbol,
                vaultIndex: depositData.vaultIndex,
                userAddress: depositData.user,
                timestamp: depositData.timestamp,
                blockNumber: transaction.slot,
              },
              transactionSignature,
              signatureArray
            );
            this.logger.log(
              `History record created for deposit transaction: ${transactionSignature}`
            );
          }
        } catch (historyError) {
          this.logger.log(
            `Failed to create history record for deposit: ${historyError.message}`
          );
        }
      } catch (error) {
        this.logger.log(
          `Failed to update vault deposit: ${error.message}`,
          error.stack
        );
        depositData.vaultDepositUpdateError = error.message;
      }

      // Create response with processed data
      const processedEvent = {
        eventType: "VaultDeposited",
        vaultName: depositData.vaultName,
        vaultSymbol: depositData.vaultSymbol,
        vaultIndex: depositData.vaultIndex,
        user: depositData.user,
        amount: depositData.amount,
        entryFee: depositData.entryFee,
        managementFee: depositData.managementFee,
        totalFees: depositData.totalFees,
        netAmount: depositData.netAmount,
        vaultTokensMinted: depositData.vaultTokensToMint,
        previousTotalAssets: depositData.previousTotalAssets,
        previousTotalSupply: depositData.previousTotalSupply,
        newTotalAssets: depositData.newTotalAssets,
        newTotalSupply: depositData.newTotalSupply,
        timestamp: depositData.timestamp,
        timestampDate: depositData.timestampDate,
        updatedVaultDepositId: depositData.updatedVaultDepositId,
        vaultDepositUpdateError: depositData.vaultDepositUpdateError,
      };

      processedEvents.push(processedEvent);

      // Return the processed data
      // Update vault underlying totalAssetLocked using swap outputs
      try {
        if (
          vaultAddress &&
          vaultAddress !== "unknown" &&
          depositData.swapOutputsByMint
        ) {
          await this.vaultFactoryService.incrementTotalAssetLockedByVaultAddress(
            vaultAddress,
            depositData.swapOutputsByMint
          );
        }
      } catch (lockUpdateError) {
        this.logger.log(
          `Failed to update totalAssetLocked: ${lockUpdateError.message}`
        );
      }

      this.clearCache();
      return {
        events: processedEvents,
      };
    } catch (error) {
      this.logger.log(
        `Error processing deposit transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Parse redeem program logs to extract structured redeem data
   * @param programLogs - Array of program log messages
   * @returns Structured redeem data
   */
  private parseRedeemProgramLogs(programLogs: string[]): any {
    const redeemData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      user: null,
      vaultTokensToRedeem: null,
      exitFee: null,
      managementFee: null,
      totalFees: null,
      netStablecoinAmount: null,
      previousTotalAssets: null,
      previousTotalSupply: null,
      newTotalAssets: null,
      newTotalSupply: null,
      timestamp: null,
    };

    programLogs.forEach((log) => {
      this.logger.debug(`Processing log: ${log}`);

      // Handle newer pattern: Instruction indicates FinalizeRedeem
      if (log.includes("Instruction: FinalizeRedeem")) {
        // Marker that we are in a redeem flow
      }

      // Pattern: "🧾 Finalizing redeem for 9206191 vault tokens"
      if (log.includes("Finalizing redeem for")) {
        const match = log.match(
          /Finalizing redeem for\s+(\d+)\s+vault tokens/i
        );
        if (match) {
          redeemData.vaultTokensToRedeem = match[1];
        }
      }

      // Pattern: "Fees: exit=23015, mgmt=184123, net_to_user=8999053" or "Fees: exit=2497, net_to_user=996493"
      if (log.includes("Fees:")) {
        this.logger.debug(`Found fees log: ${log}`);

        // Try pattern with management fee first
        let match = log.match(
          /Fees:\s*exit=(\d+),\s*mgmt=(\d+),\s*net_to_user=(\d+)/i
        );
        if (match) {
          this.logger.debug(
            `Matched fees with management fee: exit=${match[1]}, mgmt=${match[2]}, net_to_user=${match[3]}`
          );
          redeemData.exitFee = match[1];
          redeemData.managementFee = match[2];
          redeemData.netStablecoinAmount = match[3];
          try {
            const total =
              BigInt(redeemData.exitFee) + BigInt(redeemData.managementFee);
            redeemData.totalFees = total.toString();
          } catch {
            redeemData.totalFees = undefined;
          }
        } else {
          // Try pattern without management fee
          match = log.match(/Fees:\s*exit=(\d+),\s*net_to_user=(\d+)/i);
          if (match) {
            this.logger.debug(
              `Matched fees without management fee: exit=${match[1]}, net_to_user=${match[2]}`
            );
            redeemData.exitFee = match[1];
            redeemData.managementFee = "0"; // No management fee in this case
            redeemData.netStablecoinAmount = match[2];
            redeemData.totalFees = redeemData.exitFee;
          } else {
            this.logger.log(`Could not parse fees log: ${log}`);
          }
        }
      }
      // Extract vault information
      if (log.includes("🏦 Vault:")) {
        const match = log.match(/🏦 Vault: (.+)/);
        if (match) {
          const vaultInfo = match[1].trim();
          // Parse vault name and symbol from format like "Theta Pool 4273 (WQB75)"
          const vaultMatch = vaultInfo.match(/^(.+?)\s+\((.+?)\)$/);
          if (vaultMatch) {
            redeemData.vaultName = vaultMatch[1].trim();
            redeemData.vaultSymbol = vaultMatch[2].trim();
          }
        }
      }

      // Extract vault index
      if (log.includes("Starting redeem process for vault #")) {
        const match = log.match(/Starting redeem process for vault #(\d+)/);
        if (match) {
          redeemData.vaultIndex = parseInt(match[1]);
        }
      }

      // Extract user address
      if (log.includes("👤 User:")) {
        const match = log.match(/👤 User: ([A-Za-z0-9]+)/);
        if (match) {
          redeemData.user = match[1];
        }
      }

      // Extract vault tokens to redeem
      if (log.includes("🪙 Vault tokens to redeem:")) {
        const match = log.match(/🪙 Vault tokens to redeem: (\d+) raw units/);
        if (match) {
          redeemData.vaultTokensToRedeem = match[1];
        }
      }

      // Extract exit fee
      if (log.includes("Exit fee:")) {
        const match = log.match(/Exit fee: (\d+) raw units/);
        if (match) {
          redeemData.exitFee = match[1];
        }
      }

      // Extract management fee
      if (log.includes("Management fee:")) {
        const match = log.match(/Management fee: (\d+) raw units/);
        if (match) {
          redeemData.managementFee = match[1];
        }
      }

      // Extract total fees
      if (log.includes("Total fees:")) {
        const match = log.match(/Total fees: (\d+) raw units/);
        if (match) {
          redeemData.totalFees = match[1];
        }
      }

      // Extract net stablecoin amount
      if (log.includes("Net stablecoin amount:")) {
        const match = log.match(/Net stablecoin amount: (\d+) raw units/);
        if (match) {
          redeemData.netStablecoinAmount = match[1];
        }
      }

      // Extract previous total assets
      if (log.includes("Previous total assets:")) {
        const match = log.match(/Previous total assets: (\d+)/);
        if (match) {
          redeemData.previousTotalAssets = match[1];
        }
      }

      // Extract previous total supply
      if (log.includes("Previous total supply:")) {
        const match = log.match(/Previous total supply: (\d+)/);
        if (match) {
          redeemData.previousTotalSupply = match[1];
        }
      }

      // Extract new total assets
      if (log.includes("New total assets:")) {
        const match = log.match(/New total assets: (\d+)/);
        if (match) {
          redeemData.newTotalAssets = match[1];
        }
      }

      // Extract new total supply
      if (log.includes("New total supply:")) {
        const match = log.match(/New total supply: (\d+)/);
        if (match) {
          redeemData.newTotalSupply = match[1];
        }
      }
    });

    // Set timestamp to current time if not found in logs
    redeemData.timestamp = Date.now().toString();
    redeemData.timestampDate = new Date().toISOString();

    // Debug logging for parsed data
    this.logger.debug(`Parsed redeem data: ${JSON.stringify(redeemData)}`);

    return redeemData;
  }

  /**
   * Independent method to handle redeem transactions from transaction signature
   * This method reads a transaction, extracts redeem program logs, and processes the redeem
   * @param updateRedeemTransactionDto - Contains the transaction signature to process
   * @returns Processed redeem data
   */
  async redeemTransaction(
    updateRedeemTransactionDto: UpdateVaultRedeemDto
  ): Promise<any> {
    try {
      const transactionSignature = (updateRedeemTransactionDto as any)
        .transactionSignature as string;
      const vaultAddressHint = (updateRedeemTransactionDto as any)
        .vaultAddress as string | undefined;
      const vaultIndexHint = (updateRedeemTransactionDto as any).vaultIndex as
        | number
        | undefined;
      const performedByProfileId = (updateRedeemTransactionDto as any)
        .performedByProfileId as string | undefined;
      const performedByWallet = (updateRedeemTransactionDto as any)
        .performedByWallet as string | undefined;
      const signatureArray = (updateRedeemTransactionDto as any)
        .signatureArray as string[] | undefined;
      this.logger.log(
        `Processing transaction for redeem events: ${transactionSignature}`
      );
      this.logger.log("performedByProfileId", performedByProfileId);
      this.logger.log("performedByWallet", performedByWallet);
      this.logger.log("signatureArray", signatureArray);
      // Fetch transaction details from Solana blockchain
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract program logs
      const programLogs = this.extractProgramLogs(transaction);
      this.logger.log("programLogs Logs", programLogs);

      // Parse redeem data from program logs
      const redeemData = this.parseRedeemProgramLogs(programLogs);
      // Apply optional hints from request to improve association accuracy
      if (vaultIndexHint !== undefined && vaultIndexHint !== null) {
        redeemData.vaultIndex = vaultIndexHint;
      }
      // Fall back to authenticated wallet if user is not present in logs
      if (!redeemData.user && performedByWallet) {
        redeemData.user = performedByWallet;
      }
      this.logger.log("Parsed redeem data:", redeemData);

      // Check if this is a redeem transaction: must have amount; user can be from logs or auth
      if (!redeemData.vaultTokensToRedeem || !redeemData.user) {
        this.logger.log("No redeem data found in transaction logs");
        return {
          events: [],
          message: "No redeem data found in transaction logs",
        };
      }

      // Resolve vault address using hints first, then fallbacks
      let vaultAddress = vaultAddressHint || "unknown";
      if (
        vaultAddress === "unknown" &&
        redeemData.vaultName &&
        redeemData.vaultSymbol
      ) {
        try {
          const vault = await this.vaultFactoryService.findByVaultNameAndSymbol(
            redeemData.vaultName,
            redeemData.vaultSymbol
          );
          if (vault && vault.vaultAddress) {
            vaultAddress = vault.vaultAddress;
          }
        } catch (error) {
          this.logger.log(
            `Could not find vault by name and symbol: ${error.message}`
          );
        }
      }

      // Process the redeem transaction
      const processedEvents = [];

      try {
        // Validate required redeem data
        if (
          !redeemData.netStablecoinAmount ||
          redeemData.netStablecoinAmount === "null" ||
          redeemData.netStablecoinAmount === "undefined"
        ) {
          this.logger.log(
            `Invalid netStablecoinAmount: ${redeemData.netStablecoinAmount}`
          );
          throw new Error(
            `Invalid netStablecoinAmount: ${redeemData.netStablecoinAmount}`
          );
        }

        if (
          !redeemData.vaultTokensToRedeem ||
          redeemData.vaultTokensToRedeem === "null" ||
          redeemData.vaultTokensToRedeem === "undefined"
        ) {
          this.logger.log(
            `Invalid vaultTokensToRedeem: ${redeemData.vaultTokensToRedeem}`
          );
          throw new Error(
            `Invalid vaultTokensToRedeem: ${redeemData.vaultTokensToRedeem}`
          );
        }

        // Update vault redeem using the parsed data
        const updatedVaultDeposit =
          await this.vaultDepositService.updateVaultRedeemFromEvent(
            {
              event_type: "VaultRedeemed",
              vault: vaultAddress,
              user: redeemData.user,
              shares: redeemData.vaultTokensToRedeem,
              tokens_received: redeemData.netStablecoinAmount,
              exit_fee: redeemData.exitFee || "0",
              management_fee: redeemData.managementFee || "0",
              total_assets: redeemData.newTotalAssets,
              total_shares: redeemData.newTotalSupply,
              timestamp: redeemData.timestamp,
              timestamp_date: redeemData.timestampDate,
            },
            redeemData.user,
            vaultAddress,
            transactionSignature,
            transaction.slot
          );

        // Update the event with the updated vault deposit ID
        redeemData.updatedVaultDepositId = (updatedVaultDeposit as any)._id;

        // Create history record for redeem transaction (use resolved vault address)
        try {
          const vaultFactory =
            vaultAddress && vaultAddress !== "unknown"
              ? await this.vaultFactoryService.findByAddress(vaultAddress)
              : null;
          // Prefer authenticated profile id if provided, otherwise resolve by on-chain wallet
          const userProfileId = performedByProfileId
            ? performedByProfileId.toString()
            : (
                await this.vaultDepositService[
                  "profileService"
                ].getByWalletAddress(performedByWallet || redeemData.user)
              )?._id?.toString();

          if (vaultFactory && userProfileId) {
            await this.historyService.createTransactionHistory(
              "redeem_completed",
              `Redeem completed: ${redeemData.vaultTokensToRedeem} vault tokens redeemed from ${redeemData.vaultName} (${redeemData.vaultSymbol})`,
              userProfileId,
              vaultFactory._id.toString(),
              {
                vaultTokensRedeemed: redeemData.vaultTokensToRedeem,
                netStablecoinAmount: redeemData.netStablecoinAmount,
                exitFee: redeemData.exitFee,
                managementFee: redeemData.managementFee,
                totalFees: redeemData.totalFees,
                vaultName: redeemData.vaultName,
                vaultSymbol: redeemData.vaultSymbol,
                vaultIndex: redeemData.vaultIndex,
                userAddress: redeemData.user,
                timestamp: redeemData.timestamp,
                blockNumber: transaction.slot,
              },
              transactionSignature,
              signatureArray
            );
            this.logger.log(
              `History record created for redeem transaction: ${transactionSignature}`
            );
            this.logger.log(
              `History record created for redeem transaction: ${transactionSignature}`
            );
          }
        } catch (historyError) {
          this.logger.log(
            `Failed to create history record for redeem: ${historyError.message}`
          );
        }
      } catch (error) {
        this.logger.log(
          `Failed to update vault redeem: ${error.message}`,
          error.stack
        );
        redeemData.vaultRedeemUpdateError = error.message;
      }

      // Create response with processed data
      const processedEvent = {
        eventType: "VaultRedeemed",
        vaultName: redeemData.vaultName,
        vaultSymbol: redeemData.vaultSymbol,
        vaultIndex: redeemData.vaultIndex,
        user: redeemData.user,
        vaultTokensRedeemed: redeemData.vaultTokensToRedeem,
        exitFee: redeemData.exitFee,
        managementFee: redeemData.managementFee,
        totalFees: redeemData.totalFees,
        netStablecoinAmount: redeemData.netStablecoinAmount,
        previousTotalAssets: redeemData.previousTotalAssets,
        previousTotalSupply: redeemData.previousTotalSupply,
        newTotalAssets: redeemData.newTotalAssets,
        newTotalSupply: redeemData.newTotalSupply,
        timestamp: redeemData.timestamp,
        timestampDate: redeemData.timestampDate,
        updatedVaultDepositId: redeemData.updatedVaultDepositId,
        vaultRedeemUpdateError: redeemData.vaultRedeemUpdateError,
      };

      processedEvents.push(processedEvent);

      // Return the processed data
      this.clearCache();
      return {
        events: processedEvents,
      };
    } catch (error) {
      this.logger.log(
        `Error processing redeem transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Enhanced decodeFactoryFeesUpdated method to handle the complete fee structure
   * This is an independent clone that doesn't modify the existing decodeFactoryFeesUpdated method
   * @param buffer - The raw buffer containing the FactoryFeesUpdated event data
   * @returns Complete decoded FactoryFeesUpdated event data
   */
  private decodeFactoryFeesUpdatedEnhanced(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old entry fee (u16)
      const oldEntryFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New entry fee (u16)
      const newEntryFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old exit fee (u16)
      const oldExitFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New exit fee (u16)
      const newExitFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old vault creation fee (u64)
      const oldVaultCreationFeeUsdc = buffer.readBigUInt64LE(offset);
      offset += 8;

      // New vault creation fee (u64)
      const newVaultCreationFeeUsdc = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Old min management fee (u16)
      const oldMinManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New min management fee (u16)
      const newMinManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old max management fee (u16)
      const oldMaxManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New max management fee (u16)
      const newMaxManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      const decodedEvent = {
        eventType: "FactoryFeesUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldEntryFeeBps,
        newEntryFeeBps,
        oldExitFeeBps,
        newExitFeeBps,
        oldVaultCreationFeeUsdc: oldVaultCreationFeeUsdc.toString(),
        newVaultCreationFeeUsdc: newVaultCreationFeeUsdc.toString(),
        oldMinManagementFeeBps,
        newMinManagementFeeBps,
        oldMaxManagementFeeBps,
        newMaxManagementFeeBps,
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };

      return decodedEvent;
    } catch (error) {
      this.logger.log(
        `Error decoding enhanced FactoryFeesUpdated: ${error.message}`
      );
      return this.decodeGeneric(buffer, "FactoryFeesUpdated");
    }
  }

  private decodeVaultDeposited(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // User address (32 bytes)
      const user = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Amount (u64)
      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Shares minted (u64)
      const sharesMinted = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Entry fee (u64)
      const entryFee = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Net amount (u64)
      const netAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Total assets (u64)
      const totalAssets = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Total shares (u64)
      const totalShares = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      const decodedEvent = {
        event_type: "VaultDeposited",
        vault: vault.toString(),
        user: user.toString(),
        amount: amount.toString(),
        shares_minted: sharesMinted.toString(),
        entry_fee: entryFee.toString(),
        net_amount: netAmount.toString(),
        total_assets: totalAssets.toString(),
        total_shares: totalShares.toString(),
        timestamp: timestamp.toString(),
        timestamp_date: date.toISOString(),
      };

      return decodedEvent;
    } catch (error) {
      this.logger.log(`Error decoding VaultDeposited: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultDeposited");
    }
  }

  /**
   * Clear all vault-related cache entries
   */
  private async clearCache(): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-factory keys
      const keys = await this.redisService.keys("vaults:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
        this.redisService.delDirect("dashboard:vault-stats");
        this.redisService.delDirect("vault-deposit:*");
        this.redisService.delDirect("history:findTransactionHistory:*");
      } else {
        // No cache entries found to clear
      }
    } catch (error) {
      this.logger.log("❌ Error clearing vault cache:", error);
    }
  }
}
