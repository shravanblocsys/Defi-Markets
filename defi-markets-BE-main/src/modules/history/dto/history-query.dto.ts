import { IsOptional, IsString, IsEnum, IsMongoId, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class HistoryQueryDto {
  @IsOptional()
  @IsEnum([
    'fee_created', 'fee_updated', 'fee_deleted',
    'wallet_created', 'wallet_updated', 'wallet_deleted',
    'vault_created', 'vault_updated', 'vault_deleted', 'vault_paused', 'vault_resumed', 'vault_closed'
  ])
  action?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @IsOptional()
  @IsMongoId()
  performedBy?: string;

  @IsOptional()
  @IsMongoId()
  vaultId?: string;

  @IsOptional()
  @IsMongoId()
  feeId?: string;

  @IsOptional()
  @IsMongoId()
  walletId?: string;

  @IsOptional()
  @IsEnum(['vault', 'wallet', 'fee'])
  relatedEntity?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string; // Format: yyyy-mm-dd

  @IsOptional()
  @IsDateString()
  toDate?: string; // Format: yyyy-mm-dd
}