import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Document } from "mongoose";
import { CreateVaultFactoryDto } from "./dto/create-vault-factory.dto";
import { UpdateVaultFactoryDto } from "./dto/update-vault-factory.dto";
import { VaultCreationEventDto } from "./dto/vault-creation-event.dto";
import { VaultFactory } from "./entities/vault-factory.entity";
import {
  VaultCreationParams,
  VaultCreationEvent,
} from "./interfaces/vault-creation.interface";
import { ProfileService } from "../profile/profile.service";
import { TokenManagementService } from "./token-management.service";
import {
  PaginationHelper,
  PaginationQuery,
  PaginatedResponse,
} from "../../middlewares/pagination/paginationHelper";
import { HistoryService } from "../history/history.service";
import { RedisService } from "../../utils/redis/redis.service";
import { AssetAllocationService } from "../asset-allocation/asset-allocation.service";
import { sanitizeRegexInput } from "../../utils/utils";
import { ConfigService } from "../config/config.service";
import { ChartsService } from "../charts/charts.service";
import { VaultDepositService } from "../vault-deposit/vault-deposit.service";
import { Inject, forwardRef } from "@nestjs/common";

// Type for VaultFactory with Mongoose Document methods
type VaultFactoryDocument = VaultFactory & Document;

@Injectable()
export class VaultFactoryService {
  private readonly logger = new Logger(VaultFactoryService.name);

