import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type HistoryDocument = History & Document;

export enum HistoryAction {
  // Fee actions
  FEE_CREATED = "fee_created",
  FEE_UPDATED = "fee_updated",
  FEE_DELETED = "fee_deleted",

  // Wallet actions
  WALLET_CREATED = "wallet_created",
  WALLET_UPDATED = "wallet_updated",
  WALLET_DELETED = "wallet_deleted",

  // Vault actions
  VAULT_CREATED = "vault_created",
  VAULT_UPDATED = "vault_updated",
  VAULT_DELETED = "vault_deleted",
  VAULT_PAUSED = "vault_paused",
  VAULT_RESUMED = "vault_resumed",
  VAULT_CLOSED = "vault_closed",

  // Transaction actions
  DEPOSIT_COMPLETED = "deposit_completed",
  REDEEM_COMPLETED = "redeem_completed",
  SWAP_COMPLETED = "swap_completed",
  EMERGENCY_WITHDRAW = "emergency_withdraw",
  VAULT_CLOSURE = "vault_closure",
}

export enum RelatedEntity {
  VAULT = "vault",
  WALLET = "wallet",
  FEE = "fee",
  TRANSACTION = "transaction",
}

@Schema({ timestamps: true })
export class History {
  @Prop({
    required: true,
    enum: HistoryAction,
  })
  action: HistoryAction;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: "Profile", required: true })
  performedBy: Types.ObjectId; // Foreign key to Profile schema

  @Prop({ type: Types.ObjectId, ref: "VaultFactory", required: false })
  vaultId?: Types.ObjectId; // Optional foreign key to VaultFactory schema

  @Prop({ type: Types.ObjectId, ref: "FeesManagement", required: false })
  feeId?: Types.ObjectId; // Optional foreign key to FeesManagement schema

  @Prop({ type: Types.ObjectId, ref: "Wallet", required: false })
  walletId?: Types.ObjectId; // Optional foreign key to Wallet schema

  @Prop({ enum: RelatedEntity })
  relatedEntity?: RelatedEntity;

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Additional data related to the action

  @Prop({ required: false })
  transactionSignature?: string; // Transaction signature for blockchain transactions

  @Prop({ type: [String], required: false })
  signatureArray?: string[]; // Array of swap signatures for multiple swap transactions
}

export const HistorySchema = SchemaFactory.createForClass(History);
