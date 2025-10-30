import { IsString, IsArray, IsObject, IsNumber, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { VaultCreationEvent } from '../interfaces/vault-creation.interface';

class UnderlyingAssetEventDto {
  @IsString()
  mint: string;

  @IsNumber()
  pct_bps: number;

  @IsString()
  name: string;

  @IsString()
  symbol: string;

  @IsOptional()
  @IsString()
  assetAllocationId?: string;
}

class AccountsDto {
  @IsString()
  factory: string;

  @IsString()
  vault: string;

  @IsString()
  creator: string;

  @IsString()
  etf_vault_program: string;

  @IsString()
  system_program: string;

  @IsOptional()
  @IsString()
  etf_vault_pda?: string;

  @IsOptional()
  @IsString()
  etf_mint?: string;

  @IsOptional()
  @IsString()
  vault_treasury?: string;
}

class VaultDataDto {
  @IsString()
  vault_name: string;

  @IsString()
  vault_symbol: string;

  @IsNumber()
  management_fee_bps: number;

  @IsOptional()
  @IsNumber()
  vault_index?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnderlyingAssetEventDto)
  underlying_assets: UnderlyingAssetEventDto[];
}

class MetadataDto {
  @IsString()
  network: string;

  @IsString()
  instruction_name: string;

  @IsNumber()
  compute_units_consumed: number;

  @IsNumber()
  fee: number;
}

export class VaultCreationEventDto implements VaultCreationEvent {
  @IsString()
  event_type: string;

  @IsString()
  program_id: string;

  @IsNumber()
  instruction_index: number;

  @IsString()
  transaction_signature: string;

  @IsNumber()
  slot: number;

  @IsNumber()
  block_time: number;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountsDto)
  accounts: AccountsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => VaultDataDto)
  vault_data: VaultDataDto;

  @IsObject()
  @ValidateNested()
  @Type(() => MetadataDto)
  metadata: MetadataDto;
}
