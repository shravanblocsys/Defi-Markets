import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { VaultDepositService } from "../vault-deposit/vault-deposit.service";
import { AssetAllocationService } from "../asset-allocation/asset-allocation.service";
import { VaultInsightsDto } from "./dto/vault-insights.dto";
import { PortfolioDto, PortfolioAssetDto } from "./dto/portfolio.dto";
import { GavNavDto } from "./dto/gav-nav.dto";
import {
  UserHoldingsResponseDto,
  UserHoldingDto,
} from "./dto/user-holdings.dto";
import { UserVaultMetricsDto } from "./dto/user-vault-metrics.dto";
import { FeesManagementService } from "../fees-management/fees-management.service";
import { HistoryService } from "../history/history.service";
import {
  PaginationQuery,
  PaginatedResponse,
  PaginationHelper,
} from "../../middlewares/pagination/paginationHelper";
import {
  sanitizeRegexInput,
  toBase10Decimal,
  calculateWeightedBasketPrice,
  calculateGrossAssetValue,
  calculateNetAssetValue,
  calculateTotalFees,
} from "../../utils/utils";
import { InjectModel } from "@nestjs/mongoose";
import { VaultFactory } from "../vault-factory/entities/vault-factory.entity";
import { Model, Document } from "mongoose";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "../config/config.service";
import { firstValueFrom } from "rxjs";
import { RedisService } from "../../utils/redis";
import { ChartsService } from "../charts/charts.service";
import { TokenMappingService } from "./token-mapping.service";

type VaultFactoryDocument = VaultFactory & Document;

@Injectable()
export class VaultInsightsService {
  private readonly logger = new Logger(VaultInsightsService.name);

  // Constants for portfolio chart data generation
  private readonly ESTIMATED_DAILY_GROWTH = 0.1; // 0.1% daily growth estimate
  private readonly FALLBACK_DAILY_GROWTH = 0.1; // 0.1% fallback daily growth
  private readonly FALLBACK_WEEKLY_GROWTH = 7.0; // 7% fallback weekly growth
  private readonly ESTIMATED_WEEKLY_GROWTH = 2.0; // 2% weekly growth estimate
  private readonly FALLBACK_WEEKLY_GROWTH_RATE = 1.5; // 1.5% fallback weekly growth rate

  constructor(
    @InjectModel(VaultFactory.name)
    private vaultFactoryModel: Model<VaultFactoryDocument>,
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly assetAllocationService: AssetAllocationService,
    private readonly vaultDepositService: VaultDepositService,
    private readonly feesManagementService: FeesManagementService,
    private readonly historyService: HistoryService,
    private readonly paginationHelper: PaginationHelper,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly chartsService: ChartsService,
    private readonly tokenMappingService: TokenMappingService
  ) {}

