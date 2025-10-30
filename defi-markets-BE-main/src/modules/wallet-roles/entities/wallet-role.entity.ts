import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WalletRoleDocument = WalletRole & Document;

@Schema({ timestamps: true })
export class WalletRole {
  @Prop({ required: true, unique: true })
  name: string; // e.g., "Treasury", "Admin", "Operator", "Auditor"

  @Prop({ required: true })
  description: string; // Description of what this role can do

  @Prop({ required: true, default: false })
  isActive: boolean;

  @Prop()
  color?: string; // Color for UI display (e.g., hex color)

  @Prop()
  icon?: string; // Icon identifier for UI display
}

export const WalletRoleSchema = SchemaFactory.createForClass(WalletRole);