  constructor(
    @InjectModel(VaultFactory.name)
    private vaultFactoryModel: Model<VaultFactoryDocument>,
    private readonly profileService: ProfileService,
    private readonly tokenManagementService: TokenManagementService,
    private readonly paginationHelper: PaginationHelper,
    private readonly historyService: HistoryService,
    private readonly redisService: RedisService,
    private readonly assetAllocationService: AssetAllocationService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => VaultDepositService))
    private readonly vaultDepositService: VaultDepositService,
    @Inject(forwardRef(() => ChartsService))
    private readonly chartsService: ChartsService
  ) {}

  /**
   * Public helper to create a pagination query from the incoming request
   */
  createPaginationQuery(req: any): PaginationQuery {
    return this.paginationHelper.createPaginationQuery(req);
  }

  async create(
    createVaultFactoryDto: CreateVaultFactoryDto
  ): Promise<VaultFactoryDocument> {
    // Validate vault creation parameters
    this.validateVaultCreationParams(createVaultFactoryDto);

    const vault = new this.vaultFactoryModel({
      vaultName: createVaultFactoryDto.vaultName,
      vaultSymbol: createVaultFactoryDto.vaultSymbol,
      underlyingAssets: createVaultFactoryDto.underlyingAssets,
      feeConfig: createVaultFactoryDto.feeConfig,
      creator: createVaultFactoryDto.creator,
      creatorAddress: createVaultFactoryDto.creatorAddress,
      status: "pending",
    });

    const savedVault = await vault.save();

    return savedVault;
  }

  /**
   * Increment totalAssetLocked per underlying asset by mint for a vault (by address)
   */
  async incrementTotalAssetLockedByVaultAddress(
    vaultAddress: string,
    mintToAmountRawUnits: Record<string, number>
  ): Promise<void> {
    try {
      const vault = await this.vaultFactoryModel
        .findOne({ vaultAddress })
        .populate({
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress decimals symbol name",
        })
        .exec();

      if (
        !vault ||
        !vault.underlyingAssets ||
        vault.underlyingAssets.length === 0
      ) {
        return;
      }
      let updated = false;
      for (const ua of vault.underlyingAssets as any[]) {
        const aa = ua.assetAllocation as any;
        if (!aa || !aa.mintAddress) continue;
        const mint = aa.mintAddress as string;
        if (mintToAmountRawUnits[mint] != null) {
          const addAmount = Number(mintToAmountRawUnits[mint]) || 0;
          const prev = Number(ua.totalAssetLocked || 0);
          ua.totalAssetLocked = prev + addAmount;
          updated = true;
        }
      }
      if (updated) {
        await vault.save();
      }
    } catch (error) {
      this.logger.error(
        `Error incrementing totalAssetLocked for vault ${vaultAddress}:`,
        error
      );
      // Do not throw to avoid breaking the main flow
    }
  }

  /**
   * Create a vault from structured program data (from transaction event management)
   * @param structuredData - Structured program data from Solana transaction
   * @returns Created vault document
   */
  async createFromStructuredProgramData(structuredData: {
    eventType: string;
    vault: string;
    factory: string;
    creator: string;
    vaultName: string;
    vaultSymbol: string;
    managementFeeBps: number;
    underlyingAssets: Array<{
      mint: string;
      pctBps: number;
      percentage: string;
    }>;
    underlyingAssetsCount: number;
    vaultIndex?: number;
    etfVaultPda?: string;
    etfMint?: string;
    vaultTreasury?: string;
    totalSupply: string;
    nav: string;
    timestamp: string;
    createdAt: string;
    bannerUrl?: string;
    vaultLogoUrl?: string;
    description?: string;
  }): Promise<VaultFactoryDocument> {
    // Creating vault from structured program data
    // Check if vault already exists
    const existingVault = await this.vaultFactoryModel.findOne({
      vaultAddress: structuredData.vault,
    });

    if (existingVault) {
      return existingVault;
    }

    let creatorProfile = await this.profileService.getByWalletAddress(
      structuredData.creator
    );
    if (!creatorProfile) {
      creatorProfile = undefined;
    }
    // Process underlying assets with foreign key references
    const processedUnderlyingAssets = await Promise.all(
      structuredData.underlyingAssets.map(async (asset) => {
        try {
          // Find asset allocation by mint address
          const assetAllocation =
            await this.assetAllocationService.findByMintAddress(asset.mint);

          // Return only the foreign key reference and percentage
          return {
            assetAllocation: assetAllocation._id,
            pct_bps: asset.pctBps,
          };
        } catch (error) {
          this.logger.error(
            `Error processing asset ${asset.mint}:`,
            error.message
          );
          throw new Error(
            `Asset allocation not found for mint address: ${asset.mint}`
          );
        }
      })
    );
    // Create vault with structured data
    const vault = new this.vaultFactoryModel({
      vaultName: structuredData.vaultName,
      vaultSymbol: structuredData.vaultSymbol,
      underlyingAssets: processedUnderlyingAssets,
      feeConfig: {
        managementFeeBps: structuredData.managementFeeBps,
      },
      status: "active",
      vaultAddress: structuredData.vault,
      factoryAddress: structuredData.factory,
      creatorAddress: structuredData.creator,
      vaultIndex: structuredData.vaultIndex,
      etfVaultPda: structuredData.etfVaultPda,
      etfMint: structuredData.etfMint,
      vaultTreasury: structuredData.vaultTreasury,
      creator: creatorProfile?._id,
      totalSupply: structuredData.totalSupply,
      nav: structuredData.nav,
      blockTime: this.convertUnixTimestampToUTC(structuredData.timestamp),
      originalTimestamp: structuredData.timestamp, // Store original Unix timestamp
      network: this.configService.get("SOLANA_NETWORK"),
      // creator field is optional and will be populated later
      bannerUrl: structuredData.bannerUrl,
      logoUrl: structuredData.vaultLogoUrl,
      description: structuredData.description,
    });

    const savedVault = await vault.save();

    await this.historyService.create({
      action: "vault_created",
      description:
        structuredData.description || creatorProfile
          ? `Vault ${structuredData.vaultName} created by ${
              creatorProfile.name || structuredData.creator
            }`
          : `Vault ${structuredData.vaultName} created by ${structuredData.creator} (user not in database)`,
      performedBy: creatorProfile?._id?.toString(), // will be undefined if not found
      vaultId: savedVault._id,
      relatedEntity: "vault",
    });

    await this.clearVaultCache();

    return savedVault;
  }

  /**
   * Convert Unix timestamp to UTC Date object
   * @param unixTimestamp - Unix timestamp string
   * @returns UTC Date object
   */
  private convertUnixTimestampToUTC(unixTimestamp: string): Date {
    try {
      const timestamp = parseInt(unixTimestamp);
      if (isNaN(timestamp)) {
        throw new Error(`Invalid timestamp: ${unixTimestamp}`);
      }

      // Convert Unix timestamp (seconds) to milliseconds and create UTC Date
      const utcDate = new Date(timestamp * 1000);

      // Validate the date
      if (isNaN(utcDate.getTime())) {
        throw new Error(`Invalid date created from timestamp: ${timestamp}`);
      }

      return utcDate;
    } catch (error) {
      this.logger.error(
        `Error converting timestamp ${unixTimestamp} to UTC: ${error.message}`
      );
      // Return current UTC time as fallback
      return new Date();
    }
  }

  async findAll(): Promise<VaultFactoryDocument[]> {
    return this.vaultFactoryModel
      .find()
      .populate([
        {
          path: "creator",
          select: "name email walletAddress socialLinks",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress name symbol type decimals logoUrl active",
        },
      ])
      .exec();
  }

  /**
   * Get paginated vaults with filtering and sorting
   * @param paginationQuery - Pagination options from middleware
   * @param query - Optional query criteria
   * @returns Paginated response
   */
  async findAllPaginated(
    paginationQuery: PaginationQuery,
    query: any = {}
  ): Promise<PaginatedResponse<VaultFactoryDocument>> {
    const { vaultName, vaultSymbol, status, search } = query;

    // Build MongoDB filter
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
          filter.vaultSymbol = { $regex: sanitizedVaultSymbol, $options: "i" };
        }
      }
    }

    // Add status filter (exclude 'all' status)
    if (status && status !== "all") {
      filter.status = status;
    }
    // If status is 'all' or undefined, no status filter is applied (returns all statuses)

    const populateOptions = [
      {
        path: "creator",
        select: "name email walletAddress socialLinks",
      },
      {
        path: "underlyingAssets.assetAllocation",
        select: "mintAddress name symbol type decimals logoUrl active",
      },
    ];

    return this.paginationHelper.paginate(
      this.vaultFactoryModel,
      filter,
      paginationQuery,
      populateOptions
    );
  }

  /**
   * Get paginated vaults with filtering and sorting - optimized for VaultCard component
   * @param paginationQuery - Pagination options from middleware
   * @param query - Optional query criteria
   * @returns Paginated response with only VaultCard required fields
   */
  async findAllPaginatedUser(
    paginationQuery: PaginationQuery,
    query: any = {}
  ): Promise<PaginatedResponse<any>> {
    const { vaultName, vaultSymbol, status, creatorAddress, search } = query;

    // Build MongoDB filter
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
          filter.vaultSymbol = { $regex: sanitizedVaultSymbol, $options: "i" };
        }
      }
    }

    // Add status filter (exclude 'all' status)
    if (status && status !== "all") {
      filter.status = status;
    }
    // If status is 'all' or undefined, no status filter is applied (returns all statuses)

    if (creatorAddress && creatorAddress.trim()) {
      filter.creator = creatorAddress;
    }

    const populateOptions = [
      {
        path: "creator",
        select: "name email avatar",
      },
      {
        path: "underlyingAssets.assetAllocation",
        select: "name symbol logoUrl",
      },
    ];

    // Get the raw paginated data
    const result = await this.paginationHelper.paginate(
      this.vaultFactoryModel,
      filter,
      paginationQuery,
      populateOptions
    );

    // Transform data to match VaultCard component requirements
    const transformedData = await Promise.all(
      result.data.map(async (vault: any) => {
        const apy = await this.chartsService.calculateAnnualApy(vault._id);
        return {
          _id: vault._id,
          vaultName: vault.vaultName,
          vaultSymbol: vault.vaultSymbol,
          feeConfig: {
            managementFeeBps: vault.feeConfig?.managementFeeBps || 0,
          },
          nav: vault.nav,
          totalSupply: vault.totalSupply,
          status: vault.status,
          underlyingAssets: vault.underlyingAssets,
          creator: {
            name:
              typeof vault.creator === "object" && vault.creator?.name
                ? vault.creator.name
                : "Unknown Creator",
            email:
              typeof vault.creator === "object" && vault.creator?.email
                ? vault.creator.email
                : "",
          },
          apy,
        };
      })
    );

    return {
      data: transformedData,
      pagination: result.pagination,
    };
  }

  async findOne(id: string): Promise<any> {
    const vault = await this.vaultFactoryModel
      .findById(id)
      .populate([
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress name symbol type logoUrl",
        },
      ])
      .select(
        "vaultName vaultSymbol creator vaultAddress creatorAddress feeConfig status underlyingAssets description logoUrl bannerUrl vaultIndex"
      )
      .exec();
    if (!vault) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }

    const apy = await this.chartsService.calculateAnnualApy(
      vault._id.toString()
    );

    // Calculate share price, NAV, and total tokens
    let sharePrice: number | null = null;
    let nav: number | null = null;
    let totalTokens: number | null = null;
    try {
      const sharePriceData = await this.chartsService.getVaultSharePrice(
        vault._id.toString()
      );
      if (sharePriceData) {
        sharePrice = sharePriceData.sharePrice;
        nav = sharePriceData.nav;
        totalTokens = sharePriceData.totalSupply;
      }
    } catch (error) {
      this.logger.warn(
        `Share price computation failed for vault ${id}: ${error?.message}`
      );
    }

    // Calculate Net TVL (deposits - redeems) if vault has an address
    let totalValueLocked: number | null = null;
    if (vault.vaultAddress) {
      try {
        totalValueLocked =
          await this.vaultDepositService.getNetValueLockedByVaultAddress(
            vault.vaultAddress
          );
      } catch (error) {
        this.logger.warn(
          `TVL computation failed for vault ${id} (${vault.vaultAddress}): ${error?.message}`
        );
      }
    }

    // Get minimum deposit and redeem values from config with fallbacks
    const miniDeposit = this.configService.get("MINI_DEPOSIT") || "5";
    const miniRedeem = this.configService.get("MINI_REDEEM") || "4";

    const obj =
      typeof (vault as any).toObject === "function"
        ? (vault as any).toObject()
        : vault;
    return {
      ...obj,
      apy,
      sharePrice,
      nav,
      totalTokens,
      totalValueLocked,
      miniDeposit: parseFloat(miniDeposit),
      miniRedeem: parseFloat(miniRedeem),
    };
  }

  async findById(id: string): Promise<VaultFactoryDocument> {
    const vault = await this.vaultFactoryModel
      .findById(id)
      .populate([
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress name symbol type logoUrl",
        },
      ])
      .exec();
    if (!vault) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }
    return vault;
  }

  async findByAddress(vaultAddress: string): Promise<any> {
    const vault = await this.vaultFactoryModel
      .findOne({ vaultAddress })
      .populate([
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress name symbol type logoUrl",
        },
      ])
      .exec();
    if (!vault) {
      throw new BadRequestException(
        `Vault with address ${vaultAddress} not found`
      );
    }

    // Check if vault has all required data for operations
    this.validateVaultCompleteness(vault);
    const apy = await this.chartsService.calculateAnnualApy(
      vault._id.toString()
    );

    // Calculate share price, NAV, and total tokens
    let sharePrice: number | null = null;
    let nav: number | null = null;
    let totalTokens: number | null = null;
    try {
      const sharePriceData = await this.chartsService.getVaultSharePrice(
        vault._id.toString()
      );
      if (sharePriceData) {
        sharePrice = sharePriceData.sharePrice;
        nav = sharePriceData.nav;
        totalTokens = sharePriceData.totalSupply;
      }
    } catch (error) {
      this.logger.warn(
        `Share price computation failed for vault ${vault._id} (${vaultAddress}): ${error?.message}`
      );
    }

    const obj =
      typeof (vault as any).toObject === "function"
        ? (vault as any).toObject()
        : vault;
    return { ...obj, apy, sharePrice, nav, totalTokens };
  }

  async findByVaultNameAndSymbol(
    vaultName: string,
    vaultSymbol: string
  ): Promise<VaultFactoryDocument> {
    const vault = await this.vaultFactoryModel
      .findOne({
        vaultName: { $regex: new RegExp(`^${vaultName}$`, "i") },
        vaultSymbol: { $regex: new RegExp(`^${vaultSymbol}$`, "i") },
      })
      .populate([
        {
          path: "creator",
          select: "name email walletAddress socialLinks avatar",
        },
        {
          path: "underlyingAssets.assetAllocation",
          select: "mintAddress name symbol type logoUrl",
        },
      ])
      .exec();

    if (!vault) {
      throw new BadRequestException(
        `Vault with name "${vaultName}" and symbol "${vaultSymbol}" not found`
      );
    }

    return vault;
  }

  /**
   * Validate that a vault has all required data for operations
   * @param vault - The vault to validate
   * @throws BadRequestException if vault is incomplete
   */
  private validateVaultCompleteness(vault: VaultFactoryDocument): void {
    if (!vault.creator) {
      throw new BadRequestException(
        `Vault ${vault._id} is missing creator information`
      );
    }

    if (vault.status === "pending") {
      throw new BadRequestException(
        `Vault ${vault._id} is still pending data population`
      );
    }
  }

  async findByTransactionSignature(transactionSignature: string): Promise<any> {
    const vault = await this.vaultFactoryModel
      .findOne({ transactionSignature })
      .exec();
    if (!vault) {
      throw new BadRequestException(
        `Vault with transaction signature ${transactionSignature} not found`
      );
    }
    const apy = await this.chartsService.calculateAnnualApy(
      vault._id.toString()
    );
    const obj =
      typeof (vault as any).toObject === "function"
        ? (vault as any).toObject()
        : vault;
    return { ...obj, apy };
  }

  async update(
    id: string,
    updateVaultFactoryDto: UpdateVaultFactoryDto
  ): Promise<VaultFactoryDocument> {
    const updatedVault = await this.vaultFactoryModel
      .findByIdAndUpdate(id, updateVaultFactoryDto, { new: true })
      .exec();

    if (!updatedVault) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }

    return updatedVault;
  }

  async remove(id: string): Promise<void> {
    const result = await this.vaultFactoryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }
    // Vault removed successfully
  }

  async setVaultAddress(
    id: string,
    vaultAddress: string
  ): Promise<VaultFactoryDocument> {
    const updatedVault = await this.vaultFactoryModel
      .findByIdAndUpdate(
        id,
        {
          vaultAddress,
          status: "active",
        },
        { new: true }
      )
      .exec();

    if (!updatedVault) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }

    return updatedVault;
  }

  async updateStatus(
    id: string,
    status: "pending" | "active" | "paused" | "closed"
  ): Promise<VaultFactoryDocument> {
    const updatedVault = await this.vaultFactoryModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!updatedVault) {
      throw new BadRequestException(`Vault with ID ${id} not found`);
    }

    return updatedVault;
  }

  async checkVaultNameExists(vaultName: string): Promise<boolean> {
    const existing = await this.vaultFactoryModel.findOne({ vaultName });
    return !!existing;
  }

  async getUserVaults(
    userId: string,
    paginationQuery: PaginationQuery,
    query: any = {}
  ): Promise<PaginatedResponse<VaultFactoryDocument>> {
    try {
      this.logger.log(`Fetching user vaults for user ID: ${userId}`);

      if (!userId) {
        this.logger.warn("No user ID provided");
        return {
          data: [],
          pagination: {
            page: 1,
            limit: paginationQuery.limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        };
      }

      const { vaultName, vaultSymbol, status, search } = query;

      // Build MongoDB filter starting with user filter
      const filter: any = { creator: userId };

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

      const result = await this.paginationHelper.paginate(
        this.vaultFactoryModel,
        filter,
        paginationQuery,
        populateOptions
      );

      this.logger.log(
        `Found ${result.data.length} vaults for user ${userId} (page ${result.pagination.page}/${result.pagination.totalPages})`
      );
      return result;
    } catch (error) {
      this.logger.error(`Error fetching user vaults for ${userId}:`, error);
      throw error;
    }
  }

  private validateVaultCreationParams(params: CreateVaultFactoryDto): void {
    // Validate fee configuration
    if (
      params.feeConfig.managementFeeBps < 0 ||
      params.feeConfig.managementFeeBps > 10000
    ) {
      throw new BadRequestException(
        "Management fee must be between 0 and 10000 basis points"
      );
    }

    // Validate underlying assets percentages sum to 10000 (100%)
    const totalPercentage = params.underlyingAssets.reduce(
      (sum, asset) => sum + asset.pct_bps,
      0
    );
    if (totalPercentage !== 10000) {
      throw new BadRequestException(
        "Underlying assets percentages must sum to 10000 basis points (100%)"
      );
    }
  }

  getVaultCreationParams(vault: VaultFactory): VaultCreationParams {
    return {
      vaultName: vault.vaultName,
      vaultSymbol: vault.vaultSymbol,
      underlyingAssets: vault.underlyingAssets.map((asset) => ({
        assetAllocationId: asset.assetAllocation.toString(),
        pct_bps: asset.pct_bps,
      })),
      feeConfig: vault.feeConfig,
    };
  }

  /**
   * Populate missing required data for vaults created from simplified blockchain events
   * This method resolves data that cannot be extracted from the simplified blockchain event
   */
  private async populateMissingVaultDataFromSimpleEvent(
    vaultId: string,
    vaultData: {
      vault: string;
      factory: string;
      creator: string;
      vault_name: string;
      vault_symbol: string;
      management_fee_bps: number;
      underlying_assets: Array<{
        assetAllocationId: string;
        pct_bps: number;
      }>;
      underlying_assets_count: number;
      total_supply: number;
      nav: number;
      timestamp: number;
    }
  ): Promise<void> {
    try {
      // Populating missing data for vault

      const updates: Partial<VaultFactory> = {};

      // Resolve creator from blockchain address if possible
      if (vaultData.creator) {
        const creatorProfile = await this.resolveCreatorFromAddress(
          vaultData.creator
        );
        if (creatorProfile) {
          updates.creator = creatorProfile._id;
          // Resolved creator for vault
        }
      }

      // Update vault with resolved data
      if (Object.keys(updates).length > 0) {
        await this.vaultFactoryModel.findByIdAndUpdate(vaultId, updates, {
          new: true,
        });
        // Updated vault with resolved data

        // If we have all required data, activate the vault
        if (updates.creator) {
          await this.updateStatus(vaultId, "active");
          // Vault activated after data population
        }
      }
    } catch (error) {
      this.logger.error(
        `Error populating missing vault data for ${vaultId} from simple event:`,
        error
      );
      throw error;
    }
  }

  /**
   * Resolve creator profile from blockchain address
   * This should integrate with your profile/user management system
   */
  private async resolveCreatorFromAddress(
    creatorAddress: string
  ): Promise<any> {
    try {
      const profile = await this.profileService.getByWalletAddress(
        creatorAddress
      );
      if (profile) {
        // Resolved creator for address
        return profile;
      }
      // Creator resolution not found for address
      return null;
    } catch (error) {
      this.logger.error(
        `Error resolving creator from address ${creatorAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get total count of all vaults
   */
  async count(): Promise<number> {
    return this.vaultFactoryModel.countDocuments().exec();
  }

  /**
   * Get count of vaults by status
   * @param status - The status to count
   */
  async countByStatus(
    status: "pending" | "active" | "paused" | "closed"
  ): Promise<number> {
    return this.vaultFactoryModel.countDocuments({ status }).exec();
  }

  private deriveSymbolFromMint(mint: string): string {
    // Common Solana token mappings
    const tokenMappings: { [key: string]: { symbol: string; name: string } } = {
      So11111111111111111111111111111111111111112: {
        symbol: "SOL",
        name: "Solana",
      },
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
        symbol: "USDC",
        name: "USD Coin",
      },
      Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
        symbol: "USDT",
        name: "Tether USD",
      },
      mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: {
        symbol: "mSOL",
        name: "Marinade Staked SOL",
      },
      "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": {
        symbol: "stSOL",
        name: "Lido Staked SOL",
      },
      DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
        symbol: "BONK",
        name: "Bonk",
      },
      "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
        symbol: "ETH",
        name: "Ethereum (Portal)",
      },
      A9mUU4qviSctJVPJdBJWkb28k915yHhN2L8bebiYzSg7: {
        symbol: "wBTC",
        name: "Wrapped Bitcoin",
      },
    };

    if (tokenMappings[mint]) {
      return tokenMappings[mint].symbol;
    }

    // For unknown tokens, return a shortened version of the mint address
    return mint.substring(0, 4) + "..." + mint.substring(mint.length - 4);
  }

  private deriveNameFromMint(mint: string): string {
    // Common Solana token mappings
    const tokenMappings: { [key: string]: { symbol: string; name: string } } = {
      So11111111111111111111111111111111111111112: {
        symbol: "SOL",
        name: "Solana",
      },
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
        symbol: "USDC",
        name: "USD Coin",
      },
      Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
        symbol: "USDT",
        name: "Tether USD",
      },
      mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: {
        symbol: "mSOL",
        name: "Marinade Staked SOL",
      },
      "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": {
        symbol: "stSOL",
        name: "Lido Staked SOL",
      },
      DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
        symbol: "BONK",
        name: "Bonk",
      },
      "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
        symbol: "ETH",
        name: "Ethereum (Portal)",
      },
      A9mUU4qviSctJVPJdBJWkb28k915yHhN2L8bebiYzSg7: {
        symbol: "wBTC",
        name: "Wrapped Bitcoin",
      },
    };

    if (tokenMappings[mint]) {
      return tokenMappings[mint].name;
    }

    // For unknown tokens, return a generic name
    return "Unknown Token";
  }

  /**
   * Update vault's featured status
   * @param id - Vault ID
   * @param isFeaturedVault - Featured status
   * @returns Updated vault document
   */
  async updateFeaturedStatus(
    id: string,
    isFeaturedVault: boolean
  ): Promise<VaultFactoryDocument> {
    try {
      const updatedVault = await this.vaultFactoryModel
        .findByIdAndUpdate(id, { isFeaturedVault }, { new: true })
        .populate({
          path: "creator",
          select: "name email walletAddress socialLinks",
        })
        .exec();

      if (!updatedVault) {
        throw new BadRequestException(`Vault with ID ${id} not found`);
      }

      // Clear cache after updating featured status
      await this.clearVaultCache();
      return updatedVault;
    } catch (error) {
      this.logger.error(
        `Error updating featured status for vault ${id}:`,
        error
      );
      throw error;
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
          select: "mintAddress name symbol type decimals logoUrl active",
        },
      ];

      return this.paginationHelper.paginate(
        this.vaultFactoryModel,
        filter,
        paginationQuery,
        populateOptions
      );
    } catch (error) {
      this.logger.error(`Error finding all featured vaults:`, error);
      throw error;
    }
  }

  /**
   * Clear all vault-related cache entries
   */
  private async clearVaultCache(key?: string | string[]): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-factory keys
      const keys = await this.redisService.keys("vaults:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
        this.redisService.delDirect("vault:userMyVaults:*");
      } else {
        // No cache entries found to clear
      }

      // Also clear dashboard vault stats cache
      await this.redisService.delDirect("dashboard:vault-stats");
    } catch (error) {
      this.logger.error("❌ Error clearing vault cache:", error);
    }
  }

  /**
   * Update management fee for a specific vault
   * @param id - Vault ID
   * @param managementFeeBps - New management fee in basis points
   * @returns Updated vault document
   */
  async updateManagementFee(
    id: string,
    managementFeeBps: number
  ): Promise<VaultFactoryDocument> {
    try {
      const updatedVault = await this.vaultFactoryModel
        .findByIdAndUpdate(
          id,
          { "feeConfig.managementFeeBps": managementFeeBps },
          { new: true }
        )
        .populate({
          path: "creator",
          select: "name email walletAddress socialLinks",
        })
        .exec();

      if (!updatedVault) {
        throw new BadRequestException(`Vault with ID ${id} not found`);
      }

      this.logger.log(
        `Management fee updated for vault ${id}: ${managementFeeBps} bps`
      );
      return updatedVault;
    } catch (error) {
      this.logger.error(
        `Error updating management fee for vault ${id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update underlying assets for a specific vault
   * @param id - Vault ID
   * @param underlyingAssets - Array of underlying assets with allocations
   * @returns Updated vault document
   */
  async updateUnderlyingAssets(
    id: string,
    underlyingAssets: Array<{ assetAllocation: string; pct_bps: number }>
  ): Promise<VaultFactoryDocument> {
    try {
      // Validate that all asset allocations exist using the service
      const assetAllocationIds = underlyingAssets.map(
        (asset) => asset.assetAllocation
      );

      for (const assetId of assetAllocationIds) {
        try {
          await this.assetAllocationService.findOne(assetId);
        } catch (error) {
          throw new BadRequestException(
            `Asset allocation with ID ${assetId} not found`
          );
        }
      }

      // Validate that total percentage doesn't exceed 10000 bps (100%)
      const totalBps = underlyingAssets.reduce(
        (sum, asset) => sum + asset.pct_bps,
        0
      );
      if (totalBps > 10000) {
        throw new BadRequestException(
          "Total allocation cannot exceed 10000 basis points (100%)"
        );
      }

      const updatedVault = await this.vaultFactoryModel
        .findByIdAndUpdate(id, { underlyingAssets }, { new: true })
        .populate({
          path: "creator",
          select: "name email walletAddress socialLinks",
        })
        .populate({
          path: "underlyingAssets.assetAllocation",
          select: "name symbol mintAddress logoUrl",
        })
        .exec();

      if (!updatedVault) {
        throw new BadRequestException(`Vault with ID ${id} not found`);
      }

      this.logger.log(
        `Underlying assets updated for vault ${id}: ${underlyingAssets.length} assets`
      );
      return updatedVault;
    } catch (error) {
      this.logger.error(
        `Error updating underlying assets for vault ${id}:`,
        error
      );
      throw error;
    }
  }
}
