import { IsArray, IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FeesManagementType } from '../entities/fees-management.entity';

export class UpdateFeesArrayDto {
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

  @IsOptional()
  @IsEnum(FeesManagementType, { message: 'Type must be a valid fee management type' })
  type?: FeesManagementType;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}

export class UpdateFeesManagementDto {
  @IsOptional()
  @IsArray({ message: 'Fees must be an array' })
  @ValidateNested({ each: true })
  @Type(() => UpdateFeesArrayDto)
  fees?: UpdateFeesArrayDto[];

  @IsOptional()
  @IsMongoId({ message: 'Created by must be a valid MongoDB ID' })
  createdBy?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
