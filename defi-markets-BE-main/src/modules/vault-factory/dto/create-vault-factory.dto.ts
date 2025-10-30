import { IsString, IsArray, IsObject, IsNumber, ValidateNested, IsMongoId, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UnderlyingAsset, FeeConfig } from '../interfaces/vault-creation.interface';
import mongoose from 'mongoose';

class UnderlyingAssetDto implements UnderlyingAsset {
  @IsString()
  @IsMongoId()
  assetAllocationId: string;

  @IsNumber()
  pct_bps: number;

  @IsOptional()
  @IsNumber()
  totalAssetLocked?: number;
}


class FeeConfigDto implements FeeConfig {
  @IsNumber()
  managementFeeBps: number;
}


export class CreateVaultFactoryDto {
  @IsString()
  vaultName: string;

  @IsString()
  vaultSymbol: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnderlyingAssetDto)
  underlyingAssets: UnderlyingAssetDto[];


  @IsObject()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig: FeeConfigDto;


  @IsMongoId()
  creator: mongoose.Schema.Types.ObjectId;

  @IsString()
  creatorAddress: string;

  @IsOptional()
  @IsNumber()
  vaultIndex?: number;

  @IsOptional()
  @IsString()
  etfVaultPda?: string;

  @IsOptional()
  @IsString()
  etfMint?: string;

  @IsOptional()
  @IsString()
  vaultTreasury?: string;

  @IsOptional()
  @IsBoolean()
  isFeaturedVault?: boolean;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
