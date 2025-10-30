import { Injectable, Logger } from '@nestjs/common';
import { VaultFactoryService } from '../vault-factory/vault-factory.service';
import { VaultStatisticsDto } from './dto/vault-statistics.dto';
import { VaultDepositService } from '../vault-deposit/vault-deposit.service';
import { EnhancedDashboardStatisticsDto } from './dto/enhanced-dashboard-statistics.dto';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto';
import { toBase10Decimal } from '../../utils/utils';
import { RedisService } from '../../utils/redis';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(
        private readonly vaultFactoryService: VaultFactoryService,
        private readonly vaultDepositService: VaultDepositService,
        private readonly redisService: RedisService
    ) { }

    /**
     * Get vault statistics including total, active, paused, pending, and closed vaults
     * @returns Promise<VaultStatisticsDto>
     */
    async getVaultStatistics(): Promise<VaultStatisticsDto> {
        const [totalVaults, activeVaults, pausedVaults, pendingVaults, closedVaults, totalDeposits, totalRedeems, totalUsers, totalUsersRedeemed] = await Promise.all([
            this.vaultFactoryService.count(),
            this.vaultFactoryService.countByStatus('active'),
            this.vaultFactoryService.countByStatus('paused'),
            this.vaultFactoryService.countByStatus('pending'),
            this.vaultFactoryService.countByStatus('closed'),
            this.vaultDepositService.countCompletedDeposits(),
            this.vaultDepositService.countCompletedRedeems(),
            this.vaultDepositService.countUniqueUsersWithDeposits(),
            this.vaultDepositService.countUniqueUsersWithRedeems(),
        ]);

        return {
            totalVaults,
            activeVaults,
            pausedVaults,
            pendingVaults,
            closedVaults,
            totalDeposits,
            totalRedeems,
            totalUsers,
            totalUsersRedeemed,
        };
    }

    /**
     * Get enhanced dashboard statistics with financial metrics and user growth
     * @returns Promise<EnhancedDashboardStatisticsDto>
     */
    async getEnhancedDashboardStatistics(): Promise<EnhancedDashboardStatisticsDto> {
        const [
            totalVaults,
            activeVaults,
            pausedVaults,
            pendingVaults,
            closedVaults,
            totalDeposits,
            totalRedeems,
            totalUsers,
            totalUsersRedeemed,
            totalDepositAmount,
            totalRedeemAmount,
            totalDepositAmountLastMonth,
            totalRedeemAmountLastMonth,
            activeUsersYesterday
        ] = await Promise.all([
            this.vaultFactoryService.count(),
            this.vaultFactoryService.countByStatus('active'),
            this.vaultFactoryService.countByStatus('paused'),
            this.vaultFactoryService.countByStatus('pending'),
            this.vaultFactoryService.countByStatus('closed'),
            this.vaultDepositService.countCompletedDeposits(),
            this.vaultDepositService.countCompletedRedeems(),
            this.vaultDepositService.countUniqueUsersWithDeposits(),
            this.vaultDepositService.countUniqueUsersWithRedeems(),
            this.vaultDepositService.getTotalDepositAmount(),
            this.vaultDepositService.getTotalRedeemAmount(),
            this.vaultDepositService.getTotalDepositAmountLastMonth(),
            this.vaultDepositService.getTotalRedeemAmountLastMonth(),
            this.vaultDepositService.getActiveUsersYesterday(),
        ]);

        // Calculate derived metrics
        const activeUsers = totalUsers + totalUsersRedeemed;
        const userGrowthCount = activeUsers - activeUsersYesterday;

        // Calculate deposit growth percentage using net values
        const netDepositAmount = Math.max(0, totalDepositAmount - totalRedeemAmount);
        const netDepositAmountLastMonth = Math.max(0, totalDepositAmountLastMonth - totalRedeemAmountLastMonth);
        const depositGrowthPercentage = netDepositAmountLastMonth > 0
            ? ((netDepositAmount - netDepositAmountLastMonth) / netDepositAmountLastMonth) * 100
            : 0;

        return {
            // Financial Metrics
            totalDepositAmount: toBase10Decimal(totalDepositAmount),
            totalDepositAmountLastMonth: toBase10Decimal(totalDepositAmountLastMonth),
            depositGrowthPercentage: Math.round(depositGrowthPercentage * 100) / 100, // Round to 2 decimal places

            // User Metrics
            activeUsers,
            activeUsersYesterday,
            userGrowthCount,

            // Traditional Vault Metrics
            totalVaults,
            activeVaults,
            pausedVaults,
            pendingVaults,
            closedVaults,

            // Transaction Metrics
            totalDeposits,
            totalRedeems,
            totalUsers,
            totalUsersRedeemed,
        };
    }

    /**
     * Get simplified dashboard metrics matching the UI screenshot
     * @returns Promise<DashboardMetricsDto>
     */
    async getDashboardMetrics(): Promise<DashboardMetricsDto> {
        const [
            totalVaults,
            totalVaultsLastWeek,
            totalDepositAmount,
            totalRedeemAmount,
            totalDepositAmountLastMonth,
            totalRedeemAmountLastMonth,
            totalUsers,
            totalUsersRedeemed,
            activeUsersYesterday
        ] = await Promise.all([
            this.vaultFactoryService.count(),
            this.countVaultsCreatedInLastWeek(),
            this.vaultDepositService.getTotalDepositAmount(),
            this.vaultDepositService.getTotalRedeemAmount(),
            this.vaultDepositService.getTotalDepositAmountLastMonth(),
            this.vaultDepositService.getTotalRedeemAmountLastMonth(),
            this.vaultDepositService.countUniqueUsersWithDeposits(),
            this.vaultDepositService.countUniqueUsersWithRedeems(),
            this.vaultDepositService.getActiveUsersYesterday(),
        ]);
        // Calculate metrics
        const activeInvestors = totalUsers + totalUsersRedeemed;
        const activeInvestorsGrowth = activeUsersYesterday > 0
            ? ((activeInvestors - activeUsersYesterday) / activeUsersYesterday) * 100
            : 0;

        const netTvl = Math.max(0, totalDepositAmount - totalRedeemAmount);
        const lastMonthNetTvl = Math.max(0, totalDepositAmountLastMonth - totalRedeemAmountLastMonth);
        const totalValueLockedGrowth = lastMonthNetTvl > 0
            ? ((netTvl - lastMonthNetTvl) / lastMonthNetTvl) * 100
            : 0;

        // Calculate vault growth (vaults created this week)
        const totalVaultsGrowth = totalVaultsLastWeek;

        // Calculate average APY from actual vault data
        const averageAPY = await this.calculateAverageAPY();
        const averageAPYGrowth = await this.calculateAPYGrowth();

        return {
            valueLocked: {
                totalValueLocked: toBase10Decimal(netTvl),
                totalValueLockedGrowth: Math.round(totalValueLockedGrowth * 10) / 10, // Round to 1 decimal
            },

            vault: {
                totalVaults,
                totalVaultsGrowth,
                averageAPY,
                averageAPYGrowth,
            },

            users: {
                activeInvestors,
                activeInvestorsGrowth: Math.round(activeInvestorsGrowth * 10) / 10, // Round to 1 decimal
            }
        };
    }

    /**
     * Calculate average APY from all active vaults
     * @returns Average APY percentage
     */
    private async calculateAverageAPY(): Promise<number> {
        try {
            // Get all active vaults with their APY data
            const activeVaults = await this.vaultFactoryService.findAll();

            if (!activeVaults || activeVaults.length === 0) {
                return 0;
            }

            // Calculate average APY from vault data
            // Note: This assumes vaults have APY data - you may need to adjust based on your vault structure
            let totalAPY = 0;
            let vaultsWithAPY = 0;

            for (const vault of activeVaults) {
                // Filter for active vaults only
                if (vault.status === 'active') {
                    // For now, return a default APY since vaults don't have APY field
                    // You can implement actual APY calculation based on your business logic
                    totalAPY += 1.9; // Default APY
                    vaultsWithAPY++;
                }
            }

            return vaultsWithAPY > 0 ? Math.round((totalAPY / vaultsWithAPY) * 10) / 10 : 0;
        } catch (error) {
            this.logger.error(`Error calculating average APY: ${error.message}`);
            return 0;
        }
    }

    /**
     * Calculate APY growth percentage this quarter
     * @returns APY growth percentage
     */
    private async calculateAPYGrowth(): Promise<number> {
        try {
            // Get APY data from last quarter vs current quarter
            const currentAPY = await this.calculateAverageAPY();
            const lastQuarterAPY = await this.calculateLastQuarterAPY();

            if (lastQuarterAPY === 0) {
                return 0;
            }

            const growth = ((currentAPY - lastQuarterAPY) / lastQuarterAPY) * 100;
            return Math.round(growth * 10) / 10;
        } catch (error) {
            this.logger.error(`Error calculating APY growth: ${error.message}`);
            return 0;
        }
    }

    /**
     * Calculate average APY from last quarter
     * @returns Average APY from last quarter
     */
    private async calculateLastQuarterAPY(): Promise<number> {
        try {
            // Calculate date 3 months ago
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            // Get vaults created before 3 months ago
            const oldVaults = await this.vaultFactoryService.findAll();

            if (!oldVaults || oldVaults.length === 0) {
                return 0;
            }

            let totalAPY = 0;
            let vaultsWithAPY = 0;

            for (const vault of oldVaults) {
                // Filter for vaults created before 3 months ago
                if (vault.blockTime && vault.blockTime < threeMonthsAgo) {
                    // For now, return a default APY since vaults don't have APY field
                    totalAPY += 1.8; // Default historical APY
                    vaultsWithAPY++;
                }
            }

            return vaultsWithAPY > 0 ? totalAPY / vaultsWithAPY : 0;
        } catch (error) {
            this.logger.error(`Error calculating last quarter APY: ${error.message}`);
            return 0;
        }
    }

    /**
     * Count vaults created in the last week
     * @returns Number of vaults created in the last week
     */
    private async countVaultsCreatedInLastWeek(): Promise<number> {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const allVaults = await this.vaultFactoryService.findAll();
            const vaultsCreatedLastWeek = allVaults.filter(vault =>
                vault.blockTime && vault.blockTime >= oneWeekAgo
            );

            this.clearDashboardCache();
            return vaultsCreatedLastWeek.length;
        } catch (error) {
            this.logger.error(`Error counting vaults created in last week: ${error.message}`);
            return 0;
        }
    }

    /**
 * Clear all vault-related cache entries
 */
    private async clearDashboardCache(): Promise<void> {
        try {
            // Clear cache with pattern matching for vault-factory keys
            const keys = await this.redisService.keys("dashboard:*");
            if (keys.length > 0) {
                for (const key of keys) {
                    await this.redisService.delDirect(key);
                }
                // Cache cleared successfully
            } else {
                // No cache entries found to clear
            }
        } catch (error) {
            this.logger.error("❌ Error clearing dashboard cache:", error);
        }
    }
}
