import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

// FeeConfig Schema
@Schema()
export class FeeConfig {
  @Prop({ required: true, min: 0 })
  entryFee: number;

  @Prop({ required: true, min: 0})
  exitFee: number;

  @Prop({ required: true, min: 0 })
  performanceFee: number;

  @Prop({ required: true, min: 0 })
  protocolFee: number;
}

export const FeeConfigSchema = SchemaFactory.createForClass(FeeConfig);


// VaultState Schema
@Schema()
export class VaultState {
  @Prop({ required: true, enum: ['Active', 'Paused', 'Emergency', 'Closed'] })
  status: 'Active' | 'Paused' | 'Emergency' | 'Closed';

  @Prop({ required: true, default: 0 })
  totalAssets: number;

  @Prop({ required: true, default: 0 })
  totalShares: number;

  @Prop({ required: true, default: 1.0 })
  nav: number;

  @Prop({ required: true, default: Date.now })
  lastUpdated: Date;
}

export const VaultStateSchema = SchemaFactory.createForClass(VaultState);

// VaultDeposit Schema
@Schema({ timestamps: true })
export class VaultDeposit {
  _id?: mongoose.Types.ObjectId;

  @Prop({ 
    required: true, 
    unique: true,
    ref: 'VaultFactory',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultFactory: mongoose.Types.ObjectId;

  @Prop({ required: true, unique: true })
  vaultAddress: string;

  @Prop({ type: FeeConfigSchema, required: true })
  feeConfig: FeeConfig;

  @Prop({ type: VaultStateSchema, required: true })
  state: VaultState;

  @Prop({ required: true })
  admin: string;

  @Prop({ required: true })
  factory: string;

  @Prop({ required: false })
  etfMint?: string;

  @Prop({ required: false })
  vaultBaseTreasury?: string;

  @Prop({ required: false })
  baseMint?: string;
}

export const VaultDepositSchema = SchemaFactory.createForClass(VaultDeposit);

// DepositTransaction Schema
@Schema({ timestamps: true })
export class DepositTransaction {
  @Prop({ 
    required: true,
    ref: 'VaultDeposit',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultDeposit: mongoose.Types.ObjectId;

  @Prop({ 
    required: true,
    ref: 'VaultFactory',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultFactory: mongoose.Types.ObjectId;

  @Prop({ required: true })
  vaultAddress: string;

  @Prop({ 
    required: true,
    ref: 'Profile',
    type: mongoose.Schema.Types.ObjectId
  })
  userProfile: mongoose.Types.ObjectId;

  @Prop({ required: true })
  userAddress: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, min: 0 })
  sharesReceived: number;

  @Prop({ required: true, min: 0 })
  feePaid: number;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @Prop()
  transactionSignature?: string;

  @Prop()
  blockNumber?: number;
}

export const DepositTransactionSchema = SchemaFactory.createForClass(DepositTransaction);

// RedeemTransaction Schema
@Schema({ timestamps: true })
export class RedeemTransaction {
  @Prop({ 
    required: true,
    ref: 'VaultDeposit',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultDeposit: mongoose.Types.ObjectId;

  @Prop({ 
    required: true,
    ref: 'VaultFactory',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultFactory: mongoose.Types.ObjectId;

  @Prop({ required: true })
  vaultAddress: string;

  @Prop({ 
    required: true,
    ref: 'Profile',
    type: mongoose.Schema.Types.ObjectId
  })
  userProfile: mongoose.Types.ObjectId;

  @Prop({ required: true })
  userAddress: string;

  @Prop({ required: true, min: 0 })
  shares: number;

  @Prop({ required: true, min: 0 })
  tokensReceived: number;

  @Prop({ required: true, min: 0 })
  feePaid: number;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @Prop()
  transactionSignature?: string;

  @Prop()
  blockNumber?: number;

  @Prop()
  gasUsed?: number;
}

export const RedeemTransactionSchema = SchemaFactory.createForClass(RedeemTransaction);

// EmergencyWithdrawTransaction Schema
@Schema({ timestamps: true })
export class EmergencyWithdrawTransaction {
  @Prop({ 
    required: true,
    ref: 'VaultDeposit',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultDeposit: mongoose.Types.ObjectId;

  @Prop({ required: true, ref: 'VaultFactory', type: mongoose.Schema.Types.ObjectId })
  vaultFactory: mongoose.Types.ObjectId;

  @Prop({ 
    required: true,
    ref: 'Profile',
    type: mongoose.Schema.Types.ObjectId
  })
  guardianProfile: mongoose.Types.ObjectId;

  @Prop({ required: true })
  guardianAddress: string;

  @Prop({ required: true })
  target: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @Prop()
  transactionSignature?: string;

  @Prop()
  blockNumber?: number;

  @Prop()
  gasUsed?: number;
}

export const EmergencyWithdrawTransactionSchema = SchemaFactory.createForClass(EmergencyWithdrawTransaction);

// VaultClosureTransaction Schema
@Schema({ timestamps: true })
export class VaultClosureTransaction {
  @Prop({ 
    required: true,
    ref: 'VaultDeposit',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultDeposit: mongoose.Types.ObjectId;

  @Prop({ 
    required: true,
    ref: 'VaultFactory',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultFactory: mongoose.Types.ObjectId;

  @Prop({ required: true })
  vaultAddress: string;

  @Prop({ 
    required: true,
    ref: 'Profile',
    type: mongoose.Schema.Types.ObjectId
  })
  adminProfile: mongoose.Types.ObjectId;

  @Prop({ required: true })
  adminAddress: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  finalDistribution: boolean;

  @Prop({ required: true, default: Date.now })
  timestamp: Date;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @Prop()
  transactionSignature?: string;

  @Prop()
  blockNumber?: number;

  @Prop()
  gasUsed?: number;
}

export const VaultClosureTransactionSchema = SchemaFactory.createForClass(VaultClosureTransaction);