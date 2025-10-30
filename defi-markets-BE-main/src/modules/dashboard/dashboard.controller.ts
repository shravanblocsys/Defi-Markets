import { Controller, Get, Logger, UseGuards, UseInterceptors } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { VaultStatisticsDto } from './dto/vault-statistics.dto';
import { EnhancedDashboardStatisticsDto } from './dto/enhanced-dashboard-statistics.dto';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto';
import { AdminGuard } from '../../middlewares';
import { CacheInterceptor, CacheKey, CacheTTL } from '../../utils/redis';

@Controller('api/v1/dashboard')
export class DashboardController {

  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('vault-statistics')
  @UseGuards(AdminGuard)
  async getVaultStatistics(): Promise<VaultStatisticsDto> {
    return this.dashboardService.getVaultStatistics();
  }

  @Get('dashboard-statistics')
  @UseGuards(AdminGuard)
  async getEnhancedDashboardStatistics(): Promise<EnhancedDashboardStatisticsDto> {
    return this.dashboardService.getEnhancedDashboardStatistics();
  }

  @Get('vault-stats')
  @UseInterceptors(CacheInterceptor)
  @CacheKey("dashboard:vault-stats")
  @CacheTTL(300) // Cache for 5 minutes
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    return this.dashboardService.getDashboardMetrics();
  }


}
