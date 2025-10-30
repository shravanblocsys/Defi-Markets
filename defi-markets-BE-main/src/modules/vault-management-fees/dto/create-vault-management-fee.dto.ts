import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FeeStatus } from '../entities/vault-management-fee.entity';

export class CreateVaultManagementFeeDto {
  @IsNotEmpty()
  @IsDateString()
  date: string; // Date when fees were accrued (ISO string format)

  @IsNotEmpty()
  @IsString()
  vaultName: string; // Vault name (e.g., "ABC-11", "ABC-15", "XYZ-5k")

  @IsNotEmpty()
  @IsString()
  vaultSymbol: string; // Vault symbol for identification

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  vaultIndex: number; // Vault index from contract

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  etfCreatorFee: number; // Fee amount for ETF creator

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  platformOwnerFee: number; // Fee amount for platform owner

  @IsOptional()
  @IsNumber()
  @Min(0)
  todaysAum?: number; // Today's Assets Under Management

  @IsOptional()
  @IsNumber()
  @Min(0)
  nav?: number; // Net Asset Value

  @IsOptional()
  @IsNumber()
  @Min(0)
  gav?: number; // Gross Asset Value

  @IsOptional()
  @IsEnum(FeeStatus)
  status?: FeeStatus; // Status of fee allocation

  @IsOptional()
  metadata?: Record<string, any>; // Additional metadata

  @IsOptional()
  @IsString()
  transactionSignature?: string; // Blockchain transaction signature if applicable

  @IsOptional()
  @IsString()
  notes?: string; // Additional notes or comments
}
