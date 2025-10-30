import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type SharePriceHistoryDocument = SharePriceHistory & Document;

@Schema({ timestamps: true })
export class SharePriceHistory {
  @Prop({ required: true, index: true })
  vaultId: string;

  @Prop({ required: true })
  vaultName: string;

  @Prop({ required: true })
  vaultIndex: number;

  @Prop({ required: true })
  sharePrice: number;

  @Prop({ required: true })
  nav: number;

  @Prop({ required: true })
  totalSupply: number;

  @Prop({ required: true })
  gav: number;

  @Prop({ required: true })
  totalAssets: number;

  @Prop({ required: true })
  accruedManagementFeesUsdc: number;

  @Prop({ required: true })
  managementFees: number;

  @Prop({ required: true })
  timestamp: Date;

  // Index for efficient querying by vault and time range
  @Prop({ index: true })
  vaultIdTimestamp: string; // Composite index: vaultId + timestamp
}

export const SharePriceHistorySchema =
  SchemaFactory.createForClass(SharePriceHistory);

// Create compound index for efficient querying
SharePriceHistorySchema.index({ vaultId: 1, timestamp: -1 });
SharePriceHistorySchema.index({ vaultId: 1, timestamp: 1 });
