import { ApiProperty } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsNumber, 
  IsOptional, 
  IsBoolean,
  Min,
  Max,
  IsUrl
} from 'class-validator';
import { AssetType, NetworkType, SourceType } from '../entities/asset-allocation.entity';

export class CreateAssetAllocationDto {
  @ApiProperty({
    description: 'Mint address of the asset',
    example: 'So11111111111111111111111111111111111111112'
  })
  @IsString()
  @IsNotEmpty()
  mintAddress: string;

  @ApiProperty({
    description: 'Name of the asset',
    example: 'Wrapped SOL'
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Symbol of the asset',
    example: 'WSOL'
  })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({
    description: 'Type of the asset',
    enum: AssetType,
    example: AssetType.CRYPTO
  })
  @IsEnum(AssetType)
  type: AssetType;

  @ApiProperty({
    description: 'Number of decimals for the asset',
    example: 9,
    minimum: 0,
    maximum: 18
  })
  @IsNumber()
  @Min(0)
  @Max(18)
  decimals: number;

  @ApiProperty({
    description: 'URL of the asset logo',
    example: 'https://example.com/logo.png',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  logoUrl?: string;

  @ApiProperty({
    description: 'Whether the asset is active',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Network type for the asset',
    enum: NetworkType,
    example: NetworkType.MAINNET
  })
  @IsEnum(NetworkType)
  network: NetworkType;

  @ApiProperty({
    description: 'Source of the asset data',
    enum: SourceType,
    example: SourceType.JUPITER
  })
  @IsEnum(SourceType)
  source: SourceType;

  @ApiProperty({
    description: 'Whether price data is available for this asset',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  priceAvailable?: boolean;

  @ApiProperty({
    description: 'Last attempt to fetch price data',
    example: '2024-01-01T00:00:00.000Z',
    required: false
  })
  @IsOptional()
  lastPriceFetchAttempt?: Date;

  @ApiProperty({
    description: 'Reason why price is unavailable',
    example: 'No price data returned from Jupiter API',
    required: false
  })
  @IsOptional()
  @IsString()
  priceUnavailableReason?: string;
}
