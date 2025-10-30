import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ required: true, unique: true })
  address: string; // Wallet address (e.g., 0x742d...8C8E)

  @Prop({ required: true })
  label: string; // Human-readable name (e.g., "Treasury Main", "Operations Wallet")

  @Prop({ type: [{ type: Types.ObjectId, ref: 'WalletRole' }], required: true })
  roles: Types.ObjectId[]; // Array of wallet role IDs (foreign keys)

  @Prop()
  currency?: string; // Currency type (e.g., "ETH", "SOL", "USDC") - optional

  @Prop({ required: true, default: true })
  isActive: boolean; // Whether the wallet is active

  @Prop()
  description?: string; // Optional description of the wallet

  @Prop()
  tags?: string[]; // Optional tags for categorization

  @Prop({ type: Date, default: Date.now })
  lastActivity?: Date; // Last transaction or activity date

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Additional metadata
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
