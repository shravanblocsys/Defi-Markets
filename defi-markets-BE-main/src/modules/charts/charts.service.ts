import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TokenPrice } from "../cron-job/entities/token-price.entity";
import {
  SharePriceHistory,
  SharePriceHistoryDocument,
} from "../../schemas/share-price-history.schema";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { AssetAllocationService } from "../asset-allocation/asset-allocation.service";
import { NetworkType } from "../asset-allocation/entities/asset-allocation.entity";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { VAULT_FACTORY_IDL } from "../../utils/idls/idls";
import fetch from "node-fetch";

type IntervalUnit = "minute" | "hour" | "day" | "week";
type ChartInterval = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

export interface NavPoint {
  timestamp: Date;
  nav: number;
  gav: number;
  sharePrice?: number;
  totalSupply?: number;
}

export interface VaultContractData {
  vaultIndex: number;
  totalAssets: number;
  totalSupply: number;
  managementFees: number;
  accruedManagementFeesUsdc: number;
  lastFeeAccrualTs: number;
  underlyingAssets: Array<{
    mintAddress: PublicKey;
    mintBps: number;
  }>;
  admin: PublicKey;
}

export interface SharePriceData {
  vaultId: string;
  vaultName: string;
  vaultIndex: number;
  sharePrice: number;
  nav: number;
  totalSupply: number;
  gav: number;
  totalAssets: number;
  accruedManagementFeesUsdc: number;
  managementFees: number;
  timestamp: Date;
}

@Injectable()
export class ChartsService {
  private readonly logger = new Logger(ChartsService.name);
  private connection: Connection;
  private program: anchor.Program;
  private readonly JUP_PRICE_API = "https://lite-api.jup.ag/price/v3?ids=";
  private readonly JUPITER_API_KEY: string | undefined;

  constructor(
    @InjectModel(TokenPrice.name)
    private readonly tokenPriceModel: Model<TokenPrice>,
    @InjectModel(SharePriceHistory.name)
    private readonly sharePriceHistoryModel: Model<SharePriceHistoryDocument>,
    @Inject(forwardRef(() => VaultFactoryService))
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly configService: ConfigService,
    private readonly assetAllocationService: AssetAllocationService
  ) {
    this.JUPITER_API_KEY = this.configService.get("JUPITER_API_KEY");
    this.initializeSolanaConnection();
  }

  private initializeSolanaConnection(): void {
    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
    const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
    const rpcUrl =
      heliusRpcUrl ||
      solanaRpcUrl ||
      "https://api.mainnet-beta.solana.com";
    
    if (heliusRpcUrl) {
      this.logger.log(`Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      this.logger.log(`Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      this.logger.log(`Using default Solana RPC URL: ${rpcUrl}`);
    }
    
    this.connection = new Connection(rpcUrl, "confirmed");

    const factoryAddress = this.configService.get(
      "SOLANA_VAULT_FACTORY_ADDRESS"
    );
    if (!factoryAddress) {
      this.logger.warn(
        "SOLANA_VAULT_FACTORY_ADDRESS not found in environment variables"
      );
      return;
    }

    const programId = new PublicKey(factoryAddress);
    this.program = new anchor.Program(
      VAULT_FACTORY_IDL as anchor.Idl,
      new anchor.AnchorProvider(
        this.connection,
        new anchor.Wallet(anchor.web3.Keypair.generate()),
        { preflightCommitment: "processed" }
      )
    ) as anchor.Program;
  }

  // Solana contract interaction methods
  private pdaFactory(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      this.program.programId
    )[0];
  }

