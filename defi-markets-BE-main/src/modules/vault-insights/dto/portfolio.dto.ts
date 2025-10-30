import { ApiProperty } from "@nestjs/swagger";

export class PortfolioAssetDto {
  @ApiProperty({
    description: "Asset name",
    example: "Solana",
  })
  assetName: string;

  @ApiProperty({
    description: "Asset logo URL",
    example: "https://example.com/solana-logo.png",
  })
  logoUrl: string;

  @ApiProperty({
    description: "Percentage allocation in basis points (e.g., 3000 = 30%)",
    example: 3000,
  })
  percentageAllocation: number;

  @ApiProperty({
    description: "Static price of the coin in USD",
    example: 150.25,
  })
  price: number;

  @ApiProperty({
    description: "24-hour price change percentage",
    example: 5.67,
  })
  change24h: number;

  @ApiProperty({
    description: "Token balance in the vault (raw units)",
    example: 4410478,
  })
  tokenBalance: number;

  @ApiProperty({
    description: "Token balance in the vault (formatted with decimals)",
    example: 4.410478,
  })
  tokenBalanceFormatted: number;

  @ApiProperty({
    description: "Token decimals",
    example: 6,
  })
  decimals: number;
}

export class PortfolioDto {
  @ApiProperty({
    description: "Vault symbol",
    example: "SC-ETF",
  })
  vaultSymbol: string;

  @ApiProperty({
    description: "Array of portfolio assets",
    type: [PortfolioAssetDto],
  })
  assets: PortfolioAssetDto[];
}
