export class EnhancedDashboardStatisticsDto {
  // Financial Metrics
  totalDepositAmount: number; // Total deposit amount in USD
  totalDepositAmountLastMonth: number; // Last month's total deposit amount
  depositGrowthPercentage: number; // Month-over-month growth percentage
  
  // User Metrics
  activeUsers: number; // Sum of totalUsers + totalUsersRedeemed
  activeUsersYesterday: number; // Yesterday's active users count
  userGrowthCount: number; // Day-over-day growth count
  
  // Traditional Vault Metrics
  totalVaults: number;
  activeVaults: number;
  pausedVaults: number;
  pendingVaults: number;
  closedVaults: number;
  
  // Transaction Metrics
  totalDeposits: number;
  totalRedeems: number;
  totalUsers: number;
  totalUsersRedeemed: number;
}
