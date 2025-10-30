import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class VaultFactoryQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  vaultName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  vaultSymbol?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(['pending', 'active', 'paused', 'closed', 'all'])
  status?: 'pending' | 'active' | 'paused' | 'closed' | 'all';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  creatorAddress?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  isFeaturedVault?: boolean;
}
