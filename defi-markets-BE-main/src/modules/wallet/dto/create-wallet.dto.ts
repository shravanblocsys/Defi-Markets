import { IsString, IsArray, IsOptional, IsBoolean, IsMongoId, ArrayMinSize, IsIn } from 'class-validator';

export class CreateWalletDto {
  @IsString({ message: 'Address must be a string' })
  address: string;

  @IsString({ message: 'Label must be a string' })
  label: string;

  @IsArray({ message: 'Roles must be an array' })
  @IsMongoId({ each: true, message: 'Each role must be a valid MongoDB ID' })
  roles: string[];

  @IsOptional()
  @IsString({ message: 'Currency must be a string' })
  currency?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Tags must be an array' })
  @IsString({ each: true, message: 'Each tag must be a string' })
  tags?: string[];

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsMongoId({ message: 'performedBy must be a valid MongoDB ID' })
  performedBy?: string;
}
