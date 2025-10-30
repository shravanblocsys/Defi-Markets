import { ApiProperty } from '@nestjs/swagger';
import { 
  IsOptional, 
  IsString, 
  IsEnum, 
  IsBoolean,
  IsNumber,
  Min,
  Max
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AssetType, NetworkType, SourceType } from '../entities/asset-allocation.entity';

export class QueryAssetAllocationDto {
  @ApiProperty({
    description: 'Search across name, symbol, and mint address',
    required: false,
    example: 'USD Coin'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by mint address',
    required: false,
    example: 'So11111111111111111111111111111111111111112'
  })
  @IsOptional()
  @IsString()
  mintAddress?: string;

  @ApiProperty({
    description: 'Filter by asset name (partial match)',
    required: false,
    example: 'SOL'
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Filter by asset symbol (exact match)',
    required: false,
    example: 'WSOL'
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiProperty({
    description: 'Filter by asset type',
    enum: AssetType,
    required: false,
    example: AssetType.CRYPTO
  })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @ApiProperty({
    description: 'Filter by active status',
    required: false,
    example: true
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Filter by network type',
    enum: NetworkType,
    required: false,
    example: NetworkType.MAINNET
  })
  @IsOptional()
  @IsEnum(NetworkType)
  network?: NetworkType;

  @ApiProperty({
    description: 'Filter by source type',
    enum: SourceType,
    required: false,
    example: SourceType.JUPITER
  })
  @IsOptional()
  @IsEnum(SourceType)
  source?: SourceType;

  @ApiProperty({
    description: 'Filter by price availability',
    required: false,
    example: true
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  priceAvailable?: boolean;

  @ApiProperty({
    description: 'Page number for pagination',
    required: false,
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    example: 10,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Field to sort by',
    required: false,
    example: 'createdAt'
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({
    description: 'Sort order',
    required: false,
    example: 'desc',
    enum: ['asc', 'desc']
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