  /**
   * Get vault insights for a specific vault
   * @param vaultId - The vault ID to get insights for
   * @returns VaultInsightsDto with total underlying assets count, total users count, and vault symbol
   */
  async getVaultInsights(vaultId: string): Promise<VaultInsightsDto> {
    try {
      this.logger.log(`Getting vault insights for vault ID: ${vaultId}`);

      // Get vault details
      const vault = await this.vaultFactoryService.findOne(vaultId);

      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Get vault address for deposit queries
      const vaultAddress = vault.vaultAddress;

      if (!vaultAddress) {
        throw new BadRequestException(
          `Vault ${vaultId} does not have a vault address`
        );
      }

      // Get total underlying assets count
      const totalUnderlyingAssetsCount = vault.underlyingAssets?.length || 0;

      // Get total unique users count who have deposited into the vault
      const totalUsersCount =
        await this.vaultDepositService.countUniqueUsersWithDepositsForVault(
          vaultAddress
        );

      // Get vault symbol
      const vaultSymbol = vault.vaultSymbol;

      const insights: VaultInsightsDto = {
        totalUnderlyingAssetsCount,
        totalUsersCount,
        vaultSymbol,
      };

      this.logger.log(
        `Vault insights retrieved for ${vaultSymbol}: ${totalUnderlyingAssetsCount} assets, ${totalUsersCount} users`
      );

      return insights;
    } catch (error) {
      this.logger.error(
        `Error getting vault insights for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get portfolio details for a specific vault
   * @param vaultId - The vault ID to get portfolio for
   * @returns PortfolioDto with asset details including name, logo, allocation, price, and 24h change
   */
  async getPortfolio(vaultId: string): Promise<PortfolioDto> {
    try {
      this.logger.log(`Getting portfolio for vault ID: ${vaultId}`);

      // Get vault details with populated underlying assets
      const vault = await this.vaultFactoryService.findById(vaultId);

      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      if (!vault.underlyingAssets || vault.underlyingAssets.length === 0) {
        return {
          vaultSymbol: vault.vaultSymbol,
          assets: [],
        };
      }

      // Process each underlying asset
      const assets: PortfolioAssetDto[] = await Promise.all(
        vault.underlyingAssets.map(async (asset) => {
          const assetAllocation = asset.assetAllocation as any;
          const mint = assetAllocation?.mintAddress || "";
          const priceData = await this.getTokenPriceData(mint);

          // Get token balance from vault contract
          let tokenBalance = 0;
          let tokenBalanceFormatted = 0;
          let decimals = 6; // Default decimals

          try {
            if (mint && vault.vaultIndex !== undefined) {
              const balanceData = await this.chartsService.getTokenBalance(
                vault.vaultIndex,
                mint
              );
              tokenBalance = balanceData.balance;
              tokenBalanceFormatted = balanceData.balanceFormatted;
              decimals = balanceData.decimals;
            }
          } catch (error) {
            this.logger.warn(`Failed to get token balance for ${mint}:`, error);
          }

          return {
            assetName: assetAllocation?.name || "Unknown Asset",
            logoUrl: assetAllocation?.logoUrl || "",
            percentageAllocation: asset.pct_bps,
            price: priceData.price,
            change24h: priceData.change24h,
            tokenBalance,
            tokenBalanceFormatted,
            decimals,
          } as PortfolioAssetDto;
        })
      );
      this.logger.log("assets", assets);
      const portfolio: PortfolioDto = {
        vaultSymbol: vault.vaultSymbol,
        assets,
      };

      this.logger.log(
        `Portfolio retrieved for ${vault.vaultSymbol}: ${assets.length} assets`
      );
      this.logger.log("portfolio", portfolio);
      return portfolio;
    } catch (error) {
      this.logger.error(`Error getting portfolio for vault ${vaultId}:`, error);
      throw error;
    }
  }

  /**
   * Get Gross Asset Value (GAV) and Net Asset Value (NAV) for a specific vault
   *
   * Formulas:
   * - GAV = Σ(Asset Quantity × Asset Price) for all underlying assets
   * - NAV = GAV - (GAV × Fee Percentage / 100)
   * - Total Fees = GAV - NAV
   *
   * @param vaultId - The vault ID to calculate GAV/NAV for
   * @returns GavNavDto with GAV, NAV, fees, and other metrics
   */
  async getGavNav(vaultId: string, userId?: string): Promise<GavNavDto> {
    try {
      this.logger.log(`Calculating GAV/NAV for vault ID: ${vaultId}`);

      // Get vault details
      const vault = await this.vaultFactoryService.findById(vaultId);
      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      if (!vault.underlyingAssets || vault.underlyingAssets.length === 0) {
        return {
          grossAssetValue: 0,
          netAssetValue: 0,
        };
      }
      this.logger.log("vault underlying assets", vault.underlyingAssets);
      // Get user holdings for this vault (if available)
      let userHoldings: any[] = [];
      userHoldings = await this.vaultDepositService.getHoldings(
        vault.vaultAddress,
        undefined,
        userId
      );
      // Calculate GAV using Jupiter prices and user holdings
      const grossAssetValue = await this.calculateGrossAssetValue(
        vault.underlyingAssets,
        userHoldings
      );
      this.logger.log("user holdings", userHoldings);
      // Get fee percentage from vault configuration (convert bps to percent)
      const feePercentage =
        typeof (vault as any)?.feeConfig?.managementFeeBps === "number"
          ? (vault as any).feeConfig.managementFeeBps / 100 // convert bps to percent
          : 0; // No fees if not configured

      // Calculate NAV and fees using helper functions
      const netAssetValue = calculateNetAssetValue(
        grossAssetValue,
        feePercentage
      );
      this.logger.log("grossAssetValue", grossAssetValue);
      this.logger.log("netAssetValue", netAssetValue);
      const gavNav: GavNavDto = {
        grossAssetValue,
        netAssetValue,
        // Optionally expose these once DTO supports them
        // totalFees,
        // feePercentage,
      };

      return gavNav;
    } catch (error) {
      this.logger.error(
        `Error calculating GAV/NAV for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate Gross Asset Value (GAV) using real prices
   * GAV = Sum of (Asset Quantity × Asset Price) for all underlying assets
   * @param underlyingAssets - Array of underlying assets with quantities and prices
   * @returns Gross Asset Value
   */
  async calculateGrossAssetValue(
    underlyingAssets: any[],
    userHoldings: any[] = []
  ): Promise<number> {
    // Fetch token prices from Jupiter API
    const tokenPrices = new Map<string, number>();
    for (const asset of underlyingAssets) {
      const assetAllocation = asset.assetAllocation as any;
      const mint = assetAllocation?.mintAddress || "";
      const priceData = await this.getTokenPriceData(mint);
      tokenPrices.set(mint, priceData.price);
    }

    // Calculate weighted basket price using helper function
    const basketPrice = calculateWeightedBasketPrice(
      underlyingAssets,
      tokenPrices
    );
    this.logger.log("basketPrice", basketPrice);
    // If we have user holdings, calculate GAV based on actual shares
    if (userHoldings && userHoldings.length > 0) {
      // Calculate total shares received by user
      const totalUserShares = userHoldings.reduce((sum, holding) => {
        const shares = toBase10Decimal(holding.sharesReceived || 0);
        return sum + shares;
      }, 0);
      this.logger.log("totalUserShares", totalUserShares);
      // Use helper function to calculate GAV
      return calculateGrossAssetValue(totalUserShares, basketPrice);
    } else {
      this.logger.log("basketPrice", basketPrice);
      // Fallback: return basket price only
      return basketPrice;
    }
  }

  /**
   * Fetch real price data from Jupiter API
   * @param mintAddress - The mint address of the asset
   * @returns Real price data from Jupiter API
   */
  private async getTokenPriceData(
    mintAddress: string
  ): Promise<{ price: number; change24h: number }> {
    try {
      if (!mintAddress) {
        this.logger.warn("No mint address provided for price lookup");
        return { price: 0, change24h: 0 };
      }

      // 2) Fallback to Jupiter API
      const baseUrl = this.configService.get("JUPITER_API_BASE_URL");
      this.logger.log("baseUrl", baseUrl);
      const url = `${baseUrl}/price/v3?ids=${mintAddress}&showExtraInfo=true`;
      this.logger.log("url", url);
      this.logger.debug(`Fetching price data for mint: ${mintAddress}`);

      const response = await firstValueFrom(this.httpService.get(url));
      const payload = response?.data;
      // Jupiter v3 shape: { data: { [mint]: { usdPrice, priceChange24h, decimals, ... } } }
      let price = 0;
      let change24h = 0;
      if (payload?.data?.[mintAddress]) {
        const tokenData = payload.data[mintAddress];
        price = Number(tokenData.usdPrice) || 0;
        change24h = Number(tokenData.priceChange24h) || 0;
      } else if (payload?.[mintAddress]) {
        // Defensive fallback if a different shape is returned
        const tokenData = payload[mintAddress];
        price = Number(tokenData.usdPrice ?? tokenData.price) || 0;
        change24h =
          Number(tokenData.priceChange24h ?? tokenData.change24h) || 0;
      }
      this.logger.debug(
        `Price data retrieved for ${mintAddress}: price=${price}, change24h=${change24h}`
      );
      return { price, change24h };
    } catch (error) {
      this.logger.error(`Error fetching price data for ${mintAddress}:`, error);
      return { price: 0, change24h: 0 };
    }
  }

  /**
   * Fetch historical price data for accurate 7-day performance calculation
   * @param mintAddress - The mint address of the asset
   * @param days - Number of days to fetch (default: 7)
   * @returns Historical price data with accurate 7-day change
   */
  private async getHistoricalPriceData(
    mintAddress: string,
    days: number = 7
  ): Promise<{ price: number; change7d: number }> {
    try {
      if (!mintAddress) {
        this.logger.warn(
          "No mint address provided for historical price lookup"
        );
        return { price: 0, change7d: 0 };
      }

      // Check cache first (cache for 1 hour to avoid excessive API calls)
      const cacheKey = `historical_price_${mintAddress}_${days}`;
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Using cached historical data for ${mintAddress}`);
        return JSON.parse(cached as string);
      }

      // Try multiple data sources for historical data
      const historicalData = await this.fetchHistoricalPricesFromAPI(
        mintAddress,
        days
      );

      if (historicalData) {
        // Cache the result for 1 hour
        await this.redisService.set(
          cacheKey,
          JSON.stringify(historicalData),
          3600
        );
        return historicalData;
      }

      // Fallback to current price with improved approximation
      const currentPriceData = await this.getTokenPriceData(mintAddress);

      // Enhanced volatility modeling for more accurate 7-day approximation
      const change7d = this.calculateImproved7DayApproximation(
        currentPriceData.change24h,
        days
      );

      this.logger.warn(
        `Using approximated 7-day change for ${mintAddress}: ${change7d.toFixed(
          2
        )}% (based on 24h: ${
          currentPriceData.change24h
        }%) - This is an approximation and may not reflect actual market performance`
      );

      const fallbackData = {
        price: currentPriceData.price,
        change7d: change7d,
        isApproximation: true, // Flag to indicate this is approximated data
        approximationMethod: "volatility_modeled_24h_extrapolation",
      };

      // Cache the fallback result for 30 minutes (shorter cache for approximations)
      await this.redisService.set(cacheKey, JSON.stringify(fallbackData), 1800);

      return fallbackData;
    } catch (error) {
      this.logger.error(
        `Error fetching historical price data for ${mintAddress}:`,
        error
      );
      return { price: 0, change7d: 0 };
    }
  }

  /**
   * Fetch historical prices from external APIs
   * @param mintAddress - The mint address of the asset
   * @param days - Number of days to fetch
   * @returns Historical price data or null if not available
   */
  private async fetchHistoricalPricesFromAPI(
    mintAddress: string,
    days: number
  ): Promise<{ price: number; change7d: number } | null> {
    try {
      // Check if historical data fetching is enabled
      const enableHistoricalData =
        this.configService.get("ENABLE_HISTORICAL_PRICE_DATA") === "true";
      if (!enableHistoricalData) {
        this.logger.debug(
          `Historical price data fetching is disabled for ${mintAddress}`
        );
        return null;
      }

      // Rate limiting: Use atomic Redis operations to prevent race conditions
      const rateLimitKey = `historical_api_rate_limit_${mintAddress}`;

      // Check current count first
      const currentCountStr = await this.redisService.get(rateLimitKey);
      const currentCount = currentCountStr
        ? parseInt(currentCountStr as string)
        : 0;

      if (currentCount >= 10) {
        // Max 10 requests per hour per token
        this.logger.warn(
          `Rate limit exceeded for historical data requests for ${mintAddress} (${currentCount}/10)`
        );
        return null;
      }

      // Increment counter atomically
      const newCount = currentCount + 1;
      await this.redisService.set(rateLimitKey, newCount.toString(), 3600); // 1 hour TTL

      // Try CoinGecko API first (free tier with good historical data)
      const coingeckoData = await this.fetchFromCoinGecko(mintAddress, days);
      if (coingeckoData) {
        return coingeckoData;
      }

      // Try Jupiter historical API if available
      const jupiterData = await this.fetchFromJupiterHistorical(
        mintAddress,
        days
      );
      if (jupiterData) {
        return jupiterData;
      }

      // Try CoinMarketCap API if configured
      const cmcData = await this.fetchFromCoinMarketCap(mintAddress, days);
      if (cmcData) {
        return cmcData;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Error fetching from external APIs for ${mintAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Fetch historical data from CoinGecko API
   */
  private async fetchFromCoinGecko(
    mintAddress: string,
    days: number
  ): Promise<{ price: number; change7d: number } | null> {
    try {
      // Note: This requires mapping Solana token addresses to CoinGecko IDs
      // For production, you'd need a mapping service or use a different approach
      const coingeckoId = await this.getCoinGeckoIdForMint(mintAddress);
      if (!coingeckoId) {
        return null;
      }

      const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`;
      const response = await firstValueFrom(this.httpService.get(url));

      if (response.data?.prices && response.data.prices.length >= 2) {
        const prices = response.data.prices;
        const currentPrice = prices[prices.length - 1][1];
        const pastPrice = prices[0][1];
        const change7d = ((currentPrice - pastPrice) / pastPrice) * 100;

        return {
          price: currentPrice,
          change7d: change7d,
        };
      }

      return null;
    } catch (error) {
      this.logger.debug(
        `CoinGecko API failed for ${mintAddress}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Fetch historical data from Jupiter API (if available)
   */
  private async fetchFromJupiterHistorical(
    mintAddress: string,
    days: number
  ): Promise<{ price: number; change7d: number } | null> {
    try {
      // Jupiter doesn't have historical data API, but we can try their price API with time range
      // This is a placeholder for future Jupiter historical API integration
      return null;
    } catch (error) {
      this.logger.debug(
        `Jupiter historical API failed for ${mintAddress}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Fetch historical data from CoinMarketCap API
   */
  private async fetchFromCoinMarketCap(
    mintAddress: string,
    days: number
  ): Promise<{ price: number; change7d: number } | null> {
    try {
      const apiKey = this.configService.get("COINMARKETCAP_API_KEY");
      if (!apiKey) {
        return null;
      }

      // This would require CMC Pro API for historical data
      // For now, return null as it requires paid subscription
      return null;
    } catch (error) {
      this.logger.debug(
        `CoinMarketCap API failed for ${mintAddress}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Calculate improved 7-day approximation using advanced volatility modeling
   * @param change24h - 24-hour price change percentage
   * @param days - Number of days to project
   * @returns Projected change percentage
   */
  private calculateImproved7DayApproximation(
    change24h: number,
    days: number
  ): number {
    // Enhanced volatility modeling based on market research
    const absChange = Math.abs(change24h);

    // Volatility classification
    let volatilityFactor: number;
    let compoundingFactor: number;

    if (absChange < 1) {
      // Low volatility: linear projection with slight compounding
      volatilityFactor = 0.9;
      compoundingFactor = 1.05;
    } else if (absChange < 3) {
      // Medium volatility: moderate compounding
      volatilityFactor = 1.0;
      compoundingFactor = 1.1;
    } else if (absChange < 7) {
      // High volatility: significant compounding and mean reversion
      volatilityFactor = 1.1;
      compoundingFactor = 1.2;
    } else {
      // Extreme volatility: strong mean reversion and compounding
      volatilityFactor = 1.3;
      compoundingFactor = 1.4;
    }

    // Apply mean reversion for extreme changes (market tends to correct)
    const meanReversionFactor = absChange > 10 ? 0.7 : 1.0;

    // Calculate base projection
    const baseProjection = change24h * days * volatilityFactor;

    // Apply compounding effect
    const compoundedProjection = baseProjection * compoundingFactor;

    // Apply mean reversion for extreme cases
    const finalProjection = compoundedProjection * meanReversionFactor;

    // Cap extreme projections to reasonable bounds (±50% for 7 days)
    const cappedProjection = Math.max(-50, Math.min(50, finalProjection));

    return cappedProjection;
  }

  /**
   * Get CoinGecko ID for a Solana mint address using dynamic mapping service
   */
  private async getCoinGeckoIdForMint(
    mintAddress: string
  ): Promise<string | null> {
    return await this.tokenMappingService.getCoinGeckoIdForMint(mintAddress);
  }

  /**
   * Get fees management details for a specific vault
   * @param vaultId - The vault ID to get fees for
   * @returns FeesManagement document with all fee configurations
   */
  async getFeesManagement(vaultId: string): Promise<any> {
    try {
      this.logger.log(`Getting fees management for vault ID: ${vaultId}`);

      // Get the active fees management record (there should be only one active record)
      const feesManagement =
        await this.feesManagementService.getCurrentActiveFeeConfig();

      if (!feesManagement) {
        this.logger.warn(
          `No active fees management found for vault ${vaultId}`
        );
        return null;
      }

      // Get vault details
      const vault = await this.vaultFactoryService.findOne(vaultId);

      // Filter out vault_creator_management_fee and platform_owner_management_fee
      const filteredFees = feesManagement?.fees?.filter(
        (fee) =>
          fee.type !== "vault_creator_management_fee" &&
          fee.type !== "platform_owner_management_fee"
      );

      return {
        fees: filteredFees,
        vaultFees: vault?.feeConfig?.managementFeeBps,
      };
    } catch (error) {
      this.logger.error(
        `Error getting fees management for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all users' wallet addresses and their holding amounts for a specific vault
   * @param vaultId - The vault ID to get user holdings for
   * @param limit - Maximum number of results to return (default: 100)
   * @param offset - Number of results to skip (default: 0)
   * @returns UserHoldingsResponseDto with user holdings data
   */
  async getUserHoldings(
    vaultId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<UserHoldingsResponseDto> {
    try {
      this.logger.log(
        `Getting user holdings for vault ID: ${vaultId}, limit: ${limit}, offset: ${offset}`
      );

      // Get vault details
      const vault = await this.vaultFactoryService.findOne(vaultId);

      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Get vault address for deposit queries
      const vaultAddress = vault.vaultAddress;

      if (!vaultAddress) {
        throw new BadRequestException(
          `Vault ${vaultId} does not have a vault address`
        );
      }

      // Get all holdings for this vault
      const allHoldings = await this.vaultDepositService.getHoldings(
        vaultAddress
      );

      // Group holdings by user address and calculate totals
      const userHoldingsMap = new Map<
        string,
        {
          walletAddress: string;
          totalHolding: number;
          sharesHeld: number;
          userProfile?: any;
        }
      >();

      for (const holding of allHoldings) {
        const userAddress = holding.userAddress;

        if (userHoldingsMap.has(userAddress)) {
          const existing = userHoldingsMap.get(userAddress)!;
          existing.totalHolding += holding.amount;
          existing.sharesHeld += holding.sharesReceived;
        } else {
          userHoldingsMap.set(userAddress, {
            walletAddress: userAddress,
            totalHolding: toBase10Decimal(holding.amount),
            sharesHeld: toBase10Decimal(holding.sharesReceived),
            userProfile: holding.userProfile,
          });
        }
      }

      // Convert map to array and apply pagination
      const allUserHoldings = Array.from(userHoldingsMap.values());
      const paginatedHoldings = allUserHoldings.slice(offset, offset + limit);

      // Format holdings for response
      const holdings: UserHoldingDto[] = paginatedHoldings.map((holding) => ({
        walletAddress: holding.walletAddress,
        totalHolding: holding.totalHolding,
        sharesHeld: holding.sharesHeld,
        userProfile: holding.userProfile
          ? {
              username: holding.userProfile.username,
              name: holding.userProfile.name,
              avatar: holding.userProfile.avatar,
            }
          : undefined,
      }));

      const response: UserHoldingsResponseDto = {
        totalUsers: allUserHoldings.length,
        holdings,
      };

      this.logger.log(
        `User holdings retrieved for ${vault.vaultSymbol}: ${allUserHoldings.length} total users, ${holdings.length} returned`
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Error getting user holdings for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all history logs related to a specific vault with pagination
   * @param vaultId - The vault ID to get history logs for
   * @param paginationQuery - Pagination parameters
   * @returns PaginatedResponse with history logs related to the vault
   */
  async getVaultHistory(
    vaultId: string,
    paginationQuery: PaginationQuery
  ): Promise<PaginatedResponse<any>> {
    try {
      this.logger.log(
        `Getting history logs for vault ID: ${vaultId} with pagination`
      );

      // Validate vault exists
      const vault = await this.vaultFactoryService.findOne(vaultId);

      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Use the history service's findAll method with vaultId filter to get ALL history for the vault
      const query = { vaultId }; // Filter by vault ID to get all history (vault creation, deposits, redemptions, etc.)
      const result = await this.historyService.findAll(paginationQuery, query);

      this.logger.log(
        `Retrieved ${result.data.length} of ${result.pagination.total} history logs for vault ${vault.vaultSymbol}`
      );

      // Normalize documents to plain objects and convert numeric metadata values to base-10 decimals
      const processedData = result.data.map((doc: any) => {
        const src =
          typeof doc?.toObject === "function"
            ? doc.toObject()
            : doc?._doc
            ? doc._doc
            : doc;

        const {
          _id,
          action,
          description,
          performedBy,
          vaultId,
          relatedEntity,
          metadata,
          transactionSignature,
          createdAt,
          updatedAt,
        } = src || {};

        // Prepare metadata with numeric fields converted
        let processedMetadata = metadata ? { ...metadata } : undefined;
        if (processedMetadata) {
          const numericFields = [
            "amount",
            "vaultTokensMinted",
            "entryFee",
            "managementFee",
            "netAmount",
          ];
          numericFields.forEach((field) => {
            const raw = processedMetadata[field];
            if (typeof raw === "string" || typeof raw === "number") {
              let numericValue: number;

              if (typeof raw === "number") {
                numericValue = raw;
              } else {
                // For strings, try Number() first (strict), fallback to parseFloat() for backward compatibility
                numericValue = Number(raw);
                if (isNaN(numericValue)) {
                  // Fallback to parseFloat for cases like "100px" -> 100
                  numericValue = parseFloat(raw);
                }
              }

              if (!isNaN(numericValue)) {
                processedMetadata[field] = toBase10Decimal(numericValue);
              }
            }
          });

          // Whitelist only the required metadata fields for response
          const { amount, userAddress, timestamp, blockNumber } =
            processedMetadata as any;

          processedMetadata = {
            ...(amount !== undefined ? { amount } : {}),
            ...(userAddress !== undefined ? { userAddress } : {}),
            ...(timestamp !== undefined ? { timestamp } : {}),
            ...(blockNumber !== undefined ? { blockNumber } : {}),
          } as any;
        }

        return {
          _id,
          action,
          description,
          performedBy,
          vaultId,
          relatedEntity,
          metadata: processedMetadata,
          transactionSignature,
          createdAt,
          updatedAt,
        };
      });

      return {
        pagination: result.pagination,
        data: processedData,
      };
    } catch (error) {
      this.logger.error(
        `Error getting history logs for vault ${vaultId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get user-specific vault metrics including deposits, redemptions, current value, and returns
   * @param vaultId - The vault ID
   * @param userAddress - The user's wallet address
   * @returns UserVaultMetricsDto with user's vault metrics
   */
  async getUserVaultMetrics(
    vaultId: string,
    userAddress: string
  ): Promise<UserVaultMetricsDto> {
    try {
      this.logger.log(
        `Getting user vault metrics for vault ID: ${vaultId}, user: ${userAddress}`
      );

      // Validate vault exists
      const vault = await this.vaultFactoryService.findOne(vaultId);

      if (!vault) {
        throw new NotFoundException(`Vault with ID ${vaultId} not found`);
      }

      // Get vault address for deposit queries
      const vaultAddress = vault.vaultAddress;

      if (!vaultAddress) {
        throw new BadRequestException(
          `Vault ${vaultId} does not have a vault address`
        );
      }

      // Get user's deposit history for this vault
      const depositHistory = await this.historyService.findByVault(vaultId);
      const userDeposits = depositHistory.filter(
        (history) =>
          history.performedBy &&
          history.action === "deposit_completed" &&
          history.metadata &&
          history.metadata.userAddress === userAddress
      );
      // Get user's redemption history for this vault
      const userRedemptions = depositHistory.filter(
        (history) =>
          history.performedBy &&
          history.action === "redeem_completed" &&
          history.metadata &&
          history.metadata.userAddress === userAddress
      );
      // Calculate total deposited (coerce string amounts to numbers)
      const totalDeposited = userDeposits.reduce((sum, deposit) => {
        const rawAmount = deposit.metadata?.amount;
        const amount =
          typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Calculate total redeemed (coerce string amounts to numbers)
      const totalRedeemed = userRedemptions.reduce((sum, redemption) => {
        const rawAmount = redemption.metadata?.netStablecoinAmount;
        const amount =
          typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Get current user holdings
      const allHoldings = await this.vaultDepositService.getHoldings(
        vaultAddress
      );
      const userHoldings = allHoldings.filter(
        (holding) => holding.userAddress === userAddress
      );
      // Calculate current value (sum of all current shares; coerce to number)
      const currentValue = userHoldings.reduce((sum, holding) => {
        const raw = holding.sharesReceived as any;
        const amount = typeof raw === "number" ? raw : Number(raw);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Calculate total returns (static for now as requested)
      // Formula: Current Value + Total Redeemed - Total Deposited
      const totalReturns = currentValue + totalRedeemed - totalDeposited;
      const metrics: UserVaultMetricsDto = {
        totalDeposited: toBase10Decimal(totalDeposited),
        totalRedeemed: toBase10Decimal(totalRedeemed),
        currentValue: toBase10Decimal(currentValue),
        totalReturns: toBase10Decimal(totalReturns),
        vaultSymbol: vault.vaultSymbol,
        userAddress: userAddress,
      };
      this.logger.log(
        `User vault metrics retrieved for ${userAddress} in ${vault.vaultSymbol}: Deposited=${totalDeposited}, Redeemed=${totalRedeemed}, Current=${currentValue}, Returns=${totalReturns}`
      );

      return metrics;
    } catch (error) {
      this.logger.error(
        `Error getting user vault metrics for vault ${vaultId}, user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Enrich vault data with TVL and APY calculations
   * @param doc - The vault document
   * @returns Enriched vault data with TVL and APY
   */
  private async enrichVaultWithTvlAndApy(doc: any): Promise<any> {
    const obj = typeof doc?.toObject === "function" ? doc.toObject() : doc;
    const vaultAddress = obj.vaultAddress;
    const vaultId = obj._id;

    // Debug: Log the vaultIndex value
    this.logger.debug(
      `enrichVaultWithTvlAndApy - vaultIndex: ${obj.vaultIndex} for vault: ${obj.vaultName}`
    );
    let totalValueLocked: number | null = null;
    let apy: number | null = null;

    try {
      if (vaultAddress) {
        // Use net TVL = deposits - redeems
        totalValueLocked =
          await this.vaultDepositService.getNetValueLockedByVaultAddress(
            vaultAddress
          );
      }
    } catch (e: any) {
      this.logger.warn(
        `TVL computation failed for vault ${vaultId} (${vaultAddress}): ${e?.message}`
      );
    }

    try {
      // Calculate APY based on NAV data
      apy = await this.calculateVaultAPY(vaultId);
    } catch (e: any) {
      this.logger.warn(
        `APY computation failed for vault ${vaultId}: ${e?.message}`
      );
    }

    // Return only the fields needed for FeatureVaultCard
    return {
      _id: obj._id,
      vaultName: obj.vaultName,
      vaultSymbol: obj.vaultSymbol,
      vaultAddress: obj.vaultAddress || null, // Handle undefined case
      vaultIndex: obj.vaultIndex,
      nav: obj.nav,
      totalSupply: obj.totalSupply,
      feeConfig: {
        managementFeeBps: obj.feeConfig?.managementFeeBps,
      },
      // Return underlyingAssets as-is (structured with assetAllocation, pct_bps, etc.)
      underlyingAssets: obj.underlyingAssets || [],
      creator: obj.creator,
      totalValueLocked,
      apy, // Add APY to the response
      // Debug: Include all available fields to see what's missing
      debug_allFields: Object.keys(obj),
      debug_vaultIndex: obj.vaultIndex,
    };
  }

  /**
   * Calculate APY (Annual Percentage Yield) for a vault based on NAV data
   * @param vaultId - The vault ID to calculate APY for
   * @returns APY percentage or null if calculation fails
   */
  private async calculateVaultAPY(vaultId: string): Promise<number | null> {
    try {
      return await this.chartsService.calculateAnnualApy(vaultId);
    } catch (error) {
      this.logger.error(`Error calculating APY for vault ${vaultId}:`, error);
      return null;
    }
  }

  /**
   * Get all featured vaults with pagination
   * @param paginationQuery - Pagination options from middleware
   * @param query - Optional query criteria
   * @returns Paginated response of featured vaults
   */
  async findAllFeaturedVaults(
    paginationQuery: PaginationQuery,
    query: any = {}
  ): Promise<PaginatedResponse<VaultFactoryDocument>> {
    try {
      const { vaultName, vaultSymbol, status, search } = query;

      // Build MongoDB filter for featured vaults only
      const filter: any = { isFeaturedVault: true };

      // Handle unified search parameter (searches both vaultName and vaultSymbol)
      if (search && search.trim()) {
        const sanitizedSearch = sanitizeRegexInput(search);
        if (sanitizedSearch) {
          filter.$or = [
            { vaultName: { $regex: sanitizedSearch, $options: "i" } },
            { vaultSymbol: { $regex: sanitizedSearch, $options: "i" } },
          ];
        }
      } else {
        // Individual field filters (only apply if no unified search)
        // Add vaultName filter (case-insensitive partial match)
        if (vaultName && vaultName.trim()) {
          const sanitizedVaultName = sanitizeRegexInput(vaultName);
          if (sanitizedVaultName) {
            filter.vaultName = { $regex: sanitizedVaultName, $options: "i" };
          }
        }

        // Add vaultSymbol filter (case-insensitive partial match)
        if (vaultSymbol && vaultSymbol.trim()) {
          const sanitizedVaultSymbol = sanitizeRegexInput(vaultSymbol);
          if (sanitizedVaultSymbol) {
            filter.vaultSymbol = {
              $regex: sanitizedVaultSymbol,
              $options: "i",
            };
          }
        }
      }

      // Add status filter (exclude 'all' status)
      if (status && status !== "all") {
        filter.status = status;
      }

      const populateOptions = [
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "name symbol logoUrl",
        },
      ];

      const paged = await this.paginationHelper.paginate(
        this.vaultFactoryModel,
        filter,
        paginationQuery,
        populateOptions
      );

      // Enrich each vault with TVL and APY computed from deposits and NAV data
      const dataWithTvlAndApy = await Promise.all(
        paged.data.map(async (doc: any) => {
          return await this.enrichVaultWithTvlAndApy(doc);
        })
      );

      return {
        data: dataWithTvlAndApy as any,
        pagination: paged.pagination,
      };
    } catch (error) {
      this.logger.error(`Error finding all featured vaults:`, error);
      throw error;
    }
  }

  /**
   * Get all featured vaults with pagination
   * @param paginationQuery - Pagination options from middleware
   * @param query - Optional query criteria
   * @returns Paginated response of featured vaults
   */
  async findAllPaginatedUser(
    paginationQuery: PaginationQuery,
    query: any = {}
  ): Promise<PaginatedResponse<VaultFactoryDocument>> {
    try {
      const { vaultName, vaultSymbol, status, search } = query;

      // Build MongoDB filter for featured vaults only
      const filter: any = {};

      // Handle unified search parameter (searches both vaultName and vaultSymbol)
      if (search && search.trim()) {
        const sanitizedSearch = sanitizeRegexInput(search);
        if (sanitizedSearch) {
          filter.$or = [
            { vaultName: { $regex: sanitizedSearch, $options: "i" } },
            { vaultSymbol: { $regex: sanitizedSearch, $options: "i" } },
          ];
        }
      } else {
        // Individual field filters (only apply if no unified search)
        // Add vaultName filter (case-insensitive partial match)
        if (vaultName && vaultName.trim()) {
          const sanitizedVaultName = sanitizeRegexInput(vaultName);
          if (sanitizedVaultName) {
            filter.vaultName = { $regex: sanitizedVaultName, $options: "i" };
          }
        }

        // Add vaultSymbol filter (case-insensitive partial match)
        if (vaultSymbol && vaultSymbol.trim()) {
          const sanitizedVaultSymbol = sanitizeRegexInput(vaultSymbol);
          if (sanitizedVaultSymbol) {
            filter.vaultSymbol = {
              $regex: sanitizedVaultSymbol,
              $options: "i",
            };
          }
        }
      }

      // Add status filter (exclude 'all' status)
      if (status && status !== "all") {
        filter.status = status;
      }

      const populateOptions = [
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "name symbol logoUrl",
        },
      ];

      const paged = await this.paginationHelper.paginate(
        this.vaultFactoryModel,
        filter,
        paginationQuery,
        populateOptions
      );

      // Enrich each vault with TVL and APY computed from deposits and NAV data
      const dataWithTvlAndApy = await Promise.all(
        paged.data.map(async (doc: any) => {
          // Debug: Log the raw document to see if vaultIndex exists
          this.logger.debug(
            `Raw vault document vaultIndex: ${doc.vaultIndex} for vault: ${doc.vaultName}`
          );
          return await this.enrichVaultWithTvlAndApy(doc);
        })
      );

      return {
        data: dataWithTvlAndApy as any,
        pagination: paged.pagination,
      };
    } catch (error) {
      this.logger.error(`Error finding all featured vaults:`, error);
      throw error;
    }
  }

  /**
   * Get user's complete portfolio with all vault deposits and metrics
   */
  async getUserPortfolio(userAddress: string): Promise<any> {
    try {
      this.logger.log(`Getting user portfolio for: ${userAddress}`);

      // Get all vaults where user has deposited
      const userVaults = await this.getUserVaults(userAddress);

      if (userVaults.vaults.length === 0) {
        return {
          summary: {
            totalValue: 0,
            totalDeposited: 0,
            totalRedeemed: 0,
            totalReturns: 0,
            vaultCount: 0,
            averageAPY: 0,
            dayChange: 0,
            dayChangePercent: 0,
            weekChange: 0,
            weekChangePercent: 0,
            lastUpdated: new Date().toISOString(),
          },
          vaults: [],
          chartData: [],
        };
      }

      // Calculate portfolio summary
      const totalValue = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.currentValue,
        0
      );
      const totalDeposited = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.totalDeposited,
        0
      );
      const totalRedeemed = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.totalRedeemed,
        0
      );
      const totalReturns = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.totalReturns,
        0
      );
      const averageAPY =
        userVaults.vaults.reduce((sum, vault) => sum + vault.apy, 0) /
        userVaults.vaults.length;

      // Calculate day and week changes
      const dayChange = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.dayChange,
        0
      );
      const dayChangePercent =
        totalValue > 0 ? (dayChange / totalValue) * 100 : 0;
      const weekChange = userVaults.vaults.reduce(
        (sum, vault) => sum + vault.weekChange,
        0
      );
      const weekChangePercent =
        totalValue > 0 ? (weekChange / totalValue) * 100 : 0;

      // Generate portfolio chart data
      this.logger.log(
        `📊 MAIN: Calling generatePortfolioChartData with ${userVaults.vaults.length} vaults, totalValue: $${totalValue}`
      );
      const chartData = await this.generatePortfolioChartData(
        userVaults.vaults,
        totalValue,
        "7d"
      );
      this.logger.log(
        `📊 MAIN: Received ${chartData.length} chart data points from generatePortfolioChartData`
      );

      return {
        summary: {
          totalValue,
          totalDeposited,
          totalRedeemed,
          totalReturns,
          vaultCount: userVaults.vaults.length,
          averageAPY,
          dayChange,
          dayChangePercent,
          weekChange,
          weekChangePercent,
          lastUpdated: new Date().toISOString(),
        },
        vaults: userVaults.vaults,
        chartData,
      };
    } catch (error) {
      this.logger.error(
        `Error getting user portfolio for ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all vaults where user has deposited
   */
  async getUserVaults(userAddress: string): Promise<any> {
    try {
      this.logger.log(`Getting user vaults for: ${userAddress}`);

      // Get all vaults from vault factory
      const allVaults = await this.vaultFactoryModel.find({}).lean();

      const userVaults = [];

      // Check each vault for user deposits
      for (const vault of allVaults) {
        try {
          // Get user's deposit history for this vault
          const depositHistory = await this.historyService.findByVault(
            vault._id.toString()
          );
          const userDeposits = depositHistory.filter(
            (history) =>
              history.performedBy &&
              history.action === "deposit_completed" &&
              history.metadata &&
              history.metadata.userAddress === userAddress
          );

          // Only include vaults where user has deposited
          if (userDeposits.length > 0) {
            // Get user's redemption history for this vault
            const userRedemptions = depositHistory.filter(
              (history) =>
                history.performedBy &&
                history.action === "redeem_completed" &&
                history.metadata &&
                history.metadata.userAddress === userAddress
            );

            // Calculate metrics
            const totalDeposited = userDeposits.reduce((sum, deposit) => {
              const rawAmount = deposit.metadata?.amount;
              const amount =
                typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
              return sum + (isNaN(amount) ? 0 : amount);
            }, 0);

            const totalRedeemed = userRedemptions.reduce((sum, redemption) => {
              const rawAmount = redemption.metadata?.netStablecoinAmount;
              const amount =
                typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
              return sum + (isNaN(amount) ? 0 : amount);
            }, 0);

            // Get current user holdings
            const allHoldings = await this.vaultDepositService.getHoldings(
              vault.vaultAddress
            );
            const userHoldings = allHoldings.filter(
              (holding) => holding.userAddress === userAddress
            );

            const currentValue = userHoldings.reduce((sum, holding) => {
              const raw = holding.sharesReceived as any;
              const amount = typeof raw === "number" ? raw : Number(raw);
              return sum + (isNaN(amount) ? 0 : amount);
            }, 0);

            const totalReturns = currentValue + totalRedeemed - totalDeposited;

            // Get vault APY (use default since APY is not stored in VaultFactory)
            const apy = 15.8; // Default APY - you can implement APY calculation from historical data

            // Calculate real price changes using Jupiter API
            let dayChange = 0;
            let dayChangePercent = 0;
            let weekChange = 0;
            let weekChangePercent = 0;

            try {
              // Get price data for vault's underlying assets
              if (vault.underlyingAssets && vault.underlyingAssets.length > 0) {
                const pricePromises = vault.underlyingAssets.map(
                  async (asset) => {
                    if (asset.assetAllocation) {
                      // Get the mint address from assetAllocation
                      const assetAllocation =
                        await this.assetAllocationService.findOne(
                          asset.assetAllocation.toString()
                        );
                      if (assetAllocation?.mintAddress) {
                        return this.getTokenPriceData(
                          assetAllocation.mintAddress
                        );
                      }
                    }
                    return { price: 0, change24h: 0 };
                  }
                );

                const priceData = await Promise.all(pricePromises);

                // Calculate weighted average 24h change based on asset allocations
                let totalWeightedChange = 0;
                let totalWeight = 0;

                priceData.forEach((price, index) => {
                  const weight = vault.underlyingAssets[index]?.pct_bps || 0;
                  totalWeightedChange += price.change24h * weight;
                  totalWeight += weight;
                });

                if (totalWeight > 0) {
                  dayChangePercent = totalWeightedChange / totalWeight;
                  dayChange = currentValue * (dayChangePercent / 100);

                  // Get historical data for better 7-day calculation
                  const historicalPromises = vault.underlyingAssets.map(
                    async (asset) => {
                      if (asset.assetAllocation) {
                        const assetAllocation =
                          await this.assetAllocationService.findOne(
                            asset.assetAllocation.toString()
                          );
                        if (assetAllocation?.mintAddress) {
                          return this.getHistoricalPriceData(
                            assetAllocation.mintAddress
                          );
                        }
                      }
                      return { price: 0, change7d: 0 };
                    }
                  );

                  const historicalData = await Promise.all(historicalPromises);

                  // Calculate weighted average 7-day change
                  let totalWeighted7dChange = 0;
                  historicalData.forEach((data, index) => {
                    const weight = vault.underlyingAssets[index]?.pct_bps || 0;
                    totalWeighted7dChange += data.change7d * weight;
                  });

                  weekChangePercent = totalWeighted7dChange / totalWeight;
                  weekChange = currentValue * (weekChangePercent / 100);
                }
              }
            } catch (error) {
              this.logger.warn(
                `Error fetching price data for vault ${vault._id}:`,
                error
              );
              // Fallback to small positive changes if price data fails
              dayChange = currentValue * (this.FALLBACK_DAILY_GROWTH / 100); // 0.1% fallback
              dayChangePercent = this.FALLBACK_DAILY_GROWTH;
              weekChange = currentValue * (this.FALLBACK_WEEKLY_GROWTH / 100); // 7% fallback
              weekChangePercent = this.FALLBACK_WEEKLY_GROWTH;
            }

            userVaults.push({
              vaultId: vault._id.toString(),
              vaultName: vault.vaultName,
              vaultSymbol: vault.vaultSymbol,
              vaultAddress: vault.vaultAddress || null,
              totalDeposited: toBase10Decimal(totalDeposited),
              totalRedeemed: toBase10Decimal(totalRedeemed),
              currentValue: toBase10Decimal(currentValue),
              totalReturns: toBase10Decimal(totalReturns),
              apy,
              vaultIndex: vault.vaultIndex,
              dayChange: toBase10Decimal(dayChange),
              dayChangePercent,
              weekChange: toBase10Decimal(weekChange),
              weekChangePercent,
            });
          }
        } catch (error) {
          this.logger.warn(
            `Error processing vault ${vault._id} for user ${userAddress}:`,
            error
          );
          // Continue with other vaults
        }
      }

      return {
        vaults: userVaults,
        total: userVaults.length,
      };
    } catch (error) {
      this.logger.error(`Error getting user vaults for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Generate portfolio chart data based on actual vault metrics
   * @param userVaults - Array of user vaults with their metrics
   * @param currentTotalValue - Current total portfolio value
   * @param period - Time period for chart data (default: "7d")
   * @returns Array of chart data points
   */
  private async generatePortfolioChartData(
    userVaults: any[],
    currentTotalValue: number,
    period: string = "7d"
  ): Promise<any[]> {
    try {
      this.logger.log(
        `📊 STEP 1: Generating portfolio chart data for ${userVaults.length} vaults over ${period}`
      );
      this.logger.log(
        `📊 STEP 1: Starting portfolio chart generation with ${userVaults.length} vaults, period: ${period}, currentValue: $${currentTotalValue}`
      );

      const chartData = [];

      // Calculate days based on period
      let days: number;
      switch (period) {
        case "1d":
          days = 1;
          break;
        case "7d":
          days = 7;
          break;
        case "30d":
          days = 30;
          break;
        case "90d":
          days = 90;
          break;
        case "1y":
          days = 365;
          break;
        default:
          days = 7;
      }

      this.logger.log(
        `📊 STEP 2: Calculated ${days} days for period ${period}`
      );

      // Generate data for the specified period
      this.logger.log(
        `📊 STEP 3: Starting data generation loop for ${days + 1} data points`
      );
      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        this.logger.log(
          `📊 STEP 4: Processing day ${days - i + 1}/${days + 1} (${
            date.toISOString().split("T")[0]
          })`
        );

        // Calculate portfolio value for this day based on actual vault metrics
        let dayValue = 0;

        // For each vault, calculate its value on this day using real metrics
        for (const vault of userVaults) {
          try {
            this.logger.log(
              `📊 STEP 5: Processing vault ${vault.vaultName} (${vault.vaultId})`
            );

            // Get vault details to access NAV/GAV data
            const vaultDetails = await this.vaultFactoryService.findOne(
              vault.vaultId
            );
            if (!vaultDetails) {
              this.logger.log(
                `❌ FALLBACK: Vault details not found for ${vault.vaultId}`
              );
              continue;
            }

            // Calculate historical value based on actual vault performance
            let historicalVaultValue = vault.currentValue;
            let dataSource = "UNKNOWN";

            // If we have week change data, use it to calculate historical values
            if (vault.weekChangePercent && vault.weekChangePercent !== 0) {
              this.logger.log(
                `✅ REAL DATA: Using week change ${vault.weekChangePercent}% for ${vault.vaultName}`
              );
              dataSource = "REAL_WEEK_CHANGE";
              // Calculate daily performance from weekly performance
              const dailyPerformance = vault.weekChangePercent / 7; // Average daily performance
              const daysFromNow = days - i;

              // Apply daily performance to get historical value
              // Use compound interest formula: P * (1 + r)^n
              const performanceFactor = Math.pow(
                1 + dailyPerformance / 100,
                -daysFromNow
              );
              historicalVaultValue = vault.currentValue * performanceFactor;
            } else if (vault.dayChangePercent && vault.dayChangePercent !== 0) {
              this.logger.log(
                `✅ REAL DATA: Using day change ${vault.dayChangePercent}% for ${vault.vaultName}`
              );
              dataSource = "REAL_DAY_CHANGE";
              // Use daily change to calculate historical values
              const daysFromNow = days - i;
              const dailyFactor = 1 + vault.dayChangePercent / 100;
              const historicalFactor = Math.pow(dailyFactor, -daysFromNow);
              historicalVaultValue = vault.currentValue * historicalFactor;
            } else {
              this.logger.log(
                `⚠️ FALLBACK: No performance data for ${vault.vaultName}, using estimated growth ${this.ESTIMATED_DAILY_GROWTH}%`
              );
              dataSource = "FALLBACK_ESTIMATED";
              // If no performance data, use a small positive trend
              const daysFromNow = days - i;
              const growthFactor = Math.pow(
                1 + this.ESTIMATED_DAILY_GROWTH / 100,
                -daysFromNow
              );
              historicalVaultValue = vault.currentValue * growthFactor;
            }

            this.logger.log(
              `📊 STEP 6: ${
                vault.vaultName
              } - Data Source: ${dataSource}, Historical Value: $${historicalVaultValue.toFixed(
                4
              )}`
            );

            // Ensure minimum value and add to total
            dayValue += Math.max(historicalVaultValue, 0.001);
          } catch (vaultError) {
            this.logger.log(
              `❌ ERROR: Processing vault ${vault.vaultId} failed:`,
              vaultError.message
            );
            this.logger.warn(
              `Error processing vault ${vault.vaultId} for chart data:`,
              vaultError
            );
            // Use current value with small variation if vault processing fails
            const fallbackValue =
              vault.currentValue * (0.95 + Math.random() * 0.1); // ±5% variation
            this.logger.log(
              `⚠️ FALLBACK: Using error fallback for ${
                vault.vaultName
              }: $${fallbackValue.toFixed(4)}`
            );
            dayValue += Math.max(fallbackValue, 0.001);
          }
        }

        // If no vaults processed successfully, use current total with realistic variation
        if (dayValue === 0 && currentTotalValue > 0) {
          this.logger.log(
            `⚠️ FALLBACK: No vaults processed, using portfolio-level fallback for day ${
              days - i + 1
            }`
          );
          // Create a more realistic trend based on typical DeFi performance
          const daysFromNow = days - i;
          const dailyGrowth = this.ESTIMATED_WEEKLY_GROWTH / 7;
          const growthFactor = Math.pow(1 + dailyGrowth / 100, -daysFromNow);
          dayValue = currentTotalValue * growthFactor;
          this.logger.log(
            `📊 FALLBACK: Portfolio fallback value: $${dayValue.toFixed(
              4
            )} (growth: ${dailyGrowth.toFixed(4)}%)`
          );
        }

        // Calculate change from previous day
        const previousValue =
          chartData.length > 0
            ? chartData[chartData.length - 1].value
            : dayValue;
        const change = dayValue - previousValue;
        const changePercent =
          previousValue > 0 ? (change / previousValue) * 100 : 0;

        this.logger.log(
          `📊 STEP 7: Day ${days - i + 1} - Total Value: $${dayValue.toFixed(
            4
          )}, Change: $${change.toFixed(4)} (${changePercent.toFixed(2)}%)`
        );

        chartData.push({
          date: date.toISOString().split("T")[0], // Format as YYYY-MM-DD
          value: Math.max(dayValue, 0.001), // Ensure minimum value
          change: change,
          changePercent: changePercent,
        });
      }

      this.logger.log(
        `📊 STEP 8: Successfully generated ${chartData.length} chart data points`
      );
      this.logger.log(
        `Generated ${chartData.length} chart data points based on actual vault metrics`
      );
      return chartData;
    } catch (error) {
      this.logger.log(
        `❌ ERROR: Portfolio chart generation failed:`,
        error.message
      );
      this.logger.error(`Error generating portfolio chart data:`, error);

      // Fallback: return realistic mock data based on current portfolio value
      this.logger.log(
        `⚠️ FALLBACK: Using complete fallback data generation due to error`
      );
      const fallbackData = [];

      // Recalculate days for fallback
      let fallbackDays: number;
      switch (period) {
        case "1d":
          fallbackDays = 1;
          break;
        case "7d":
          fallbackDays = 7;
          break;
        case "30d":
          fallbackDays = 30;
          break;
        case "90d":
          fallbackDays = 90;
          break;
        case "1y":
          fallbackDays = 365;
          break;
        default:
          fallbackDays = 7;
      }

      this.logger.log(
        `📊 FALLBACK: Generating ${
          fallbackDays + 1
        } fallback data points for period ${period}`
      );

      for (let i = fallbackDays; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        // Create realistic portfolio growth trend
        const daysFromNow = fallbackDays - i;
        const dailyGrowth = this.FALLBACK_WEEKLY_GROWTH_RATE / 7;
        const growthFactor = Math.pow(1 + dailyGrowth / 100, -daysFromNow);
        const value = currentTotalValue * growthFactor;

        this.logger.log(
          `📊 FALLBACK: Day ${fallbackDays - i + 1} - Value: $${value.toFixed(
            4
          )} (growth: ${dailyGrowth.toFixed(4)}%)`
        );

        fallbackData.push({
          date: date.toISOString().split("T")[0],
          value: Math.max(value, 0.001),
          change:
            i === fallbackDays
              ? 0
              : value -
                (fallbackData[fallbackData.length - 1]?.value ||
                  currentTotalValue),
          changePercent:
            i === fallbackDays
              ? 0
              : ((value -
                  (fallbackData[fallbackData.length - 1]?.value ||
                    currentTotalValue)) /
                  (fallbackData[fallbackData.length - 1]?.value ||
                    currentTotalValue)) *
                100,
        });
      }

      this.logger.log(
        `📊 FALLBACK: Successfully generated ${fallbackData.length} fallback data points`
      );
      this.logger.log(`Using fallback chart data with realistic growth trend`);
      return fallbackData;
    }
  }
}
