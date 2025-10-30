import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

// UnderlyingAsset Schema with foreign key reference to AssetAllocation
@Schema()
export class UnderlyingAsset {
  @Prop({ 
    required: true,
    ref: 'AssetAllocation',
    type: mongoose.Schema.Types.ObjectId,
  })
  assetAllocation: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, min: 0 })
  pct_bps: number; // Percentage allocation in basis points

  @Prop({ required: false })
  totalAssetLocked?: number; // Total amount of asset locked (optional)
}

export const UnderlyingAssetSchema = SchemaFactory.createForClass(UnderlyingAsset);


// FeeConfig Schema
@Schema()
export class FeeConfig {
  @Prop({ required: true, min: 0, max: 10000 })
  managementFeeBps: number; // Management fee in basis points
}

export const FeeConfigSchema = SchemaFactory.createForClass(FeeConfig);


// VaultFactory Schema
@Schema({ timestamps: true })
export class VaultFactory {
  @Prop({ required: true })
  vaultName: string;

  @Prop({ required: true, unique: true })
  vaultSymbol: string;

  @Prop({ type: [UnderlyingAssetSchema], required: false, default: [] })
  underlyingAssets?: UnderlyingAsset[];


  @Prop({ type: FeeConfigSchema, required: true })
  feeConfig: FeeConfig;


  @Prop({ unique: true, sparse: true })
  vaultAddress?: string;

  @Prop()
  creatorAddress?: string;

  @Prop()
  factoryAddress?: string;

  @Prop()
  vaultIndex?: number;

  @Prop()
  etfVaultPda?: string;

  @Prop()
  etfMint?: string;

  @Prop()
  vaultTreasury?: string;

  @Prop()
  totalSupply?: string;

  @Prop()
  nav?: string;

  @Prop({ 
    required: false,
    ref: 'Profile',
    type: mongoose.Schema.Types.ObjectId,
  })
  creator?: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, enum: ['pending', 'active', 'paused', 'closed'], default: 'pending' })
  status: 'pending' | 'active' | 'paused' | 'closed';

  // Blockchain event data
  @Prop()
  programId?: string;

  @Prop()
  transactionSignature?: string;

  @Prop()
  slot?: number;

  @Prop({ type: Date })
  blockTime?: Date;

  @Prop()
  originalTimestamp?: string; // Store the original Unix timestamp string

  @Prop()
  network?: string;

  @Prop({ default: false })
  isFeaturedVault?: boolean;


  @Prop()
  bannerUrl?: string;

  @Prop()
  logoUrl?: string;

  @Prop()
  description?: string;
}

export const VaultFactorySchema = SchemaFactory.createForClass(VaultFactory);
