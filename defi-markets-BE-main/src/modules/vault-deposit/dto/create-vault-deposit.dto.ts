import { IsString, IsNumber, IsObject, IsArray, ValidateNested, Min, Max, IsOptional, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

class FeeConfigDto {
  @IsNumber()
  @Min(0)
  entryFee: number;

  @IsNumber()
  @Min(0)
  exitFee: number;

  @IsNumber()
  @Min(0)
  performanceFee: number;

  @IsNumber()
  @Min(0)
  protocolFee: number;
}

export class CreateVaultDepositDto {
  @IsMongoId()
  vaultFactory: string;

  @IsString()
  vaultAddress: string;

  @IsString()
  admin: string;

  @IsString()
  factory: string;

  @IsString()
  @IsOptional()
  etfMint?: string;

  @IsString()
  @IsOptional()
  vaultBaseTreasury?: string;

  @IsString()
  @IsOptional()
  baseMint?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig: FeeConfigDto;
}