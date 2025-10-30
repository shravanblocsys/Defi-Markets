import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, ValidateNested, IsMongoId, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UnderlyingAssetDto {
  @ApiProperty({
    description: 'Asset allocation ID (MongoDB ObjectId)',
    example: '64f1b2c3d4e5f6a7b8c9d0e1'
  })
  @IsMongoId()
  @IsNotEmpty()
  assetAllocation: string;

  @ApiProperty({
    description: 'Percentage allocation in basis points (0-10000)',
    example: 5000,
    minimum: 0,
    maximum: 10000
  })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(10000)
  pct_bps: number;

  @ApiProperty({
    description: 'Total amount of asset locked (optional)',
    example: 1000.50,
    required: false
  })
  @IsOptional()
  @IsNumber()
  totalAssetLocked?: number;
}

export class UpdateUnderlyingAssetsDto {
  @ApiProperty({
    description: 'Array of underlying assets with their allocations',
    type: [UnderlyingAssetDto],
    example: [
      {
        assetAllocation: '64f1b2c3d4e5f6a7b8c9d0e1',
        pct_bps: 5000
      },
      {
        assetAllocation: '64f1b2c3d4e5f6a7b8c9d0e2',
        pct_bps: 5000
      }
    ]
  })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UnderlyingAssetDto)
  underlyingAssets: UnderlyingAssetDto[];
}
