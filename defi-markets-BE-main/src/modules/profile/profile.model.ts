import { Schema, Document } from "mongoose";

/**
 * Mongoose Profile Schema
 */
export const Profile = new Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    avatar: { type: String, required: true },
    walletAddress: { type: String, required: true },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    date: {
      type: Date,
      default: Date.now,
    },
    socialLinks: {
      type: [Object],
      default: [],
    },
    twitterDetails: {
      name: {
        type: String,
      },
      profile_image_url: {
        type: String,
      },
      username: {
        type: String,
      },
      id: {
        type: String,
      },
      accessToken: {
        type: String,
      },
      refreshToken: {
        type: String,
      },
    },
    twitterId: { type: String },
    twitter_username: { type: String },
    isTwitterConnected: { type: Boolean },
  },
  {
    timestamps: true,
  }
);

// Add index for Twitter ID for efficient lookups
Profile.index({ twitterId: 1 }, { sparse: true });

/**
 * Mongoose Profile Document
 */
export interface IProfile extends Document {
  /**
   * UUID
   */
  readonly _id: Schema.Types.ObjectId;
  /**
   * Username
   */
  readonly username: string;
  /**
   * Email
   */
  readonly email: string;
  /**
   * Name
   */
  readonly name: string;
  /**
   * Password
   */
  password: string;
  /**
   * Gravatar
   */
  readonly avatar: string;
  /**
   * Role ID (Foreign Key)
   */
  readonly roleId: Schema.Types.ObjectId;
  /**
   * Wallet address
   */
  readonly walletAddress: string;
  /**
   * Soft delete flag
   */
  readonly isDeleted: boolean;
  /**
   * Date
   */
  readonly date: Date;

  /**
   * Social links
   */
  readonly socialLinks: {
    [key: string]: string;
  }[];

  /**
   * Twitter details
   */
  readonly twitterDetails?: {
    name?: string;
    profile_image_url?: string;
    username?: string;
    id?: string;
    accessToken?: string;
    refreshToken?: string;
  };

  /**
   * Twitter ID (for quick lookup)
   */
  readonly twitterId?: string;

  /**
   * Twitter username (for quick lookup)
   */
  readonly twitter_username?: string;

  /**
   * Twitter connection status
   */
  readonly isTwitterConnected?: boolean;
}
