import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

/**
 * Asset Allocation Type Enum
 */
export enum AssetType {
  CRYPTO = 'crypto',
  STOCKS = 'stocks',
  BONDS = 'bonds',
  LSTS = 'LSTs',
  VAULTS = 'vaults',
  OTHER = 'other'
}

export enum NetworkType {
  MAINNET = 'mainnet',
  DEVNET = 'devnet'
}

export enum SourceType {
  JUPITER = 'jupiter',
  RAYDIUM = 'raydium',
  ORCA = 'orca'
}

/**
 * Asset Allocation Schema
 */
@Schema({ timestamps: true })
export class AssetAllocation {
  _id?: mongoose.Types.ObjectId;

  @Prop({
    required: true,
    // unique: true,
    index: true
  })
  mintAddress: string;

  @Prop({
    required: true,
    index: true
  })
  name: string;

  @Prop({
    required: true,
    index: true
  })
  symbol: string;

  @Prop({
    enum: Object.values(AssetType),
    required: true,
    index: true
  })
  type: AssetType;

  @Prop({
    required: true,
    min: 0,
    max: 18
  })
  decimals: number;

  @Prop({
    required: false
  })
  logoUrl?: string;

  @Prop({
    default: true,
    index: true
  })
  active: boolean;

  @Prop({
    enum: Object.values(NetworkType),
    required: true,
    index: true
  })
  network: NetworkType;

  @Prop({
    enum: Object.values(SourceType),
    required: true,
    index: true
  })
  source: SourceType;

  @Prop({
    default: true,
    index: true
  })
  priceAvailable: boolean;

  @Prop({
    required: false
  })
  lastPriceFetchAttempt?: Date;

  @Prop({
    required: false
  })
  priceUnavailableReason?: string;
}

export const AssetAllocationSchema = SchemaFactory.createForClass(AssetAllocation);
