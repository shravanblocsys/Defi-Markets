import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Document } from "mongoose";
import { AssetAllocation } from "./entities/asset-allocation.entity";
import { CreateAssetAllocationDto } from "./dto/create-asset-allocation.dto";
import { UpdateAssetAllocationDto } from "./dto/update-asset-allocation.dto";
import { QueryAssetAllocationDto } from "./dto/query-asset-allocation.dto";
import {
  PaginationHelper,
  PaginatedResponse,
  PaginationQuery,
} from "../../middlewares/pagination/paginationHelper";
import { sanitizeRegexInput } from "../../utils/utils";

@Injectable()
export class AssetAllocationService {
  constructor(
    @InjectModel(AssetAllocation.name)
    private readonly assetAllocationModel: Model<AssetAllocation>,
    private readonly paginationHelper: PaginationHelper
  ) { }

  /**
   * Create a new asset allocation
   * @param createAssetAllocationDto - Asset allocation data
   * @returns Created asset allocation
   */
  async create(
    createAssetAllocationDto: CreateAssetAllocationDto
  ): Promise<AssetAllocation> {
    try {
      // Check if mint address already exists in the same network
      const existingAsset = await this.assetAllocationModel.findOne({
        mintAddress: createAssetAllocationDto.mintAddress,
        network: createAssetAllocationDto.network,
      });

      if (existingAsset) {
        throw new ConflictException(
          `Asset with mint address ${createAssetAllocationDto.mintAddress} already exists in ${createAssetAllocationDto.network} network`
        );
      }

      const assetAllocation = new this.assetAllocationModel(
        createAssetAllocationDto
      );
      return await assetAllocation.save();
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException("Failed to create asset allocation");
    }
  }

  /**
   * Find all asset allocations with pagination
   * @param queryDto - Query parameters for filtering and pagination
   * @returns Paginated list of asset allocations
   * @note All regex inputs are sanitized to prevent ReDoS attacks
   */
  async findAllPagination(
    queryDto: QueryAssetAllocationDto
  ): Promise<PaginatedResponse<AssetAllocation>> {
    const filter: any = {
      isActive: true, // Only return active records by default
    };

    // Apply search filter with priority: symbol first, then name, then mintAddress
    if (queryDto.search) {
      const sanitizedSearch = sanitizeRegexInput(queryDto.search);
      if (sanitizedSearch) {
        filter.$or = [
          { symbol: { $regex: sanitizedSearch, $options: "i" } },
          { name: { $regex: sanitizedSearch, $options: "i" } },
          { mintAddress: { $regex: sanitizedSearch, $options: "i" } },
        ];
      }
    }

    // Apply specific filters
    if (queryDto.mintAddress) {
      const sanitizedMintAddress = sanitizeRegexInput(queryDto.mintAddress);
      if (sanitizedMintAddress) {
        filter.mintAddress = { $regex: sanitizedMintAddress, $options: "i" };
      }
    }
    if (queryDto.name) {
      const sanitizedName = sanitizeRegexInput(queryDto.name);
      if (sanitizedName) {
        filter.name = { $regex: sanitizedName, $options: "i" };
      }
    }
    if (queryDto.symbol) {
      // Use exact match for symbol (case-insensitive)
      filter.symbol = { $regex: `^${queryDto.symbol.trim()}$`, $options: "i" };
    }
    if (queryDto.type) {
      filter.type = queryDto.type;
    }
    if (queryDto.active !== undefined) {
      filter.active = queryDto.active;
    }
    if (queryDto.network) {
      filter.network = queryDto.network;
    }
    if (queryDto.source) {
      filter.source = queryDto.source;
    }

    // Create pagination query with default limit of 20
    const paginationQuery: PaginationQuery = {
      skip: ((queryDto.page || 1) - 1) * (queryDto.limit || 20),
      limit: queryDto.limit || 20,
      sort: {
        [queryDto.sortBy || "name"]:
          queryDto.sortOrder || "asc" === "asc" ? 1 : -1,
      },
    };

    return (await this.paginationHelper.paginate(
      this.assetAllocationModel as unknown as Model<Document>,
      filter,
      paginationQuery
    )) as unknown as PaginatedResponse<AssetAllocation>;
  }
  /**
   * Find all asset allocations with pagination and filters
   * @param queryDto - Query parameters
   * @param paginationQuery - Pagination options
   * @returns Paginated list of asset allocations
   * @note All regex inputs are sanitized to prevent ReDoS attacks
   */
  async findAll(
    queryDto: QueryAssetAllocationDto,
    paginationQuery: PaginationQuery
  ): Promise<PaginatedResponse<AssetAllocation>> {
    const filter: any = {};

    // Apply search filter (searches across name, symbol, and mintAddress)
    if (queryDto.search) {
      const sanitizedSearch = sanitizeRegexInput(queryDto.search);
      if (sanitizedSearch) {
        filter.$or = [
          { name: { $regex: sanitizedSearch, $options: "i" } },
          { symbol: { $regex: sanitizedSearch, $options: "i" } },
          { mintAddress: { $regex: sanitizedSearch, $options: "i" } },
        ];
      }
    }

    // Apply specific filters
    if (queryDto.mintAddress) {
      const sanitizedMintAddress = sanitizeRegexInput(queryDto.mintAddress);
      if (sanitizedMintAddress) {
        filter.mintAddress = { $regex: sanitizedMintAddress, $options: 'i' };
      }
    }
    if (queryDto.name) {
      const sanitizedName = sanitizeRegexInput(queryDto.name);
      if (sanitizedName) {
        filter.name = { $regex: sanitizedName, $options: 'i' };
      }
    }
    if (queryDto.symbol) {
      const sanitizedSymbol = sanitizeRegexInput(queryDto.symbol);
      if (sanitizedSymbol) {
        filter.symbol = { $regex: sanitizedSymbol, $options: 'i' };
      }
    }
    if (queryDto.type) {
      filter.type = queryDto.type;
    }
    if (queryDto.active !== undefined) {
      filter.active = queryDto.active;
    }
    if (queryDto.network) {
      filter.network = queryDto.network;
    }
    if (queryDto.source) {
      filter.source = queryDto.source;
    }

    return await this.paginationHelper.paginate(
      this.assetAllocationModel as unknown as Model<Document>,
      filter,
      paginationQuery
    ) as unknown as PaginatedResponse<AssetAllocation>;
  }


