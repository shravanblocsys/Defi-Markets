import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
  Req,
  Query,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { VaultFactoryService } from "./vault-factory.service";
import { CreateVaultFactoryDto } from "./dto/create-vault-factory.dto";
import { UpdateVaultFactoryDto } from "./dto/update-vault-factory.dto";
import { VaultCreationEventDto } from "./dto/vault-creation-event.dto";
import { VaultFactoryQueryDto } from "./dto/vault-factory-query.dto";
import { UpdateManagementFeeDto } from "./dto/update-management-fee.dto";
import { UpdateUnderlyingAssetsDto } from "./dto/update-underlying-assets.dto";
import { VaultFactory } from "./entities/vault-factory.entity";
import { UsePagination } from "../../middlewares/pagination/pagination.decorator";
import { CacheInterceptor } from "../../utils/redis/cache.interceptor";
import { CacheKey, CacheTTL } from "../../utils/redis/cache.decorator";
import { RedisService } from "../../utils/redis/redis.service";
import { AuthenticatedRequest } from "../../utils/utils";
import { AdminGuard } from "../../middlewares";

// annotate the class VaultFactoryController with @Controller which is the decorator given by nestjs
@Controller("api/v1/vaults")
export class VaultFactoryController {
  private readonly logger = new Logger(VaultFactoryController.name);

  constructor(
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly redisService: RedisService
  ) {}

  @Post() // is the decorator given by nestjs to create a new vault
  async create(
    @Body() createVaultFactoryDto: CreateVaultFactoryDto
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.create(createVaultFactoryDto);
    // Clear cache after creating new vault
    await this.clearVaultCache();
    return result;
  }

  @Post("vault-check")
  async checkVaultNameExists(@Body() body: { vaultName: string }) {
    const exists = await this.vaultFactoryService.checkVaultNameExists(
      body.vaultName
    );
    return exists;
  }

  @Get("user-vaults/list")
  @UsePagination()
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:userMyVaults:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getUserVaults(
    @Req() req: AuthenticatedRequest,
    @Query() query: VaultFactoryQueryDto
  ): Promise<any> {
    const paginationQuery =
      this.vaultFactoryService["paginationHelper"].createPaginationQuery(req);
    return this.vaultFactoryService.getUserVaults(
      req.raw.user?._id,
      paginationQuery,
      query
    );
  }

  @Get()
  @UsePagination()
  @UseGuards(AdminGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findAllPaginated")
  @CacheTTL(300) // Cache for 5 minutes
  async findAllPaginated(
    @Req() req: any,
    @Query() query: VaultFactoryQueryDto
  ): Promise<any> {
    const paginationQuery = this.vaultFactoryService.createPaginationQuery(req);
    return this.vaultFactoryService.findAllPaginated(paginationQuery, query);
  }

  @Get(":id")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findOne")
  @CacheTTL(600) // Cache for 10 minutes
  async findOne(@Param("id") id: string): Promise<VaultFactory> {
    return this.vaultFactoryService.findOne(id);
  }

  @Get("address/:address")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findByAddress")
  @CacheTTL(600) // Cache for 10 minutes
  async findByAddress(
    @Param("address") address: string
  ): Promise<VaultFactory> {
    return this.vaultFactoryService.findByAddress(address);
  }

  @Get("transaction/:signature")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findByTransactionSignature")
  @CacheTTL(600) // Cache for 10 minutes
  async findByTransactionSignature(
    @Param("signature") signature: string
  ): Promise<VaultFactory> {
    return this.vaultFactoryService.findByTransactionSignature(signature);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() updateVaultFactoryDto: UpdateVaultFactoryDto
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.update(
      id,
      updateVaultFactoryDto
    );
    // Clear cache after updating vault
    await this.clearVaultCache();
    return result;
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<void> {
    await this.vaultFactoryService.remove(id);
    // Clear cache after removing vault
    await this.clearVaultCache();
  }

  @Post(":id/address")
  async setVaultAddress(
    @Param("id") id: string,
    @Body() body: { vaultAddress: string }
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.setVaultAddress(
      id,
      body.vaultAddress
    );
    // Clear cache after setting vault address
    await this.clearVaultCache();
    return result;
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: "pending" | "active" | "paused" | "closed" }
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.updateStatus(id, body.status);
    // Clear cache invalidation after updating status
    await this.clearVaultCache();
    return result;
  }

  @Patch(":id/featured")
  async updateFeaturedStatus(
    @Param("id") id: string,
    @Body() body: { isFeaturedVault: boolean }
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.updateFeaturedStatus(
      id,
      body.isFeaturedVault
    );
    // Clear cache after updating featured status
    await this.clearVaultCache();
    return result;
  }

  @Patch(':id/management-fee')
  @ApiOperation({ summary: 'Update management fee for a vault' })
  @ApiParam({ name: 'id', description: 'Vault ID', example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @ApiBody({ type: UpdateManagementFeeDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Management fee updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Management fee updated successfully' },
        vault: { $ref: '#/components/schemas/VaultFactory' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Vault not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Admin access required' })
  async updateManagementFee(
    @Param('id') vaultId: string,
    @Body() updateManagementFeeDto: UpdateManagementFeeDto
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.updateManagementFee(
      vaultId,
      updateManagementFeeDto.managementFeeBps
    );
    
    // Clear cache after updating management fee
    await this.clearVaultCache();
    
    return result
  }

  @Patch(':id/underlying-assets')
  @ApiOperation({ summary: 'Update underlying assets for a vault' })
  @ApiParam({ name: 'id', description: 'Vault ID', example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @ApiBody({ type: UpdateUnderlyingAssetsDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Underlying assets updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Underlying assets updated successfully' },
        vault: { $ref: '#/components/schemas/VaultFactory' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Vault not found or invalid asset allocation' })
  async updateUnderlyingAssets(
    @Param('id') vaultId: string,
    @Body() updateUnderlyingAssetsDto: UpdateUnderlyingAssetsDto
  ): Promise<VaultFactory> {
    const result = await this.vaultFactoryService.updateUnderlyingAssets(
      vaultId,
      updateUnderlyingAssetsDto.underlyingAssets
    );
    
    // Clear cache after updating underlying assets
    await this.clearVaultCache();
    
    return result
  }

  /**
   * Clear all vault-related cache entries
   */
  private async clearVaultCache(): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-factory keys
      const keys = await this.redisService.keys("vaults:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
      } else {
        // No cache entries found to clear
      }
    } catch (error) {
      this.logger.error("❌ Error clearing vault cache:", error);
    }
  }
}
