import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from "class-validator";
import { Types } from "mongoose";

export class CreateHistoryDto {
  @IsNotEmpty()
  @IsEnum([
    "fee_created",
    "fee_updated",
    "fee_deleted",
    "wallet_created",
    "wallet_updated",
    "wallet_deleted",
    "vault_created",
    "vault_updated",
    "vault_deleted",
    "vault_paused",
    "vault_resumed",
    "vault_closed",
    "deposit_completed",
    "redeem_completed",
    "swap_completed",
    "emergency_withdraw",
    "vault_closure",
  ])
  action: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsMongoId()
  performedBy: string; // Profile ID

  @IsOptional()
  @IsMongoId()
  vaultId?: string; // VaultFactory ID

  @IsOptional()
  @IsMongoId()
  feeId?: string; // FeesManagement ID

  @IsOptional()
  @IsMongoId()
  walletId?: string; // Wallet ID

  @IsOptional()
  @IsEnum(["vault", "wallet", "fee", "transaction"])
  relatedEntity?: string;

  @IsOptional()
  metadata?: Record<string, any>; // Additional data

  @IsOptional()
  @IsString()
  transactionSignature?: string; // Transaction signature for blockchain transactions

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  signatureArray?: string[]; // Array of swap signatures for multiple swap transactions
}
