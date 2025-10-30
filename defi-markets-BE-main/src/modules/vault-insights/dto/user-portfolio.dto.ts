import { ApiProperty } from "@nestjs/swagger";

export class UserVaultDepositDto {
  @ApiProperty({
    description: "Vault ID",
    example: "64f8b8c8e4b0a1b2c3d4e5f6",
  })
  vaultId: string;

  @ApiProperty({
    description: "Vault name",
    example: "Solana Growth Vault",
  })
  vaultName: string;

  @ApiProperty({
    description: "Vault symbol",
    example: "SOL-VAULT",
  })
  vaultSymbol: string;

  @ApiProperty({
    description: "Vault address on the blockchain",
    example: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    nullable: true,
  })
  vaultAddress?: string;

  @ApiProperty({
    description: "Total amount deposited by the user",
    example: 1500.75,
  })
  totalDeposited: number;

  @ApiProperty({
    description: "Total amount redeemed by the user",
    example: 500.25,
  })
  totalRedeemed: number;

  @ApiProperty({
    description: "Current value of user holdings",
    example: 1200.5,
  })
  currentValue: number;

  @ApiProperty({
    description: "Total returns (profit/loss)",
    example: 200.0,
  })
  totalReturns: number;

  @ApiProperty({
    description: "Current APY of the vault",
    example: 15.8,
  })
  apy: number;

  @ApiProperty({
    description: "Vault index for smart contract interaction",
    example: 1,
  })
  vaultIndex: number;

  @ApiProperty({
    description: "24h change in USD",
    example: 25.5,
  })
  dayChange: number;

  @ApiProperty({
    description: "24h change percentage",
    example: 2.1,
  })
  dayChangePercent: number;

  @ApiProperty({
    description: "7-day change in USD",
    example: 150.75,
  })
  weekChange: number;

  @ApiProperty({
    description: "7-day change percentage",
    example: 12.5,
  })
  weekChangePercent: number;
}

export class UserPortfolioSummaryDto {
  @ApiProperty({
    description: "Total portfolio value across all vaults",
    example: 50000.0,
  })
  totalValue: number;

  @ApiProperty({
    description: "Total amount deposited across all vaults",
    example: 45000.0,
  })
  totalDeposited: number;

  @ApiProperty({
    description: "Total amount redeemed across all vaults",
    example: 5000.0,
  })
  totalRedeemed: number;

  @ApiProperty({
    description: "Total returns across all vaults",
    example: 10000.0,
  })
  totalReturns: number;

  @ApiProperty({
    description: "Number of vaults user has deposited into",
    example: 5,
  })
  vaultCount: number;

  @ApiProperty({
    description: "Average APY across all vaults",
    example: 15.8,
  })
  averageAPY: number;

  @ApiProperty({
    description: "24h change in USD",
    example: 250.0,
  })
  dayChange: number;

  @ApiProperty({
    description: "24h change percentage",
    example: 0.5,
  })
  dayChangePercent: number;

  @ApiProperty({
    description: "7-day change in USD",
    example: 1500.0,
  })
  weekChange: number;

  @ApiProperty({
    description: "7-day change percentage",
    example: 3.0,
  })
  weekChangePercent: number;

  @ApiProperty({
    description: "Last updated timestamp",
    example: "2024-01-15T10:30:00Z",
  })
  lastUpdated: string;
}

export class ChartDataPointDto {
  @ApiProperty({
    description: "Date in YYYY-MM-DD format",
    example: "2024-01-15",
  })
  date: string;

  @ApiProperty({
    description: "Portfolio value on this date",
    example: 50000.0,
  })
  value: number;

  @ApiProperty({
    description: "Change from previous day in USD",
    example: 250.0,
  })
  change: number;

  @ApiProperty({
    description: "Change percentage from previous day",
    example: 0.5,
  })
  changePercent: number;
}

export class UserPortfolioResponseDto {
  @ApiProperty({
    description: "Portfolio summary metrics",
    type: UserPortfolioSummaryDto,
  })
  summary: UserPortfolioSummaryDto;

  @ApiProperty({
    description: "Array of vault deposits with metrics",
    type: [UserVaultDepositDto],
  })
  vaults: UserVaultDepositDto[];

  @ApiProperty({
    description: "Historical chart data for portfolio performance",
    type: [ChartDataPointDto],
  })
  chartData: ChartDataPointDto[];
}

export class UserVaultsResponseDto {
  @ApiProperty({
    description: "Array of vaults where user has deposited",
    type: [UserVaultDepositDto],
  })
  vaults: UserVaultDepositDto[];

  @ApiProperty({
    description: "Total number of vaults",
    example: 5,
  })
  total: number;
}
