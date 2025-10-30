import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Put, 
  Param, 
  Delete, 
  Logger,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  Req,
  Query,
} from '@nestjs/common';
import { FeesManagementService } from './fees-management.service';
import { CreateFeesManagementDto } from './dto/create-fees-management.dto';
import { UpdateFeesManagementDto } from './dto/update-fees-management.dto';
import { FeesManagement } from './entities/fees-management.entity';
import { CacheInterceptor } from '../../utils/redis/cache.interceptor';
import { CacheKey, CacheTTL } from '../../utils/redis/cache.decorator';
import { CacheUtilsService } from '../../utils/cache/cache-utils.service';
import { AuthenticatedRequest } from '../../utils/utils';

@Controller('api/v1/fees-management')
@UseInterceptors(CacheInterceptor)
export class FeesManagementController {
  private readonly logger = new Logger(FeesManagementController.name);

  constructor(
    private readonly feesManagementService: FeesManagementService,
    private readonly cacheUtilsService: CacheUtilsService
  ) {}

  @Post()
  async create(
    @Body() createFeesManagementDto: CreateFeesManagementDto,
    @Req() req: AuthenticatedRequest,
    @Query('vaultId') vaultId?: string
  ): Promise<FeesManagement> {
    
    if (!req.raw.user) {
      throw new Error('Authentication required: User not found in request');
    }
    
    if (!createFeesManagementDto.createdBy) {
      createFeesManagementDto.createdBy = req.raw.user._id;
    }
    
    const fee = await this.feesManagementService.create(createFeesManagementDto, vaultId, req.raw.user);
    await this.cacheUtilsService.clearFeesCache();
    return fee;
  }

  @Get()
  @CacheKey('fees:all')
  @CacheTTL(300)
  async findAll(): Promise<FeesManagement[]> {
    return this.feesManagementService.findAll();
  }

  @Get(':id')
  @CacheKey('fees:id:')
  @CacheTTL(300)
  async findOne(@Param('id') id: string): Promise<FeesManagement> {
    return this.feesManagementService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateFeesManagementDto: UpdateFeesManagementDto,
    @Req() request: AuthenticatedRequest,
    @Query('vaultId') vaultId?: string
  ): Promise<FeesManagement> {
    
    const user = request.user || request.raw?.user;
    
    if (!user) {
      throw new Error('Authentication required: User not found in request');
    }
    
    const performedBy = user.profileId || user._id || updateFeesManagementDto.createdBy;
    if (!performedBy) {
      throw new Error('Profile ID is required for tracking history');
    }
    
    try {
      const fee = await this.feesManagementService.update(id, updateFeesManagementDto, performedBy, vaultId);
      await this.cacheUtilsService.clearFeesCache();
      return fee;
    } catch (error) {
      this.logger.error(`Failed to update fee management ${id}: ${error.message}`);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Query('vaultId') vaultId?: string
  ): Promise<{ feeId: string }> {
    
    const user = request.user || request.raw?.user;
    
    if (!user) {
      throw new Error('Authentication required: User not found in request');
    }
    
    const performedBy = user.profileId || user._id;
    if (!performedBy) {
      throw new Error('Profile ID is required for tracking history');
    }
    
    const result = await this.feesManagementService.remove(id, performedBy, vaultId);
    await this.cacheUtilsService.clearFeesCache();
    return result;
  }

}
