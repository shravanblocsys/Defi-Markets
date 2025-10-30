import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max, IsMongoId } from 'class-validator';

export class CreateDepositTransactionDto {
  @IsMongoId()
  @IsOptional()
  vault: string;

  @IsMongoId()
  vaultFactory: string;

  @IsString()
  vaultAddress: string;

  @IsMongoId()
  userProfile: string;

  @IsString()
  userAddress: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsNumber()
  @Min(0)
  minSharesOut: number;
}

export class CreateRedeemTransactionDto {
  @IsString()
  @IsOptional()
  vault: string;

  @IsMongoId()
  vaultFactory: string;

  @IsString()
  vaultAddress: string;

  @IsMongoId()
  userProfile: string;

  @IsString()
  userAddress: string;

  @IsNumber()
  @Min(0)
  shares: number;

  @IsBoolean()
  toBase: boolean;
}

// New DTOs for blockchain program alignment
export class CreateEmergencyWithdrawDto {
  @IsString()
  @IsOptional()
  vault: string;

  @IsMongoId()
  vaultFactory: string;

  @IsString()
  @IsOptional()
  vaultAddress: string;

  @IsMongoId()
  guardianProfile: string;

  @IsString()
  @IsOptional()
  guardianAddress: string;

  @IsString()
  @IsOptional()
  target: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  reason: string;
}

export class CreateVaultClosureDto {
  @IsString()
  @IsOptional()
  vault: string;

  @IsMongoId()
  vaultFactory: string;

  @IsString()
  @IsOptional()
  vaultAddress: string;

  @IsMongoId()
  adminProfile: string;

  @IsString()
  @IsOptional()
  adminAddress: string;

  @IsString()
  @IsOptional()
  reason: string;

  @IsBoolean()
  @IsOptional()
  finalDistribution: boolean;
}

export class UpdateTransactionStatusDto {
  @IsString()
  @IsOptional()
  status: 'pending' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  transactionSignature?: string;

  @IsOptional()
  @IsNumber()
  blockNumber?: number;

  @IsOptional()
  @IsNumber()
  gasUsed?: number;
}
