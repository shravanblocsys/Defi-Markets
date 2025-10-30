import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AssetAllocationService } from "./asset-allocation.service";
import { CreateAssetAllocationDto } from "./dto/create-asset-allocation.dto";
import { UpdateAssetAllocationDto } from "./dto/update-asset-allocation.dto";
import { QueryAssetAllocationDto } from "./dto/query-asset-allocation.dto";
import { AssetAllocation } from "./entities/asset-allocation.entity";
import { PaginationMiddleware } from "../../middlewares/pagination/paginationMiddleware";
import { UsePagination } from "../../middlewares/pagination/pagination.decorator";
import { PaginatedResponse } from "../../middlewares/pagination/paginationHelper";
import { AdminGuard } from "../../middlewares";

@ApiTags("Asset Allocation")
@ApiBearerAuth()
@Controller("api/v1/asset-allocation")
@UseInterceptors(PaginationMiddleware)
export class AssetAllocationController {
  constructor(
    private readonly assetAllocationService: AssetAllocationService
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  @UsePagination()
  async findAll(
    @Query() queryDto: QueryAssetAllocationDto,
    @Req() req: any
  ): Promise<PaginatedResponse<AssetAllocation>> {
    return await this.assetAllocationService.findAll(
      queryDto,
      req.paginationQuery
    );
  }

  @Get("all")
  async findAllPagination(
    @Query() queryDto: QueryAssetAllocationDto
  ): Promise<PaginatedResponse<AssetAllocation>> {
    return await this.assetAllocationService.findAllPagination(queryDto);
  }

  @Get("mint/:mintAddress")
  async findByMintAddress(
    @Param("mintAddress") mintAddress: string
  ): Promise<AssetAllocation> {
    return await this.assetAllocationService.findByMintAddress(mintAddress);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<AssetAllocation> {
    return await this.assetAllocationService.findOne(id);
  }

  @Patch(":id/toggle-active")
  async toggleActive(@Param("id") id: string): Promise<AssetAllocation> {
    return await this.assetAllocationService.toggleActive(id);
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<{ message: string }> {
    return await this.assetAllocationService.remove(id);
  }
}
