import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VaultManagementFeeDocument = VaultManagementFee & Document;

export enum FeeStatus {
  ALLOCATED = 'allocated',
  IN_PROCESS = 'in_process',
  PENDING = 'pending',
  COMPLETED = 'completed'
}

@Schema({ timestamps: true })
export class VaultManagementFee {
  @Prop({ required: true })
  date: string; // Date when fees were accrued (ISO string format)

  @Prop({ required: true })
  vaultName: string; // Vault name (e.g., "ABC-11", "ABC-15", "XYZ-5k")

  @Prop({ required: true })
  vaultSymbol: string; // Vault symbol for identification

  @Prop({ required: true })
  vaultIndex: number; // Vault index from contract

  @Prop({ required: true, type: Number, default: 0 })
  etfCreatorFee: number; // Fee amount for ETF creator

  @Prop({ required: true, type: Number, default: 0 })
  platformOwnerFee: number; // Fee amount for platform owner

  @Prop({ type: Number, default: 0 })
  todaysAum?: number; // Today's Assets Under Management

  @Prop({ type: Number, default: 0 })
  nav?: number; // Net Asset Value

  @Prop({ type: Number, default: 0 })
  gav?: number; // Gross Asset Value

  @Prop({ 
    required: true, 
    enum: FeeStatus, 
    default: FeeStatus.PENDING 
  })
  status: FeeStatus; // Status of fee allocation

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Additional metadata

  @Prop()
  transactionSignature?: string; // Blockchain transaction signature if applicable

  @Prop()
  notes?: string; // Additional notes or comments
}

export const VaultManagementFeeSchema = SchemaFactory.createForClass(VaultManagementFee);
