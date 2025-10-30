export class DashboardMetricsDto {
  valueLocked: {
    totalValueLocked: number; // in USD
    totalValueLockedGrowth: number; // percentage growth this month
  };
  
  vault: {
    totalVaults: number;
    totalVaultsGrowth: number; // count growth this week
    averageAPY: number; // percentage
    averageAPYGrowth: number; // percentage growth this quarter
  };
  
  users: {
    activeInvestors: number;
    activeInvestorsGrowth: number; // percentage growth this month
  };
}
