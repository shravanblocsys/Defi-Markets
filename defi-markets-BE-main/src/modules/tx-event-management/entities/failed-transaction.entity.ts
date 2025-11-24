import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import * as mongoose from "mongoose";

@Schema({ timestamps: true })
export class FailedTransaction {
  _id?: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    ref: "VaultFactory",
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  })
  vaultId: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    ref: "Profile",
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  })
  user: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    min: 0,
  })
  usdcAmt: number;

  @Prop({
    required: true,
    ref: "AssetAllocation",
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  })
  assetId: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    index: true,
  })
  txhash: string;

  @Prop({
    required: true,
    enum: ["failed"],
    default: "failed",
  })
  status: string;

  @Prop({
    required: true,
    default: Date.now,
  })
  timestamp: Date;
}

export const FailedTransactionSchema =
  SchemaFactory.createForClass(FailedTransaction);
