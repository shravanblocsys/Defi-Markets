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
  UseInterceptors,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { VaultDepositService } from "./vault-deposit.service";
import {
  VaultDeposit,
  DepositTransaction,
  RedeemTransaction,
  EmergencyWithdrawTransaction,
  VaultClosureTransaction,
} from "./entities/vault-deposit.entity";
import { CheckMinDepositDto, CheckMinRedeemDto } from "./dto/validation.dto";
import { CacheInterceptor } from "../../utils/redis/cache.interceptor";
import { CacheKey, CacheTTL } from "../../utils/redis/cache.decorator";
import { RedisService } from "../../utils/redis/redis.service";
import { AuthenticatedRequest } from "../../utils/utils";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";

@Controller("api/v1/vault-deposit")
export class VaultDepositController {
  private readonly logger = new Logger(VaultDepositController.name);

  constructor(
    private readonly vaultDepositService: VaultDepositService,
    private readonly redisService: RedisService
  ) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:findAll")
  @CacheTTL(300) // Cache for 5 minutes
  async findAll(): Promise<VaultDeposit[]> {
    return this.vaultDepositService.findAll();
  }

  @Get(":id")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:findOne")
  @CacheTTL(600) // Cache for 10 minutes
  async findOne(@Param("id") id: string): Promise<VaultDeposit> {
    return this.vaultDepositService.findOne(id);
  }

  @Delete(":id")
  async remove(@Param("id") id: string): Promise<void> {
    await this.vaultDepositService.remove(id);
    // Clear cache after removing vault
    await this.clearVaultDepositCache();
  }

  @Get("transactions/deposits")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:getDepositTransactions:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getDepositTransactions(
    @Req() req: AuthenticatedRequest,
    @Query("vaultAddress") vaultAddress?: string
  ): Promise<DepositTransaction[]> {
    const userAddress = req.raw.user?.walletAddress;
    if (!userAddress) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.vaultDepositService.getDepositTransactions(
      vaultAddress,
      userAddress
    );
  }

  @Get("holdings")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:getHoldings:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getHoldings(
    @Req() req: AuthenticatedRequest,
    @Query("vaultAddress") vaultAddress?: string,
    @Query("userAddress") userAddress?: string
  ): Promise<DepositTransaction[]> {
    return this.vaultDepositService.getHoldings(
      vaultAddress,
      userAddress,
      req.raw.user?._id
    );
  }

  @Get("transactions/redeems")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:getRedeemTransactions:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getRedeemTransactions(
    @Query("vaultAddress") vaultAddress?: string,
    @Query("userAddress") userAddress?: string
  ): Promise<RedeemTransaction[]> {
    return this.vaultDepositService.getRedeemTransactions(
      vaultAddress,
      userAddress
    );
  }

  @Get("transactions/emergency-withdraws")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:getEmergencyWithdrawTransactions:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getEmergencyWithdrawTransactions(
    @Query("vaultAddress") vaultAddress?: string,
    @Query("guardianAddress") guardianAddress?: string
  ): Promise<EmergencyWithdrawTransaction[]> {
    return this.vaultDepositService.getEmergencyWithdrawTransactions(
      vaultAddress,
      guardianAddress
    );
  }

  @Get("transactions/vault-closures")
  @UseInterceptors(CacheInterceptor)
  @CacheKey("vault-deposit:getVaultClosureTransactions:userAddress")
  @CacheTTL(300) // Cache for 5 minutes
  async getVaultClosureTransactions(
    @Query("vaultAddress") vaultAddress?: string,
    @Query("adminAddress") adminAddress?: string
  ): Promise<VaultClosureTransaction[]> {
    return this.vaultDepositService.getVaultClosureTransactions(
      vaultAddress,
      adminAddress
    );
  }

  @Post("checkMinDeposit")
  @HttpCode(HttpStatus.OK)
  async checkMinDeposit(
    @Body() checkMinDepositDto: CheckMinDepositDto
  ): Promise<{ isValid: boolean; message: string }> {
    this.logger.log(
      `Checking minimum deposit: ${checkMinDepositDto.minDeposit}`
    );
    return this.vaultDepositService.checkMinDeposit(
      checkMinDepositDto.minDeposit
    );
  }

  @Post("checkMinRedeem")
  @HttpCode(HttpStatus.OK)
  async checkMinRedeem(
    @Body() checkMinRedeemDto: CheckMinRedeemDto
  ): Promise<{ isValid: boolean; message: string }> {
    this.logger.log(`Checking minimum redeem: ${checkMinRedeemDto.minRedeem}`);
    return this.vaultDepositService.checkMinRedeem(checkMinRedeemDto.minRedeem);
  }

  /**
   * Clear all vault-deposit-related cache entries
   */
  private async clearVaultDepositCache(): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-deposit keys
      const keys = await this.redisService.keys("vault-deposit:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
      } else {
        // No cache entries found to clear
      }
    } catch (error) {
      this.logger.error("❌ Error clearing vault-deposit cache:", error);
    }
  }
}
