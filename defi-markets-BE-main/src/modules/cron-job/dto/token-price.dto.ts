import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, IsBoolean } from 'class-validator';

export class TokenPriceDto {
  @ApiProperty({
    description: 'Mint address of the token',
    example: 'So11111111111111111111111111111111111111112'
  })
  @IsString()
  mintAddress: string;

  @ApiProperty({
    description: 'Token symbol',
    example: 'SOL'
  })
  @IsString()
  symbol: string;

  @ApiProperty({
    description: 'Token name',
    example: 'Solana'
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Token price in USD',
    example: 150.25
  })
  @IsNumber()
  price: number;

  @ApiProperty({
    description: '24h price change percentage',
    example: 2.5,
    required: false
  })
  @IsOptional()
  @IsNumber()
  change24h?: number;

  @ApiProperty({
    description: 'Price timestamp',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsDateString()
  timestamp: Date;

  @ApiProperty({
    description: 'Price source',
    example: 'jupiter',
    required: false
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'Whether the price data is active',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Network type (mainnet or devnet)',
    example: 'mainnet',
    required: false
  })
  @IsOptional()
  @IsString()
  network?: string;
}

export class ChartDataDto {
  @ApiProperty({
    description: 'Token symbol',
    example: 'SOL'
  })
  symbol: string;

  @ApiProperty({
    description: 'Array of price data points',
    type: [Object]
  })
  data: Array<{
    timestamp: Date;
    price: number;
    change24h?: number;
  }>;
}

export class VaultChartDataDto {
  @ApiProperty({
    description: 'Vault ID',
    example: '64f1b2c3d4e5f6a7b8c9d0e1'
  })
  vaultId: string;

  @ApiProperty({
    description: 'Vault symbol',
    example: 'BTC+ETH-ETF'
  })
  vaultSymbol: string;

  @ApiProperty({
    description: 'Array of TVL data points over time',
    type: [Object]
  })
  data: Array<{
    timestamp: Date;
    tvl: number;
    price: number;
  }>;
}
