import { Schema, Document } from "mongoose";

/**
 * Mongoose Role Schema
 */
export const Role = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    uppercase: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

// Update the updatedAt field before saving
Role.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * Mongoose Role Document
 */
export interface IRole extends Document {
  /**
   * UUID
   */
  readonly _id: Schema.Types.ObjectId;
  /**
   * Role name
   */
  readonly name: string;
  /**
   * Role description
   */
  readonly description: string;
  /**
   * Role status
   */
  readonly isActive: boolean;
  /**
   * Creation date
   */
  readonly createdAt: Date;
  /**
   * Last update date
   */
  readonly updatedAt: Date;
}
