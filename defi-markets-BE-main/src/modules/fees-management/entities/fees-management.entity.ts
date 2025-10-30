import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeesManagementDocument = FeesManagement & Document;

export enum FeesManagementType {
  MANAGEMENT = 'management',
  ENTRY_FEE = 'entry_fee',
  EXIT_FEE = 'exit_fee',
  VAULT_CREATION_FEE = 'vault_creation_fee',
  VAULT_CREATOR_MANAGEMENT_FEE = 'vault_creator_management_fee',
  PLATFORM_OWNER_MANAGEMENT_FEE = 'platform_owner_management_fee',
}

@Schema({ _id: false })
export class FeesArraySchema {
  @Prop()
  feeRate?: number; // Fee rate in percentage (e.g., 2.00%) - used for entry_fee, exit_fee, vault_creation_fee

  @Prop()
  minFeeRate?: number; // Minimum fee rate in percentage - used for management type

  @Prop()
  maxFeeRate?: number; // Maximum fee rate in percentage - used for management type

  @Prop()
  description?: string; // Optional description of the fee change

  @Prop({ required: true, enum: FeesManagementType })
  type: FeesManagementType; // Type of fee (e.g., management, entry_fee, exit_fee, vault_creation_fee)

  @Prop()
  notes?: string; // Additional notes about the fee change
}

export const FeesArraySubSchema = SchemaFactory.createForClass(FeesArraySchema);

@Schema({ timestamps: true })
export class FeesManagement {
  @Prop({ type: [FeesArraySubSchema], required: true })
  fees: FeesArraySchema[];

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  createdBy: Types.ObjectId; // Foreign key to Profile schema

  @Prop({ required: true, default: true })
  isActive: boolean; // Whether this fee configuration is currently active
}

export const FeesManagementSchema = SchemaFactory.createForClass(FeesManagement);