  async findAllAssetAllocations(): Promise<AssetAllocation[]> {
    return await this.assetAllocationModel.find({});
  }



  /**
   * Find asset allocation by ID
   * @param id - Asset allocation ID
   * @returns Asset allocation
   */
  async findOne(id: string): Promise<AssetAllocation> {
    const assetAllocation = await this.assetAllocationModel.findById(id);
    if (!assetAllocation) {
      throw new NotFoundException('Asset allocation not found');
    }
    return assetAllocation;
  }

  /**
   * Find asset allocation by mint address
   * @param mintAddress - Mint address
   * @returns Asset allocation
   */
  async findByMintAddress(mintAddress: string): Promise<AssetAllocation> {
    const assetAllocation = await this.assetAllocationModel.findOne({
      mintAddress,
    });
    if (!assetAllocation) {
      throw new NotFoundException("Asset allocation not found");
    }
    return assetAllocation;
  }

  /**
   * Find asset allocation by mint address and network
   * @param mintAddress - Mint address
   * @param network - Network type
   * @returns Asset allocation
   */
  async findByMintAddressAndNetwork(mintAddress: string, network: string): Promise<AssetAllocation> {
    const assetAllocation = await this.assetAllocationModel.findOne({
      mintAddress,
      network
    });
    if (!assetAllocation) {
      throw new NotFoundException(
        `Asset allocation not found for mint address ${mintAddress} in ${network} network`
      );
      throw new NotFoundException(
        `Asset allocation not found for mint address ${mintAddress} in ${network} network`
      );
    }
    return assetAllocation;
  }

  /**
   * Find asset allocations by network type
   * @param network - Network type
   * @returns List of asset allocations for the specified network
   */
  async findByNetwork(network: string): Promise<AssetAllocation[]> {
    return await this.assetAllocationModel.find({ network, active: true });
  }

