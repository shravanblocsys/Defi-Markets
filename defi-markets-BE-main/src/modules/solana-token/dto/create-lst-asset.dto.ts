import { ApiProperty } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsNumber, 
  IsOptional, 
  IsBoolean,
  IsUrl,
  Min,
  Max,
  IsArray,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { NetworkType } from '../../asset-allocation/entities/asset-allocation.entity';

export class CreateLstAssetDto {
  @ApiProperty({
    description: 'Mint address of the LST token',
    example: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
  })
  @IsString()
  @IsNotEmpty()
  mintAddress: string;

  @ApiProperty({
    description: 'Name of the LST token',
    example: 'Jito Staked SOL'
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Symbol of the LST token',
    example: 'JitoSOL'
  })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({
    description: 'Number of decimals for the LST token',
    example: 9,
    minimum: 0,
    maximum: 18
  })
  @IsNumber()
  @Min(0)
  @Max(18)
  decimals: number;

  @ApiProperty({
    description: 'URL of the LST token logo/icon',
    example: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  logoUrl?: string;

  @ApiProperty({
    description: 'Whether the LST token is active',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Twitter URL of the LST project',
    example: 'https://twitter.com/jito_sol',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  twitter?: string;

  @ApiProperty({
    description: 'Website URL of the LST project',
    example: 'https://jito.network',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  website?: string;

  @ApiProperty({
    description: 'Developer address of the LST project',
    example: 'EDGARWktv3nDxRYjufjdbZmryqGXceaFPoPpbUzdpqED',
    required: false
  })
  @IsOptional()
  @IsString()
  dev?: string;

  @ApiProperty({
    description: 'Token program address',
    example: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    required: false
  })
  @IsOptional()
  @IsString()
  tokenProgram?: string;

  @ApiProperty({
    description: 'Mint authority address',
    example: '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS',
    required: false
  })
  @IsOptional()
  @IsString()
  mintAuthority?: string;

  @ApiProperty({
    description: 'Whether the LST token is verified',
    example: true,
    required: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiProperty({
    description: 'Tags associated with the LST token',
    example: ['lst', 'community', 'verified'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Network type for the LST token',
    enum: NetworkType,
    example: NetworkType.MAINNET,
    required: false,
    default: NetworkType.MAINNET
  })
  @IsOptional()
  @IsEnum(NetworkType)
  network?: NetworkType;
}

export class CreateLstAssetBatchDto {
  @ApiProperty({
    description: 'Array of LST tokens to create',
    type: [CreateLstAssetDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLstAssetDto)
  lstTokens: CreateLstAssetDto[];
}