  private pdaVault(factory: PublicKey, index: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new anchor.BN(index).toArrayLike(Buffer, "le", 4),
      ],
      this.program.programId
    )[0];
  }

  private pdaVaultStablecoin(vault: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      this.program.programId
    )[0];
  }

  /**
   * Return vault-wise totalUsd values sequentially (one by one)
   * If vaultIds is provided (comma-separated), only those vaults are processed.
   * When vaultIds is not provided, also returns featuredVaults array.
   */
  async getVaultsTotalUsdSequential(vaultIds?: string): Promise<{
    data: Array<{
      vaultId: string;
      vaultName: string;
      vaultIndex: number;
      totalUsd: number;
      totalUsdLamports: number;
    }>;
    featuredVaults?: Array<{
      vaultId: string;
      vaultName: string;
      vaultIndex: number;
      totalUsd: number;
      totalUsdLamports: number;
    }>;
  }> {
    const results: Array<{
      vaultId: string;
      vaultName: string;
      vaultIndex: number;
      totalUsd: number;
      totalUsdLamports: number;
    }> = [];

    // Determine target vaults
    let targetVaults: any[] = [];
    const isFetchingAll = !vaultIds || !vaultIds.trim();

    if (!isFetchingAll) {
      const ids = vaultIds
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      for (const id of ids) {
        try {
          const v = await this.vaultFactoryService.findById(id);
          if (v) targetVaults.push(v);
        } catch {
          // skip invalid ids
        }
      }
    } else {
      // Fallback to all vaults
      try {
        targetVaults = await this.vaultFactoryService.findAll();
      } catch (e) {
        this.logger.error("Failed to load vaults for totalUsd calculation", e);
        return { data: results };
      }
    }

    // Process sequentially to reduce rate-limit pressure
    for (const v of targetVaults) {
      const vaultId = String(v._id ?? v.id ?? "");
      const vaultName = v.vaultName ?? "";
      const vaultIndex = Number(v.vaultIndex ?? -1);
      let totalUsd = 0;
      let totalUsdLamports = 0;

      if (vaultIndex >= 0) {
        try {
          const data = await this.getVaultContractData(vaultIndex);
          if (data) {
            totalUsd = Number((data as any).portfolioUsd || 0);
            totalUsdLamports = Number((data as any).portfolioUsdLamports || 0);
          }
        } catch (e) {
          this.logger.warn(
            `Failed to compute totalUsd for vault ${vaultId} (index ${vaultIndex})`,
            e
          );
        }
      }

      // Clamp negatives to 0
      totalUsd = Math.max(0, totalUsd);
      totalUsdLamports = Math.max(0, totalUsdLamports);

      results.push({
        vaultId,
        vaultName,
        vaultIndex,
        totalUsd,
        totalUsdLamports,
      });
    }

    // If fetching all vaults, filter featured vaults from results
    if (isFetchingAll) {
      const featuredVaults = results.filter((result) => {
        const vault = targetVaults.find(
          (v) => String(v._id ?? v.id ?? "") === result.vaultId
        );
        return vault?.isFeaturedVault === true;
      });

      return {
        data: results,
        featuredVaults,
      };
    }

    return { data: results };
  }

  /**
   * Determine the correct token program for a given mint
   */
  private async getTokenProgramId(mint: PublicKey): Promise<PublicKey> {
    try {
      const mintInfo = await this.connection.getAccountInfo(mint);
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
          (error as Error).message
        }, defaulting to TOKEN_PROGRAM_ID`
      );
      return TOKEN_PROGRAM_ID;
    }
  }

  private async getTokenDecimals(mintAddress: PublicKey): Promise<number> {
    const key = mintAddress.toBase58();

    try {
      // First, determine the correct token program for this mint
      const tokenProgramId = await this.getTokenProgramId(mintAddress);

      // Fetch mint info with the correct token program
      const mintInfo = await getMint(
        this.connection,
        mintAddress,
        undefined,
        tokenProgramId
      );
      const decimals = mintInfo.decimals;

      this.logger.log(
        `Fetched decimals from blockchain for ${key}: ${decimals} (token program: ${tokenProgramId.toBase58()})`
      );
      return decimals;
    } catch (error) {
      this.logger.warn(
        `Could not fetch decimals for ${key} from blockchain: ${
          error instanceof Error ? error.message : String(error)
        }, trying asset allocation database`
      );

      // Fallback to asset allocation database (mainnet)
      try {
        const assetAllocation =
          await this.assetAllocationService.findByMintAddressAndNetwork(
            key,
            NetworkType.MAINNET
          );
        const decimals = assetAllocation.decimals;
        this.logger.log(
          `Fetched decimals from asset allocation database for ${key}: ${decimals}`
        );
        return decimals;
      } catch (dbError) {
        this.logger.warn(
          `Could not fetch decimals for ${key} from asset allocation database: ${
            dbError instanceof Error ? dbError.message : String(dbError)
          }, defaulting to 6`
        );
        return 6;
      }
    }
  }

  /**
   * Helper function to delay execution
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchJupiterPrices(
    mintAddresses: PublicKey[]
  ): Promise<Record<string, number>> {
    if (mintAddresses.length === 0) return {};

    const ids = mintAddresses.map((m) => m.toBase58()).join(",");
    const url = `${this.JUP_PRICE_API}${ids}`;

    const maxRetries = 5;
    let retryCount = 0;
    const baseDelay = 500; // Start with 500ms delay

    // Add a small initial delay to help prevent rate limiting
    await this.delay(100);

    while (retryCount <= maxRetries) {
      try {
        const headers: any = {};
        if (this.JUPITER_API_KEY) {
          headers["x-api-key"] = this.JUPITER_API_KEY;
        }
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          // Rate limited - wait with exponential backoff
          // Calculate delay based on current retry count (before incrementing)
          const delayMs = baseDelay * Math.pow(2, retryCount);

          if (retryCount >= maxRetries) {
            this.logger.error("Max retries reached for Jupiter price fetch");
            return {};
          }

          await this.delay(delayMs);
          retryCount++;
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Failed to fetch prices: ${response.status} ${response.statusText}`
          );
        }

        const data = (await response.json()) as Record<
          string,
          { usdPrice: number }
        >;
        const priceMap: Record<string, number> = {};

        for (const [mint, info] of Object.entries(data)) {
          priceMap[mint] = info.usdPrice;
        }

        return priceMap;
      } catch (error) {
        if (retryCount < maxRetries) {
          const delayMs = baseDelay * Math.pow(2, retryCount);
          this.logger.warn(
            `Error fetching Jupiter prices (attempt ${retryCount + 1}/${
              maxRetries + 1
            }), retrying after ${delayMs}ms:`,
            error
          );
          await this.delay(delayMs);
          retryCount++;
        } else {
          this.logger.error(
            "Error fetching Jupiter prices after all retries:",
            error
          );
          return {};
        }
      }
    }

    return {};
  }

  async getVaultContractData(
    vaultIndex: number
  ): Promise<VaultContractData | null> {
    try {
      if (!this.program) {
        this.logger.warn("Solana program not initialized");
        return null;
      }

      const factory = this.pdaFactory();
      const vault = this.pdaVault(factory, vaultIndex);

      this.logger.log(
        `🔍 Fetching contract data for vault index: ${vaultIndex}`
      );
      this.logger.log(`📍 Factory address: ${factory.toBase58()}`);
      this.logger.log(`📍 Vault address: ${vault.toBase58()}`);

      const vaultAccount = (await (this.program.account as any).vault.fetch(
        vault
      )) as any;

      this.logger.log(
        `📊 Raw vault account data:`,
        JSON.stringify(vaultAccount, null, 2)
      );

      // Log underlying asset balances
      this.logger.log(`\n🏦 Underlying Assets:`);
      const pricedAssets: {
        mint: PublicKey;
        amountTokens: number;
        decimals: number;
      }[] = [];
      for (let i = 0; i < vaultAccount.underlyingAssets.length; i++) {
        const asset = vaultAccount.underlyingAssets[i];
        if (
          asset.mintAddress.toBase58() !== "11111111111111111111111111111111"
        ) {
          this.logger.log(`  Asset ${i}:`);
          this.logger.log(`    Mint: ${asset.mintAddress.toBase58()}`);
          this.logger.log(
            `    Allocation: ${asset.mintBps} bps (${(
              asset.mintBps / 100
            ).toFixed(2)}%)`
          );

          // Get token account balance
          let amountTokens = 0;
          let decimals = 6; // Default fallback
          try {
            // First, determine the correct token program for this mint
            const tokenProgramId = await this.getTokenProgramId(
              asset.mintAddress
            );
            this.logger.log(`    Token Program: ${tokenProgramId.toBase58()}`);

            const tokenAccount = await getAssociatedTokenAddress(
              asset.mintAddress,
              vault,
              true,
              tokenProgramId,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );
            this.logger.log(
              `    Token Account (ATA): ${tokenAccount.toBase58()}`
            );

            const balance = await getAccount(
              this.connection,
              tokenAccount,
              undefined,
              tokenProgramId
            );
            // Get actual token decimals from blockchain (matching Solscan)
            decimals = await this.getTokenDecimals(asset.mintAddress);
            amountTokens = Number(balance.amount) / Math.pow(10, decimals);
            this.logger.log(
              `    Balance: ${balance.amount.toString()} (${amountTokens.toFixed(
                decimals
              )} tokens, ${decimals} decimals)`
            );
            this.logger.log("balance", balance);
          } catch (e: any) {
            if (e.name === "TokenAccountNotFoundError") {
              this.logger.log(`    Balance: 0 (Token account not found)`);
              this.logger.log(`    Error: ${e.message}`);
            } else {
              this.logger.log(`    Balance: Account error - ${e.message}`);
            }
            amountTokens = 0;
            // Try to get decimals even if balance fetch failed
            try {
              decimals = await this.getTokenDecimals(asset.mintAddress);
            } catch {
              // Keep default 6 if decimals fetch also fails
            }
          }

          // Always add the asset to pricedAssets with its decimals, even if balance is 0
          pricedAssets.push({
            mint: asset.mintAddress,
            amountTokens,
            decimals,
          });
        }
      }
      let totalUsd = 0;
      let totalUsdInLamports = 0;
      // Fetch prices from Jupiter and compute total USD value (excluding stablecoin)
      try {
        const mintsForPricing = pricedAssets.map((a) => a.mint);
        const priceMap = await this.fetchJupiterPrices(mintsForPricing);

        this.logger.log(
          `\n💵 USD Valuations (Jupiter Prices - excluding stablecoin):`
        );
        for (const { mint, amountTokens, decimals } of pricedAssets) {
          const mintStr = mint.toBase58();
          const price = Number(priceMap[mintStr] || 0);
          const usdValue = amountTokens * price;
          totalUsd += usdValue;
          this.logger.log(
            `  ${mintStr}: ${amountTokens.toFixed(
              decimals
            )} tokens (${decimals} decimals) × $${price.toFixed(
              6
            )} = $${usdValue.toFixed(6)}`
          );
        }
        this.logger.log(
          `\n🧮 Total Portfolio Value (excluding stablecoin): $${totalUsd.toFixed(
            6
          )}`
        );
        totalUsdInLamports = Math.round(totalUsd * 1_000_000);
        this.logger.log(
          `💰 Total Portfolio Value in Lamports (6 decimals): ${totalUsdInLamports.toLocaleString()} lamports`
        );
      } catch (err) {
        this.logger.warn(
          `Failed to fetch Jupiter prices or compute USD values: ${String(
            (err as any)?.message || err
          )}`
        );
      }
      this.logger.log("totalUsdInLamports", totalUsdInLamports);

      const contractData = {
        vaultIndex,
        totalAssets: Number(totalUsdInLamports),
        totalSupply: Number(vaultAccount.totalSupply),
        managementFees: Number(vaultAccount.managementFees),
        accruedManagementFeesUsdc: Number(
          vaultAccount.accruedManagementFeesUsdc || 0
        ),
        lastFeeAccrualTs: Number(vaultAccount.lastFeeAccrualTs),
        underlyingAssets: vaultAccount.underlyingAssets.map((asset: any) => ({
          mintAddress: asset.mintAddress,
          mintBps: Number(asset.mintBps),
        })),
        admin: vaultAccount.admin,
        // Expose portfolio valuation in both USD and lamports for consumers
        portfolioUsd: Number(totalUsd),
        portfolioUsdLamports: Number(totalUsdInLamports),
      };
      this.logger.log(
        `📈 Processed contract data:`,
        JSON.stringify(contractData, null, 2)
      );
      return contractData;
    } catch (error) {
      this.logger.error(
        `Error fetching vault ${vaultIndex} contract data:`,
        error
      );
      return null;
    }
  }

  /**
   * Calculate share price using the formula: DTF_Share_Price = NAV / Total_Shares
   * Where NAV = Total Assets - Accrued Management Fees
   */
  async getVaultSharePrice(vaultId: string): Promise<SharePriceData | null> {
    try {
      this.logger.log(
        `🚀 Starting share price calculation for vault ID: ${vaultId}`
      );

      // Get vault from database
      const vault = await this.vaultFactoryService.findById(vaultId);
      if (!vault) {
        this.logger.warn(`Vault with ID ${vaultId} not found`);
        return null;
      }

      this.logger.log(
        `📋 Vault found: ${vault.vaultName} (Index: ${vault.vaultIndex})`
      );

      if (vault.vaultIndex === undefined) {
        this.logger.warn(`Vault ${vaultId} has no vault index`);
        return null;
      }

      // Get contract data
      const contractData = await this.getVaultContractData(vault.vaultIndex);
      if (!contractData) {
        this.logger.warn(
          `Could not fetch contract data for vault ${vaultId} (index: ${vault.vaultIndex})`
        );
        return null;
      }

      // Calculate NAV (Net Asset Value)
      const totalAssets = contractData.totalAssets;
      const accruedManagementFees = contractData.accruedManagementFeesUsdc;
      const nav = totalAssets - accruedManagementFees;

      // Calculate GAV (Gross Asset Value)
      const gav = totalAssets + accruedManagementFees;

      // Calculate share price: NAV / Total Tokens (DTF_Share_Price = NAV / Total_Shares)
      const totalSupply = contractData.totalSupply;
      const sharePrice = totalSupply > 0 ? nav / totalSupply : 0;

      this.logger.log(`🧮 Share Price Calculation:`);
      this.logger.log(
        `  💰 Total Assets: ${totalAssets} lamports ($${(
          totalAssets / 1_000_000
        ).toFixed(6)} USD)`
      );
      this.logger.log(
        `  💸 Accrued Fees: ${accruedManagementFees} lamports ($${(
          accruedManagementFees / 1_000_000
        ).toFixed(6)} USD)`
      );
      this.logger.log(
        `  📊 NAV: ${nav} lamports ($${(nav / 1_000_000).toFixed(6)} USD)`
      );
      this.logger.log(
        `  📈 GAV: ${gav} lamports ($${(gav / 1_000_000).toFixed(6)} USD)`
      );
      this.logger.log(
        `  🪙 Total Supply: ${totalSupply} lamports (${(
          totalSupply / 1e6
        ).toFixed(6)} tokens)`
      );
      this.logger.log(
        `  💎 Raw Share Price: ${sharePrice} (NAV / Total Supply)`
      );
      this.logger.log(
        `  💎 Final Share Price: ${sharePrice.toFixed(
          6
        )} (already in correct units)`
      );

      const result = {
        vaultId,
        vaultName: vault.vaultName,
        vaultIndex: vault.vaultIndex,
        sharePrice: sharePrice, // Already calculated as NAV / Total Supply in correct units
        nav: nav / 1_000_000, // Convert from lamports to USD
        totalSupply: totalSupply / 1e6, // Convert to token units (6 decimal places)
        gav: gav / 1_000_000, // Convert from lamports to USD
        totalAssets: totalAssets / 1_000_000, // Convert from lamports to USD
        accruedManagementFeesUsdc: accruedManagementFees / 1_000_000, // Convert from lamports to USD
        managementFees: contractData.managementFees, // Already in BPS
        timestamp: new Date(),
      };

      this.logger.log(
        `✅ Final share price result:`,
        JSON.stringify(result, null, 2)
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error getting share price for vault ${vaultId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Store share price data in the database for historical tracking
   */
  async storeSharePriceHistory(
    sharePriceData: SharePriceData
  ): Promise<SharePriceHistoryDocument> {
    try {
      const historyRecord = new this.sharePriceHistoryModel({
        vaultId: sharePriceData.vaultId,
        vaultName: sharePriceData.vaultName,
        vaultIndex: sharePriceData.vaultIndex,
        sharePrice: sharePriceData.sharePrice,
        nav: sharePriceData.nav,
        totalSupply: sharePriceData.totalSupply,
        gav: sharePriceData.gav,
        totalAssets: sharePriceData.totalAssets,
        accruedManagementFeesUsdc: sharePriceData.accruedManagementFeesUsdc,
        managementFees: sharePriceData.managementFees,
        timestamp: sharePriceData.timestamp,
        vaultIdTimestamp: `${
          sharePriceData.vaultId
        }_${sharePriceData.timestamp.getTime()}`,
      });

      const savedRecord = await historyRecord.save();
      this.logger.log(
        `💾 Stored share price history for vault ${sharePriceData.vaultId}: ${sharePriceData.sharePrice}`
      );
      return savedRecord;
    } catch (error) {
      this.logger.error(
        `Error storing share price history for vault ${sharePriceData.vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get historical share price data for a vault within a time range
   */
  async getVaultSharePriceHistory(
    vaultId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<SharePriceHistoryDocument[]> {
    try {
      const query: any = { vaultId };

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      const history = await this.sharePriceHistoryModel
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec();

      this.logger.log(
        `📊 Retrieved ${history.length} share price history records for vault ${vaultId}`
      );
      return history;
    } catch (error) {
      this.logger.error(
        `Error getting share price history for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get share price chart data for a vault (for frontend charts)
   */
  async getVaultSharePriceChart(
    vaultId: string,
    startDate?: Date,
    endDate?: Date,
    interval: "minute" | "hour" | "day" = "day"
  ): Promise<{
    vaultId: string;
    vaultName: string;
    data: any[];
    currentSharePrice?: any;
  }> {
    try {
      // Get vault info
      const vault = await this.vaultFactoryService.findById(vaultId);
      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Get historical data
      const history = await this.getVaultSharePriceHistory(
        vaultId,
        startDate,
        endDate
      );

      // Group data by time interval
      const groupedData = this.groupDataByInterval(history, interval);

      // Get current share price data
      let currentSharePrice = null;
      try {
        const currentData = await this.getVaultSharePrice(vaultId);
        if (currentData) {
          currentSharePrice = {
            timestamp: currentData.timestamp,
            sharePrice: currentData.sharePrice,
            nav: currentData.nav,
            totalSupply: currentData.totalSupply,
            gav: currentData.gav,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch current share price for vault ${vaultId}:`,
          error
        );
      }

      return {
        vaultId,
        vaultName: vault.vaultName,
        data: groupedData,
        currentSharePrice,
      };
    } catch (error) {
      this.logger.error(
        `Error getting share price chart for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get share price chart data for all time periods (1D, 1M, 3M, 6M, 1Y)
   */
  async getVaultSharePriceChartAll(vaultId: string): Promise<{
    vaultId: string;
    vaultName: string;
    currentSharePrice?: any;
    timeframes: {
      "1D": any[];
      "1M": any[];
      "3M": any[];
      "6M": any[];
      "1Y": any[];
    };
  }> {
    try {
      // Get vault info
      const vault = await this.vaultFactoryService.findById(vaultId);
      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Calculate date ranges for each timeframe
      const now = new Date();
      const timeframes = {
        "1D": new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
        "1M": new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        "3M": new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        "6M": new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000), // 180 days ago
        "1Y": new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), // 365 days ago
      };

      // Get current share price data
      let currentSharePrice = null;
      try {
        const currentData = await this.getVaultSharePrice(vaultId);
        if (currentData) {
          currentSharePrice = {
            timestamp: currentData.timestamp,
            sharePrice: currentData.sharePrice,
            nav: currentData.nav,
            totalSupply: currentData.totalSupply,
            gav: currentData.gav,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch current share price for vault ${vaultId}:`,
          error
        );
      }

      // Fetch data for each timeframe in parallel
      const timeframePromises = Object.entries(timeframes).map(
        async ([timeframe, startDate]) => {
          try {
            const history = await this.getVaultSharePriceHistory(
              vaultId,
              startDate,
              now
            );

            // Determine appropriate interval based on timeframe
            let interval: "minute" | "hour" | "day";
            if (timeframe === "1D") {
              interval = "minute";
            } else if (timeframe === "1M") {
              interval = "hour";
            } else {
              interval = "day";
            }

            // Group data by time interval
            const groupedData = this.groupDataByInterval(history, interval);

            return [timeframe, groupedData];
          } catch (error) {
            this.logger.error(
              `Error fetching ${timeframe} data for vault ${vaultId}:`,
              error
            );
            return [timeframe, []];
          }
        }
      );

      const timeframeResults = await Promise.all(timeframePromises);

      // Convert results to object
      const timeframeData = timeframeResults.reduce(
        (acc, [timeframe, data]) => {
          acc[timeframe as keyof typeof timeframes] = data;
          return acc;
        },
        {} as any
      );

      return {
        vaultId,
        vaultName: vault.vaultName,
        currentSharePrice,
        timeframes: timeframeData,
      };
    } catch (error) {
      this.logger.error(
        `Error getting share price chart all for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Group historical data by time interval for chart display
   */
  private groupDataByInterval(
    data: SharePriceHistoryDocument[],
    interval: "minute" | "hour" | "day"
  ): any[] {
    const intervalMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
    }[interval];

    const grouped = new Map<number, SharePriceHistoryDocument[]>();

    data.forEach((record) => {
      const timestamp = record.timestamp.getTime();
      const bucket = Math.floor(timestamp / intervalMs) * intervalMs;

      if (!grouped.has(bucket)) {
        grouped.set(bucket, []);
      }
      grouped.get(bucket)!.push(record);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, records]) => {
        // Use the latest record in each bucket
        const latestRecord = records.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        )[0];

        return {
          timestamp: new Date(timestamp),
          sharePrice: latestRecord.sharePrice,
          nav: latestRecord.nav,
          totalSupply: latestRecord.totalSupply,
          gav: latestRecord.gav,
        };
      });
  }

  /**
   * Calculate annualized APY (CAGR) for a vault from its NAV series
   * APY = ( (FinalNAV / InitialNAV)^(1/years) - 1 ) * 100
   */
  async calculateAnnualApy(vaultId: string): Promise<number | null> {
    try {
      const { series } = await this.getVaultNavSeries(
        vaultId,
        undefined,
        undefined,
        "day"
      );

      if (!series || series.length < 2) {
        this.logger.warn(
          `Insufficient NAV data for APY calculation for vault ${vaultId}`
        );
        return null;
      }

      const sorted = [...series].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const firstNav = sorted[0].nav;
      const lastNav = sorted[sorted.length - 1].nav;
      if (firstNav <= 0 || lastNav <= 0) {
        this.logger.warn(
          `Invalid NAV values for APY calculation for vault ${vaultId}`
        );
        return null;
      }

      const firstDate = new Date(sorted[0].timestamp);
      const lastDate = new Date(sorted[sorted.length - 1].timestamp);
      const years =
        (lastDate.getTime() - firstDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);
      if (years <= 0) {
        this.logger.warn(
          `Invalid time range for APY calculation for vault ${vaultId}`
        );
        return null;
      }

      const growthRate = Math.pow(lastNav / firstNav, 1 / years) - 1;
      const apy = growthRate * 100;
      return Math.round(apy * 100) / 100;
    } catch (err) {
      this.logger.error(
        `Error calculating annual APY for vault ${vaultId}:`,
        err
      );
      return null;
    }
  }

  async getVaultNavSeries(
    vaultId: string,
    startDate?: Date,
    endDate?: Date,
    interval: IntervalUnit = "day"
  ): Promise<{ vaultName: string; series: NavPoint[] }> {
    const vault = await this.vaultFactoryService.findById(vaultId);
    if (!vault) {
      throw new NotFoundException(`Vault with ID ${vaultId} not found`);
    }

    const underlying = vault.underlyingAssets || [];
    if (underlying.length === 0) {
      return { vaultName: vault.vaultName, series: [] };
    }
    const symbols = underlying
      .map((a) => (a.assetAllocation as any)?.symbol)
      .filter(Boolean);
    const symbolToWeight: Record<string, number> = {};
    for (const a of underlying) {
      const weight = (a.pct_bps || 0) / 10000; // convert bps to fraction
      const symbol = (a.assetAllocation as any)?.symbol;
      if (symbol) {
        symbolToWeight[symbol] = weight;
      }
    }
    const match: any = { symbol: { $in: symbols } };
    if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) match.timestamp.$gte = startDate;
      if (endDate) match.timestamp.$lte = endDate;
    }
    // Fetch raw points, then bucket in memory for cost efficiency
    const raw = await this.tokenPriceModel
      .find(match, { symbol: 1, price: 1, timestamp: 1 }, { lean: true })
      .sort({ timestamp: 1 })
      .exec();
    const floorToBucket = (d: Date): number => {
      const date = new Date(d);
      if (interval === "minute") {
        date.setSeconds(0, 0);
      } else if (interval === "hour") {
        date.setMinutes(0, 0, 0);
      } else if (interval === "day") {
        date.setHours(0, 0, 0, 0);
      } else if (interval === "week") {
        // Set to Monday 00:00:00
        const day = date.getUTCDay(); // 0 = Sun
        const diff = (day + 6) % 7; // days since Monday
        date.setUTCDate(date.getUTCDate() - diff);
        date.setUTCHours(0, 0, 0, 0);
      }
      return date.getTime();
    };

    // First average price per asset per bucket
    const assetBucketSum: Map<string, { sum: number; count: number }> =
      new Map();
    for (const p of raw as Array<any>) {
      const key = `${String(p.symbol)}|${floorToBucket(p.timestamp)}`;
      const prev = assetBucketSum.get(key) || { sum: 0, count: 0 };
      prev.sum += p.price;
      prev.count += 1;
      assetBucketSum.set(key, prev);
    }
    // Get all unique bucket timestamps
    const bucketTimestamps = new Set<number>();
    for (const [key] of assetBucketSum.entries()) {
      const [, bucketStr] = key.split("|");
      bucketTimestamps.add(Number(bucketStr));
    }

    // For each bucket, use the most recent available price for each asset
    const bucketToGav: Map<number, number> = new Map();
    for (const bucketTs of bucketTimestamps) {
      let bucketGav = 0;
      let hasAnyData = false;

      for (const symbol of symbols) {
        const weight = symbolToWeight[symbol] || 0;
        if (weight === 0) continue;

        // Find the most recent price for this symbol up to this bucket time
        let bestPrice = 0;
        let bestTimestamp = 0;

        for (const [key, val] of assetBucketSum.entries()) {
          const [keySymbol, bucketStr] = key.split("|");
          const keyBucketTs = Number(bucketStr);

          if (keySymbol === symbol && keyBucketTs <= bucketTs) {
            if (keyBucketTs > bestTimestamp) {
              bestTimestamp = keyBucketTs;
              bestPrice = val.sum / val.count;
            }
          }
        }

        if (bestPrice > 0) {
          bucketGav += bestPrice * weight;
          hasAnyData = true;
        }
      }

      if (hasAnyData) {
        bucketToGav.set(bucketTs, bucketGav);
      }
    }
    const feePercent = vault.feeConfig?.managementFeeBps
      ? vault.feeConfig.managementFeeBps / 100
      : 0;

    const series: NavPoint[] = Array.from(bucketToGav.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, gav]) => {
        const nav = Math.round((gav - (gav * feePercent) / 100) * 100) / 100;

        // Calculate share price: NAV / Total Tokens (DTF_Share_Price = NAV / Total_Shares)
        // For historical data, we'll use a simplified calculation
        // In a real implementation, you'd want to store total supply over time
        const totalSupply = vault.totalSupply
          ? Number(vault.totalSupply) / 1e9
          : 0;
        const sharePrice = totalSupply > 0 && nav > 0 ? nav / totalSupply : 0;

        return {
          timestamp: new Date(ts),
          gav: Math.round(gav * 100) / 100,
          nav,
          sharePrice: Math.round(sharePrice * 1000000) / 1000000, // Round to 6 decimal places
          totalSupply,
        };
      });

    return { vaultName: vault.vaultName, series };
  }

  private calculateDateRange(interval: ChartInterval): {
    startDate: Date;
    endDate: Date;
    bucketInterval: IntervalUnit;
  } {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999); // End of today

    let startDate: Date;
    let bucketInterval: IntervalUnit;

    switch (interval) {
      case "1D":
        // Today 12:00 AM to 11:59 PM
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "hour";
        break;
      case "1W":
        // Today to previous 6 days (7 days total)
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "day";
        break;
      case "1M":
        // Today to previous days until it happens one month
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "day";
        break;
      case "3M":
        // Today to previous days until it happens three months
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "day";
        break;
      case "6M":
        // Today to previous days until it happens six months
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 6);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "week";
        break;
      case "1Y":
        // Today to previous days until it happens 1 year
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        bucketInterval = "week";
        break;
      case "ALL":
        // Will be calculated based on vault creation dates
        startDate = new Date(0); // Placeholder, will be updated
        bucketInterval = "week";
        break;
    }
    return { startDate, endDate, bucketInterval };
  }

  // convert the vaultIds string to an array of vaultIds
  private parseAndValidateVaultIds(vaultIds: string): string[] {
    if (!vaultIds || vaultIds.trim() === "") {
      throw new BadRequestException("vaultIds parameter is required");
    }

    const vaultIdArray = vaultIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (vaultIdArray.length === 0) {
      throw new BadRequestException("No valid vault IDs provided");
    }

    const maxVaultIds = 50;
    if (vaultIdArray.length > maxVaultIds) {
      throw new BadRequestException(
        `Too many vault IDs provided. Maximum allowed is ${maxVaultIds}, received ${vaultIdArray.length}`
      );
    }

    const unique = new Set(vaultIdArray);
    if (unique.size !== vaultIdArray.length) {
      const duplicates = vaultIdArray.filter(
        (id, index) => vaultIdArray.indexOf(id) !== index
      );
      throw new BadRequestException(
        `Duplicate vault IDs found: ${duplicates.join(", ")}`
      );
    }

    return vaultIdArray;
  }

  // validate the interval
  private validateInterval(interval: ChartInterval): ChartInterval {
    const valid: ChartInterval[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"];
    if (!valid.includes(interval)) {
      throw new BadRequestException(
        `Invalid interval. Must be one of: ${valid.join(", ")}`
      );
    }
    return interval;
  }

  async getVaultsNavSeries(
    vaultIds: string,
    interval: ChartInterval
  ): Promise<{ vaultId: string; vaultName: string; series: NavPoint[] }[]> {
    // Validate inputs
    const vaultIdArray = this.parseAndValidateVaultIds(vaultIds);
    const validatedInterval = this.validateInterval(interval);

    const results: {
      vaultId: string;
      vaultName: string;
      series: NavPoint[];
    }[] = [];

    // Calculate date range and bucket interval
    const {
      startDate: baseStartDate,
      endDate,
      bucketInterval,
    } = this.calculateDateRange(validatedInterval);

    // Debug logs removed in production

    let startDate = baseStartDate;

    // First, validate that all vaults exist
    const nonExistentVaults: string[] = [];
    const existingVaults: { id: string; name: string; vault: any }[] = [];

    for (const vaultId of vaultIdArray) {
      try {
        const vault = await this.vaultFactoryService.findById(vaultId);
        if (!vault) {
          nonExistentVaults.push(vaultId);
        } else {
          existingVaults.push({ id: vaultId, name: vault.vaultName, vault });
        }
      } catch (error) {
        this.logger.error(`Error checking vault ${vaultId}:`, error);
        nonExistentVaults.push(vaultId);
      }
    }

    // If any vaults don't exist, throw an error with details
    if (nonExistentVaults.length > 0) {
      throw new NotFoundException(
        `The following vault IDs do not exist: ${nonExistentVaults.join(", ")}`
      );
    }

    // If interval is ALL, compute earliest start date from already-fetched vaults
    if (interval === "ALL") {
      let earliestDate: Date | undefined;
      for (const { vault } of existingVaults) {
        if (vault && vault.blockTime) {
          const vaultCreatedAt = new Date(vault.blockTime);
          vaultCreatedAt.setHours(0, 0, 0, 0);
          if (!earliestDate || vaultCreatedAt < earliestDate) {
            earliestDate = vaultCreatedAt;
          }
        }
      }
      if (earliestDate) {
        startDate = earliestDate;
      }
    }

    // Process existing vaults and compute series inline (do not call single-vault method)
    for (const { id: vaultId, name: vaultName, vault } of existingVaults) {
      try {
        const underlying = vault.underlyingAssets || [];
        if (underlying.length === 0) {
          results.push({ vaultId, vaultName, series: [] });
          continue;
        }

        const symbols = underlying
          .map((a) => (a.assetAllocation as any)?.symbol)
          .filter(Boolean);
        const symbolToWeight: Record<string, number> = {};
        for (const a of underlying) {
          const weight = (a.pct_bps || 0) / 10000; // convert bps to fraction
          const symbol = (a.assetAllocation as any)?.symbol;
          if (symbol) {
            symbolToWeight[symbol] = weight;
          }
        }

        const match: any = { symbol: { $in: symbols } };
        match.timestamp = { $gte: startDate, $lte: endDate };

        const raw = await this.tokenPriceModel
          .find(match, { symbol: 1, price: 1, timestamp: 1 }, { lean: true })
          .sort({ timestamp: 1 })
          .exec();

        const floorToBucket = (d: Date): number => {
          const date = new Date(d);
          if (bucketInterval === "minute") {
            date.setSeconds(0, 0);
          } else if (bucketInterval === "hour") {
            date.setMinutes(0, 0, 0);
          } else if (bucketInterval === "day") {
            date.setHours(0, 0, 0, 0);
          } else if (bucketInterval === "week") {
            const day = date.getUTCDay();
            const diff = (day + 6) % 7; // days since Monday
            date.setUTCDate(date.getUTCDate() - diff);
            date.setUTCHours(0, 0, 0, 0);
          }
          return date.getTime();
        };

        const assetBucketSum: Map<string, { sum: number; count: number }> =
          new Map();
        for (const p of raw as Array<any>) {
          const key = `${String(p.symbol)}|${floorToBucket(p.timestamp)}`;
          const prev = assetBucketSum.get(key) || { sum: 0, count: 0 };
          prev.sum += p.price;
          prev.count += 1;
          assetBucketSum.set(key, prev);
        }

        const bucketTimestamps = new Set<number>();
        for (const [key] of assetBucketSum.entries()) {
          const [, bucketStr] = key.split("|");
          bucketTimestamps.add(Number(bucketStr));
        }

        const bucketToGav: Map<number, number> = new Map();
        for (const bucketTs of bucketTimestamps) {
          let bucketGav = 0;
          let hasAnyData = false;

          for (const symbol of symbols) {
            const weight = symbolToWeight[symbol] || 0;
            if (weight === 0) continue;

            let bestPrice = 0;
            let bestTimestamp = 0;

            for (const [key, val] of assetBucketSum.entries()) {
              const [keySymbol, bucketStr] = key.split("|");
              const keyBucketTs = Number(bucketStr);

              if (keySymbol === symbol && keyBucketTs <= bucketTs) {
                if (keyBucketTs > bestTimestamp) {
                  bestTimestamp = keyBucketTs;
                  bestPrice = val.sum / val.count;
                }
              }
            }

            if (bestPrice > 0) {
              bucketGav += bestPrice * weight;
              hasAnyData = true;
            }
          }

          if (hasAnyData) {
            bucketToGav.set(bucketTs, bucketGav);
          }
        }

        const feePercent = vault.feeConfig?.managementFeeBps
          ? vault.feeConfig.managementFeeBps / 100
          : 0;

        const series: NavPoint[] = Array.from(bucketToGav.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([ts, gav]) => {
            const nav =
              Math.round((gav - (gav * feePercent) / 100) * 100) / 100;

            // Calculate share price: NAV / Total Tokens (DTF_Share_Price = NAV / Total_Shares)
            const totalSupply = vault.totalSupply
              ? Number(vault.totalSupply) / 1e9
              : 0;
            const sharePrice =
              totalSupply > 0 && nav > 0 ? nav / totalSupply : 0;

            return {
              timestamp: new Date(ts),
              gav: Math.round(gav * 100) / 100,
              nav,
              sharePrice: Math.round(sharePrice * 1000000) / 1000000, // Round to 6 decimal places
              totalSupply,
            };
          });

        results.push({ vaultId, vaultName, series });
      } catch (error) {
        this.logger.error(`Error processing vault ${vaultId}:`, error);
        results.push({
          vaultId,
          vaultName: `${vaultName} (Processing Error)`,
          series: [],
        });
      }
    }

    return results;
  }

  async getAllPriceData() {
    const data = await this.tokenPriceModel.find().exec();
    return data;
  }

  /**
   * Get token balance for a specific token in a vault
   * @param vaultIndex - The vault index
   * @param mintAddress - The token mint address
   * @returns Token balance data including raw balance, formatted balance, and decimals
   */
  async getTokenBalance(
    vaultIndex: number,
    mintAddress: string
  ): Promise<{
    balance: number;
    balanceFormatted: number;
    decimals: number;
  }> {
    try {
      this.logger.log(
        `Getting token balance for vault ${vaultIndex}, mint ${mintAddress}`
      );

      // Initialize Solana connection if not already done
      if (!this.connection) {
        await this.initializeSolanaConnection();
      }

      // Get vault PDA
      const factory = this.pdaFactory();
      const vault = this.pdaVault(factory, vaultIndex);

      const mintPublicKey = new PublicKey(mintAddress);

      // Get actual token decimals from blockchain (matching Solscan)
      const decimals = await this.getTokenDecimals(mintPublicKey);

      // Determine the correct token program for this mint
      const tokenProgramId = await this.getTokenProgramId(mintPublicKey);
      this.logger.log(
        `Getting token balance for vault ${vaultIndex}, mint ${mintAddress}, using token program ${tokenProgramId.toBase58()}, decimals: ${decimals}`
      );

      // Get associated token account for the vault
      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        vault,
        true,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        // Get token account balance
        const accountInfo = await getAccount(
          this.connection,
          tokenAccount,
          undefined,
          tokenProgramId
        );
        const balance = Number(accountInfo.amount);
        const balanceFormatted = balance / Math.pow(10, decimals);

        this.logger.log(
          `Token balance for ${mintAddress}: ${balance} raw units (${balanceFormatted.toFixed(
            decimals
          )} tokens, ${decimals} decimals)`
        );

        return {
          balance,
          balanceFormatted,
          decimals,
        };
      } catch (error) {
        // Token account doesn't exist or has zero balance
        this.logger.log(`Token account not found or empty for ${mintAddress}`);
        return {
          balance: 0,
          balanceFormatted: 0,
          decimals,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error getting token balance for ${mintAddress}:`,
        error
      );
      throw error;
    }
  }
}
