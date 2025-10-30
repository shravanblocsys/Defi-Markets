import { IsArray, IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FeesManagementType } from '../entities/fees-management.entity';

export class FeesArrayDto {
  @IsOptional()
  @IsNumber()
  feeRate?: number; // Used for entry_fee, exit_fee, vault_creation_fee

  @IsOptional()
  @IsNumber()
  minFeeRate?: number; // Used for management type

  @IsOptional()
  @IsNumber()
  maxFeeRate?: number; // Used for management type

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsEnum(FeesManagementType, { message: 'Type must be a valid fee management type' })
  type: FeesManagementType;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}

export class CreateFeesManagementDto {
  @IsArray({ message: 'Fees must be an array' })
  @ValidateNested({ each: true })
  @Type(() => FeesArrayDto)
  fees: FeesArrayDto[];

  @IsMongoId({ message: 'Created by must be a valid MongoDB ID' })
  @IsOptional()
  createdBy?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
