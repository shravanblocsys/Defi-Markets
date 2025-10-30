import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Logger,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  Put,
  Req
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { Wallet } from './entities/wallet.entity';
import { CacheInterceptor } from '../../utils/redis/cache.interceptor';
import { CacheKey, CacheTTL } from '../../utils/redis/cache.decorator';
import { RedisService } from '../../utils/redis/redis.service';
import { AuthenticatedRequest } from '../../utils/utils';

@Controller('api/v1/wallets')
@UseInterceptors(CacheInterceptor)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly redisService: RedisService
  ) {}

  @Post()
  async create(
    @Body() createWalletDto: CreateWalletDto,
    @Req() request: AuthenticatedRequest
  ): Promise<Wallet> {
    const performedBy = request.raw.user?._id;
    const wallet = await this.walletService.create(createWalletDto, performedBy);
    await this.clearWalletCache();
    return wallet;
  }

  @Get()
  @CacheKey('wallets:all')
  @CacheTTL(300)
  async findAll(): Promise<Wallet[]> {
    this.logger.log('Fetching all wallets');
    return this.walletService.findAll();
  }

  @Get('stats')
  @CacheKey('wallets:stats')
  @CacheTTL(300)
  async getStats() {
    this.logger.log('Fetching wallet statistics');
    return this.walletService.getWalletStats();
  }

  @Get(':id')
  @CacheKey('wallet:id')
  @CacheTTL(300)
  async findOne(@Param('id') id: string): Promise<Wallet> {
    this.logger.log(`Fetching wallet with ID: ${id}`);
    return this.walletService.findOne(id);
  }

  @Get('address/:address')
  @CacheKey('wallets:by-address::address')
  @CacheTTL(300)
  async findByAddress(@Param('address') address: string): Promise<Wallet> {
    this.logger.log(`Fetching wallet with address: ${address}`);
    return this.walletService.findByAddress(address);
  }

  @Get('role/:roleId')
  @CacheKey('wallets:by-role::roleId')
  @CacheTTL(300)
  async findByRole(@Param('roleId') roleId: string): Promise<Wallet[]> {
    this.logger.log(`Fetching wallets with role ID: ${roleId}`);
    return this.walletService.findByRole(roleId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateWalletDto: UpdateWalletDto,
    @Req() request: AuthenticatedRequest
  ): Promise<Wallet> {
    const performedBy = request.raw.user?._id;

    // Log the fields being updated
    const updateFields = Object.keys(updateWalletDto).filter(key => updateWalletDto[key] !== undefined);
    this.logger.log(`Update request for wallet ${id} with fields: ${updateFields.join(', ')}`);

    try {
      const wallet = await this.walletService.update(id, updateWalletDto, performedBy);
      await this.clearWalletCache();
      this.logger.log(`Wallet ${id} updated successfully. Fields updated: ${updateFields.join(', ')}`);
      return wallet;
    } catch (error) {
      this.logger.error(`Failed to update wallet ${id}: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/roles/:roleId')
  async addRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string
  ): Promise<Wallet> {
    this.logger.log(`Adding role ${roleId} to wallet ${id}`);
    const wallet = await this.walletService.addRole(id, roleId);
    await this.clearWalletCache();
    return wallet;
  }

  @Delete(':id/roles/:roleId')
  async removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string
  ): Promise<Wallet> {
    this.logger.log(`Removing role ${roleId} from wallet ${id}`);
    const wallet = await this.walletService.removeRole(id, roleId);
    await this.clearWalletCache();
    return wallet;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ walletId: string }> {
    this.logger.log(`Removing wallet with ID: ${id}`);
    const result = await this.walletService.remove(id, request.raw.user?._id);
    await this.clearWalletCache();
    this.logger.log(`Wallet ${id} removed successfully`);
    return result;
  }

  private async clearWalletCache(): Promise<void> {
    this.logger.log('Clearing wallet cache');
    try {
      // Clear all wallet-related cache entries using targeted deletion
      const keys = await this.redisService.keys('wallets:*');
      if (keys.length > 0) {
        // Delete each key individually since delDirect takes a single key
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        this.logger.log(`Cleared ${keys.length} wallet cache entries`);
      } else {
        this.logger.log('No wallet cache entries found to clear');
      }
    } catch (error) {
      this.logger.error('Error clearing wallet cache:', error);
    }
  }
}
