import { IsString, IsArray, IsOptional, IsBoolean, IsMongoId, IsString as IsStringType } from 'class-validator';

export class UpdateWalletDto {
  @IsOptional()
  @IsString()
  @IsMongoId()
  performedBy?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsStringType({ each: true })
  tags?: string[];

  @IsOptional()
  metadata?: Record<string, any>;
}
