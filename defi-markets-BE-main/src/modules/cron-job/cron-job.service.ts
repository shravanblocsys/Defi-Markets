import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "../config/config.service";
import { firstValueFrom } from "rxjs";
import { TokenPrice } from "./entities/token-price.entity";
import { AssetAllocationService } from "../asset-allocation/asset-allocation.service";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { VaultDepositService } from "../vault-deposit/vault-deposit.service";
import { VaultFeesCalculationService } from "../vault-management-fees/vault-fees-calculation.service";
import { Inject, forwardRef } from "@nestjs/common";

@Injectable()
export class CronJobService implements OnModuleInit {
  private readonly logger = new Logger(CronJobService.name);
  private isExecuting = false;
  private lastExecutionTime: Date | null = null;

  constructor(
    @InjectModel(TokenPrice.name) private tokenPriceModel: Model<TokenPrice>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly assetAllocationService: AssetAllocationService,
    private readonly vaultFactoryService: VaultFactoryService,
    @Inject(forwardRef(() => VaultDepositService))
    private readonly vaultDepositService: VaultDepositService,
    private readonly vaultFeesCalculationService: VaultFeesCalculationService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  /**
   * Resolve default Solana network from env (fallback: devnet)
   */
  private getDefaultNetwork(): string {
    return this.configService.get("SOLANA_NETWORK") || "devnet";
  }

  /**
   * Always use the active network from env for price fetching/storage
   */
  private getActiveNetwork(): string {
    const net = this.getDefaultNetwork();
    // Map env 'mainnet-beta' to provider/api 'mainnet'
    if (net === "mainnet-beta") return "mainnet";
    return net;
  }

  /**
   * Get cooldown period from environment variable or fallback to default
   */
  private getCooldownPeriod(): number {
    const configuredCooldown = parseInt(
      this.configService.get("COOLDOWN_PERIOD") || "900000",
      10
    ); // 15 minutes cooldown time by default (900000ms)

    return isNaN(configuredCooldown) ? 900000 : configuredCooldown;
  }
  /**
   * Cron job to fetch and store token prices
   * Schedule is controlled by `CRON_JOB_INTERVAL` (default: "0 *\/15 * * * *" — every 15 minutes)
   * This ensures we have historical price data for charts
   */
  async fetchAndStoreTokenPrices(): Promise<void> {
    // Check if already executing
    if (this.isExecuting) {
      this.logger.warn("Price fetch already in progress, skipping execution");
      return;
    }

    // Check cooldown period
    if (this.lastExecutionTime && this.isInCooldown()) {
      const remainingCooldown = this.getRemainingCooldown();
      this.logger.warn(
        `Still in cooldown period. Remaining: ${Math.ceil(
          remainingCooldown / 1000
        )} seconds`
      );
      return;
    }

    this.logger.log("Starting scheduled token price fetch...");
    this.isExecuting = true;
    this.lastExecutionTime = new Date();

    try {
      // Get all unique tokens from asset allocations
      const tokens = await this.getAllUniqueTokens();
      if (tokens.length === 0) {
        this.logger.warn("No tokens found to fetch prices for");
        return;
      }

      // Group tokens by network to ensure homogeneous batches per Jupiter API contract
      const activeNetwork = this.getActiveNetwork();
      const networkToTokens = tokens.reduce(
        (
          acc: Record<
            string,
            Array<{
              mintAddress: string;
              symbol: string;
              name: string;
              network: string;
            }>
          >,
          token
        ) => {
          const networkKey = activeNetwork;
          if (!acc[networkKey]) acc[networkKey] = [];
          acc[networkKey].push({ ...token, network: networkKey });
          return acc;
        },
        {} as Record<
          string,
          Array<{
            mintAddress: string;
            symbol: string;
            name: string;
            network: string;
          }>
        >
      );

      // Fetch prices in batches to avoid API rate limits, per network
      const batchSize = 50;
      for (const [network, networkTokens] of Object.entries(networkToTokens)) {
        // this.logger.log(
        //   `Processing ${networkTokens.length} tokens for network: ${network}`
        // );
        const batches = this.chunkArray(networkTokens, batchSize);

      for (const batch of batches) {
          try {
            await this.fetchBatchPrices(batch);
            // Add delay between batches to respect rate limits
            await this.delay(2000);
          } catch (error) {
            // Check if it's a rate limit error
            if (this.isRateLimitError(error)) {
              this.logger.warn(
                "Rate limit detected, stopping execution and entering cooldown"
              );
              break; // Stop processing more batches
            }
            throw error; // Re-throw if it's not a rate limit error
          }
        }
      }

      // this.logger.log("Successfully completed token price fetch");
    } catch (error) {
      this.logger.log("Error in scheduled token price fetch:", error);
    } finally {
      this.isExecuting = false;
      this.logger.log(
        "Price fetch execution completed, entering 15-minute cooldown"
      );
    }
  }

  /**
   * Get all unique tokens from asset allocations and vaults
   * Excludes assets with priceAvailable: false
   */
  private async getAllUniqueTokens(): Promise<
    Array<{
      mintAddress: string;
      symbol: string;
      name: string;
      network: string;
    }>
  > {
    try {
      // Get all asset allocations
      const assetAllocations =
        await this.assetAllocationService.findAllAssetAllocations();

      // Get unique tokens from asset allocations (include all; remove flagging)
      // Deduplicate by network+mintAddress to prevent cross-network collisions
      const uniqueTokens = new Map<
        string,
        { mintAddress: string; symbol: string; name: string; network: string }
      >();

      const activeNetwork = this.getActiveNetwork();
      assetAllocations.forEach((asset: any) => {
        if (asset.mintAddress && asset.symbol && asset.name) {
          const network = activeNetwork; // force env network
          const dedupeKey = `${network}:${asset.mintAddress}`;
          uniqueTokens.set(dedupeKey, {
            mintAddress: asset.mintAddress,
            symbol: asset.symbol,
            name: asset.name,
            network,
          });
        }
      });

      const tokens = Array.from(uniqueTokens.values());
      // this.logger.log(
      //   `Found ${tokens.length} tokens for price fetch (no filtering)`
      // );
      return tokens;
    } catch (error) {
      this.logger.log("Error getting unique tokens:", error);
      return [];
    }
  }

  /**
   * Fetch prices for a batch of tokens
   */
  private async fetchBatchPrices(
    tokens: Array<{
      mintAddress: string;
      symbol: string;
      name: string;
      network: string;
    }>
  ): Promise<void> {
    try {
      const network = this.getActiveNetwork();
      const mintAddresses = tokens.map((token) => token.mintAddress);
      const baseUrl = this.configService.get("JUPITER_API_BASE_URL");

      // Use Jupiter v3 API
      const url = `${baseUrl}/price/v3?ids=${mintAddresses.join(
        ","
      )}&network=${network}`;
      // Use fetch instead of HttpService for v3 API
      const response = await fetch(url);

      // Check if response is ok
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limit exceeded");
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get response text first to check if it's JSON
      const responseText = await response.text();

      // Check if response starts with "Rate limit" (plain text error)
      if (responseText.startsWith("Rate limit")) {
        this.logger.warn("Rate limit detected from Jupiter API");
        throw new Error("Rate limit exceeded");
      }

      // Try to parse as JSON
      let priceData;
      try {
        priceData = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.log(`Failed to parse JSON response: ${responseText}`);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      // Console log the raw price data
      // this.logger.log(`Raw price data:`, JSON.stringify(priceData, null, 2));

      if (priceData && Object.keys(priceData).length > 0) {
        const timestamp = new Date();

        // Store each token's price data
        for (const token of tokens) {
          const tokenData = priceData[token.mintAddress];
          if (tokenData) {
            const price = parseFloat(tokenData.usdPrice) || 0;
            const change24h = parseFloat(tokenData.priceChange24h) || 0;

            // Store price data
            await this.storeTokenPrice({
              mintAddress: token.mintAddress,
              symbol: token.symbol,
              name: token.name,
              price,
              change24h,
              timestamp,
              source: "jupiter",
              active: true,
              network: this.getActiveNetwork(),
            });

            // this.logger.log(
            //   `Stored price for ${token.symbol}: $${price} (${change24h}% 24h change)`
            // );
          } else {
            // this.logger.log(
            //   `No price data found for token: ${token.symbol} (${token.mintAddress})`
            // );
          }
        }
      } else {
        this.logger.log(`No price data received`);
      }
    } catch (error) {
      this.logger.log(`Error fetching prices:`, error);
      throw error; // Re-throw to be caught by the calling method
    }
  }

  /**
   * Store token price data in database
   */
  private async storeTokenPrice(priceData: {
    mintAddress: string;
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    timestamp: Date;
    source: string;
    active: boolean;
    network: string;
  }): Promise<void> {
    try {
      const tokenPrice = new this.tokenPriceModel(priceData);
      await tokenPrice.save();
    } catch (error) {
      this.logger.log(`Error storing price for ${priceData.symbol}:`, error);
    }
  }

  /**
   * Get historical price data for charts
   */
  async getTokenPriceHistory(
    mintAddress: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ timestamp: Date; price: number; change24h: number }>> {
    try {
      const query: any = { mintAddress, active: true, network: this.getActiveNetwork() };

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      const prices = await this.tokenPriceModel
        .find(query)
        .sort({ timestamp: 1 })
        .select("timestamp price change24h")
        .exec();

      // this.logger.log("prices", prices);
      return prices.map((price) => ({
        timestamp: price.timestamp,
        price: price.price,
        change24h: price.change24h,
      }));
    } catch (error) {
      this.logger.log(
        `Error getting price history for ${mintAddress}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get vault TVL history for charts
   */
  async getVaultTvlHistory(
    vaultId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ timestamp: Date; tvl: number; price: number }>> {
    try {
      // Get vault details
      const vault = await this.vaultFactoryService.findById(vaultId);
      if (!vault) {
        this.logger.warn(`Vault not found: ${vaultId}`);
        return [];
      }

      // Get TVL data points (this would need to be implemented based on your TVL calculation logic)
      // For now, return empty array as this requires more complex implementation
      // this.logger.log(`Getting TVL history for vault: ${vault.vaultSymbol}`);

      // TODO: Implement TVL history calculation
      // This would involve:
      // 1. Getting historical deposit/withdrawal data
      // 2. Calculating TVL at each time point
      // 3. Combining with historical token prices

      return [];
    } catch (error) {
      this.logger.log(
        `Error getting TVL history for vault ${vaultId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Utility function to chunk array into smaller batches
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for price fetch (for testing)
   */
  async triggerPriceFetch(): Promise<{ message: string; tokensCount: number }> {
    this.logger.log("Manual price fetch triggered");
    await this.fetchAndStoreTokenPrices();

    const tokens = await this.getAllUniqueTokens();
    return {
      message: "Price fetch completed",
      tokensCount: tokens.length,
    };
  }

  /**
   * Check if the service is currently in cooldown period
   */
  private isInCooldown(): boolean {
    if (!this.lastExecutionTime) return false;
    const timeSinceLastExecution =
      Date.now() - this.lastExecutionTime.getTime();
    return timeSinceLastExecution < this.getCooldownPeriod();
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  private getRemainingCooldown(): number {
    if (!this.lastExecutionTime) return 0;
    const timeSinceLastExecution =
      Date.now() - this.lastExecutionTime.getTime();
    const remaining = this.getCooldownPeriod() - timeSinceLastExecution;
    return Math.max(0, remaining);
  }

  /**
   * Check if an error is related to rate limiting
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || "";
    const errorStatus =
      error.status || error.statusCode || error.response?.status;

    // Check for common rate limit indicators
    const rateLimitIndicators = [
      "rate limit",
      "rate limit exceeded",
      "too many requests",
      "429",
      "quota exceeded",
      "throttled",
      "limit exceeded",
    ];

    return rateLimitIndicators.some(
      (indicator) =>
        errorMessage.includes(indicator) ||
        errorStatus === 429 ||
        errorStatus === "429"
    );
  }

  /**
   * Get current execution status and cooldown info
   */
  getExecutionStatus(): {
    isExecuting: boolean;
    lastExecutionTime: Date | null;
    isInCooldown: boolean;
    remainingCooldown: number;
  } {
    return {
      isExecuting: this.isExecuting,
      lastExecutionTime: this.lastExecutionTime,
      isInCooldown: this.isInCooldown(),
      remainingCooldown: this.getRemainingCooldown(),
    };
  }

  /**
   * Flag an asset as price unavailable
   */
  private async flagAssetPriceUnavailable(
    mintAddress: string,
    reason: string
  ): Promise<void> {
    try {
      await this.assetAllocationService.flagAssetPriceUnavailable(
        mintAddress,
        reason
      );
      this.logger.warn(
        `Flagged asset ${mintAddress} as price unavailable: ${reason}`
      );
    } catch (error) {
      this.logger.log(
        `Error flagging asset ${mintAddress} as price unavailable:`,
        error
      );
    }
  }

  /**
   * Reset price availability for an asset (for manual re-enabling)
   */
  async resetAssetPriceAvailability(mintAddress: string): Promise<void> {
    try {
      await this.assetAllocationService.resetAssetPriceAvailability(
        mintAddress
      );
      this.logger.log(`Reset price availability for asset ${mintAddress}`);
    } catch (error) {
      this.logger.log(
        `Error resetting price availability for asset ${mintAddress}:`,
        error
      );
    }
  }

  /**
   * Cron job to calculate and store vault management fees
   * Runs daily at midnight (00:00)
   */
  async calculateVaultManagementFees(): Promise<void> {
    this.logger.log("🚀 Starting vault management fees calculation...");
    
    try {
      await this.vaultFeesCalculationService.calculateAllVaultFees();
      this.logger.log("✅ Successfully completed vault management fees calculation");
    } catch (error) {
      this.logger.error("❌ Error in vault management fees calculation:", error);
      throw error;
    }
  }

  /**
   * Manual trigger for vault fees calculation (for testing)
   */
  async triggerVaultFeesCalculation(): Promise<{ message: string }> {
    this.logger.log("Manual vault fees calculation triggered");
    await this.calculateVaultManagementFees();
    return {
      message: "Vault fees calculation completed",
    };
  }
}
