import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

/**
 * Token Price Schema for storing historical price data
 */
@Schema({ timestamps: true })
export class TokenPrice {
  _id?: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    index: true
  })
  mintAddress: string;

  @Prop({
    required: true,
    index: true
  })
  symbol: string;

  @Prop({
    required: true,
    index: true
  })
  name: string;

  @Prop({
    required: true,
    min: 0
  })
  price: number;

  @Prop({
    required: false,
    default: 0
  })
  change24h: number;

  @Prop({
    required: true,
    index: true
  })
  timestamp: Date;

  @Prop({
    required: false,
    default: 'jupiter'
  })
  source: string;

  @Prop({
    required: false,
    default: true
  })
  active: boolean;

  @Prop({
    required: false,
    default: 'mainnet',
    index: true
  })
  network: string;
}

export const TokenPriceSchema = SchemaFactory.createForClass(TokenPrice);

// Create compound index for efficient queries
TokenPriceSchema.index({ mintAddress: 1, timestamp: -1 });
TokenPriceSchema.index({ timestamp: -1 });
TokenPriceSchema.index({ symbol: 1, timestamp: -1 });
TokenPriceSchema.index({ network: 1, timestamp: -1 });
TokenPriceSchema.index({ mintAddress: 1, network: 1, timestamp: -1 });
