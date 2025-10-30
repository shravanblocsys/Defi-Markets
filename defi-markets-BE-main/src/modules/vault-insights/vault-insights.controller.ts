import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { VaultInsightsService } from "./vault-insights.service";
import { VaultInsightsDto } from "./dto/vault-insights.dto";
import { PortfolioDto } from "./dto/portfolio.dto";
import { GavNavDto } from "./dto/gav-nav.dto";
import { UserHoldingsResponseDto } from "./dto/user-holdings.dto";
import { UserVaultMetricsDto } from "./dto/user-vault-metrics.dto";
import { UserPortfolioResponseDto, UserVaultsResponseDto } from "./dto/user-portfolio.dto";
import { AuthenticatedRequest } from "../../utils/utils";
import { UsePagination } from "../../middlewares/pagination/pagination.decorator";
import {
  PaginationHelper,
} from "../../middlewares/pagination/paginationHelper";
import { CacheKey, CacheTTL } from "../../utils/redis";
import { CacheInterceptor } from "../../utils/redis";
import { VaultFactoryQueryDto } from "../vault-factory/dto/vault-factory-query.dto";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { VaultFactory } from "../vault-factory/entities/vault-factory.entity";
import { Document } from "mongoose";

type VaultFactoryDocument = VaultFactory & Document;

@ApiTags("Vault Insights")
@Controller("api/v1/vault-insights")
export class VaultInsightsController {
  constructor(
    private readonly vaultInsightsService: VaultInsightsService,
    private readonly paginationHelper: PaginationHelper,
    private readonly vaultFactoryService: VaultFactoryService
  ) {}

  @Get("featured/list")
  @UsePagination()
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findAllFeaturedVaults")
  @CacheTTL(300) // Cache for 5 minutes
  async findAllFeaturedVaults(
    @Req() req: any,
    @Query() query: VaultFactoryQueryDto
  ): Promise<any> {
    const paginationQuery =
      this.vaultFactoryService["paginationHelper"].createPaginationQuery(req);
    return this.vaultInsightsService.findAllFeaturedVaults(
      paginationQuery,
      query
    );
  }

  @Get("user")
  @UsePagination()
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:findAllPaginatedUser")
  @CacheTTL(300) // Cache for 5 minutes
  async findAllPaginatedUser(
    @Req() req: any,
    @Query() query: VaultFactoryQueryDto
  ): Promise<any> {
    const paginationQuery =
      this.vaultFactoryService["paginationHelper"].createPaginationQuery(req);
    return this.vaultInsightsService.findAllPaginatedUser(
      paginationQuery,
      query
    );
  }

  @Get("user-deposits/:vaultId")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:user-deposits:wallet")
  @CacheTTL(300) // Cache for 5 minutes
  async getUserVaultMetrics(
    @Req() req: AuthenticatedRequest,
    @Param("vaultId") vaultId: string
  ): Promise<UserVaultMetricsDto> {
    return this.vaultInsightsService.getUserVaultMetrics(
      vaultId,
      req.raw.user.walletAddress
    );
  }

  @Get("user-portfolio/data")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:user-portfolio:userAddress")
  @CacheTTL(60) // Cache for 1 minute
  @ApiOperation({ summary: "Get user's complete portfolio with all vault deposits and metrics" })
  @ApiResponse({ 
    status: 200, 
    description: "User portfolio data retrieved successfully",
    type: UserPortfolioResponseDto
  })
  async getUserPortfolio(
    @Req() req: AuthenticatedRequest
  ): Promise<UserPortfolioResponseDto> {
    const portfolio = await this.vaultInsightsService.getUserPortfolio(req.raw.user.walletAddress);
    
    // Add warning if any approximated data is present
    const hasApproximatedData = portfolio.vaults.some(vault => 
      vault.dayChangePercent !== undefined && vault.weekChangePercent !== undefined
    );
    
    if (hasApproximatedData) {
      portfolio.warnings = [
        "Some 7-day performance data is approximated and may not reflect actual market performance. Real-time historical data is preferred for accurate calculations."
      ];
    }
    
    return portfolio;
  }

  @Get("user-vaults/data")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:user-vaults")
  @CacheTTL(300) // Cache for 5 minutes
  @ApiOperation({ summary: "Get all vaults where user has deposited" })
  @ApiResponse({ 
    status: 200, 
    description: "User vaults retrieved successfully",
    type: UserVaultsResponseDto
  })
  async getUserVaults(
    @Req() req: AuthenticatedRequest
  ): Promise<UserVaultsResponseDto> {
    return this.vaultInsightsService.getUserVaults(req.raw.user.walletAddress);
  }

  // Parameterized routes come after specific routes
  @Get("portfolio/:id")
  async getPortfolio(@Param("id") id: string): Promise<PortfolioDto> {
    return this.vaultInsightsService.getPortfolio(id);
  }

  @Get("gav-nav/:id")
  async getGavNav(
    @Param("id") id: string,
    @Req() req?: AuthenticatedRequest
  ): Promise<GavNavDto> {
    return this.vaultInsightsService.getGavNav(id, req?.raw?.user?._id);
  }

  @Get("fees/:id")
  async getFeesDetails(@Param("id") id: string): Promise<any> {
    return this.vaultInsightsService.getFeesManagement(id);
  }

  @Get("user-holdings/:id")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vaults:depositorsList")
  @CacheTTL(300) // Cache for 5 minutes
  async getUserHoldings(
    @Param("id") id: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number
  ): Promise<UserHoldingsResponseDto> {
    return this.vaultInsightsService.getUserHoldings(id, limit, offset);
  }

  @Get("history/:id")
  @UsePagination()
  async getVaultHistory(
    @Req() req: any,
    @Param("id") id: string
  ): Promise<any> {
    const paginationQuery = this.paginationHelper.createPaginationQuery(req);
    return this.vaultInsightsService.getVaultHistory(id, paginationQuery);
  }

  // This catch-all route MUST be last to avoid conflicts with specific routes
  @Get(":id")
  async getVaultInsights(@Param("id") id: string): Promise<VaultInsightsDto> {
    return this.vaultInsightsService.getVaultInsights(id);
  }
}