  /**
   * Update asset allocation
   * @param id - Asset allocation ID
   * @param updateAssetAllocationDto - Update data
   * @returns Updated asset allocation
   */
  async update(id: string, updateAssetAllocationDto: UpdateAssetAllocationDto): Promise<AssetAllocation> {
    try {
      // Get the current asset to check its network
      const currentAsset = await this.assetAllocationModel.findById(id);
      if (!currentAsset) {
        throw new NotFoundException('Asset allocation not found');
      }

      // Check if mint address is being updated and if it already exists in the same network
      if (updateAssetAllocationDto.mintAddress) {
        const network = updateAssetAllocationDto.network || currentAsset.network;
        const existingAsset = await this.assetAllocationModel.findOne({
          mintAddress: updateAssetAllocationDto.mintAddress,
          network: network,
          _id: { $ne: id }
        });

        if (existingAsset) {
          throw new ConflictException(`Asset with mint address ${updateAssetAllocationDto.mintAddress} already exists in ${network} network`);
        }
      }

      const updatedAsset = await this.assetAllocationModel.findByIdAndUpdate(
        id,
        updateAssetAllocationDto,
        { new: true, runValidators: true }
      );

      if (!updatedAsset) {
        throw new NotFoundException('Asset allocation not found');
      }

      return updatedAsset;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update asset allocation');
    }
  }

  /**
   * Delete asset allocation
   * @param id - Asset allocation ID
   * @returns Success message
   */
  async remove(id: string): Promise<{ message: string }> {
    const deletedAsset = await this.assetAllocationModel.findByIdAndDelete(id);

    if (!deletedAsset) {
      throw new NotFoundException('Asset allocation not found');
    }

    return { message: 'Asset allocation deleted successfully' };
  }

  /**
   * Toggle asset active status
   * @param id - Asset allocation ID
   * @returns Updated asset allocation
   */
  async toggleActive(id: string): Promise<AssetAllocation> {
    const asset = await this.findOne(id);
    return await this.update(id, { active: !asset.active });
  }

  /**
   * Update asset allocation by mint address
   * @param mintAddress - Mint address to find the asset
   * @param updateData - Update data
   * @returns Updated asset allocation
   */
  async updateAssetAllocationByMintAddress(mintAddress: string, updateData: Partial<AssetAllocation>): Promise<AssetAllocation> {
    try {
      const updatedAsset = await this.assetAllocationModel.findOneAndUpdate(
        { mintAddress },
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedAsset) {
        throw new NotFoundException(`Asset with mint address ${mintAddress} not found`);
      }

      return updatedAsset;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update asset allocation by mint address');
    }
  }

  /**
   * Flag an asset as price unavailable
   * @param mintAddress - Mint address of the asset
   * @param reason - Reason why price is unavailable
   * @returns Updated asset allocation
   */
  async flagAssetPriceUnavailable(mintAddress: string, reason: string): Promise<AssetAllocation> {
    try {
      const updatedAsset = await this.assetAllocationModel.findOneAndUpdate(
        { mintAddress },
        {
          priceAvailable: false,
          lastPriceFetchAttempt: new Date(),
          priceUnavailableReason: reason
        },
        { new: true }
      );

      if (!updatedAsset) {
        throw new NotFoundException(`Asset with mint address ${mintAddress} not found`);
      }

      return updatedAsset;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to flag asset as price unavailable');
    }
  }

  /**
   * Reset price availability for an asset
   * @param mintAddress - Mint address of the asset
   * @returns Updated asset allocation
   */
  async resetAssetPriceAvailability(mintAddress: string): Promise<AssetAllocation> {
    try {
      const updatedAsset = await this.assetAllocationModel.findOneAndUpdate(
        { mintAddress },
        {
          priceAvailable: true,
          lastPriceFetchAttempt: new Date(),
          priceUnavailableReason: undefined
        },
        { new: true }
      );

      if (!updatedAsset) {
        throw new NotFoundException(`Asset with mint address ${mintAddress} not found`);
      }

      return updatedAsset;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to reset asset price availability');
    }
  }

  /**
   * Get assets with price availability status
   * @param priceAvailable - Filter by price availability
   * @returns Array of asset allocations
   */
  async getAssetsByPriceAvailability(priceAvailable: boolean): Promise<AssetAllocation[]> {
    try {
      return await this.assetAllocationModel.find({ priceAvailable }).exec();
    } catch (error) {
      throw new BadRequestException('Failed to get assets by price availability');
    }
  }
}
