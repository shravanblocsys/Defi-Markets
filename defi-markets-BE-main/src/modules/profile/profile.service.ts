import * as bcrypt from "bcrypt";
import * as gravatar from "gravatar";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
} from "@nestjs/common";
import { IProfile } from "./profile.model";
import { RegisterPayload } from "modules/auth/payload/register.payload";
import { PatchProfilePayload } from "./payload/patch.profile.payload";
import { RolesService } from "../roles/roles.service";

/**
 * Models a typical response for a crud operation
 */
export interface IGenericMessageBody {
  /**
   * Status message to return
   */
  message: string;
}

/**
 * Profile Service
 */
@Injectable()
export class ProfileService {
  /**
   * Constructor
   * @param {Model<IProfile>} profileModel
   * @param {RolesService} rolesService roles service
   */
  constructor(
    @InjectModel("Profile") private readonly profileModel: Model<IProfile>,
    private readonly rolesService: RolesService
  ) {}

  /**
   * Fetches a profile from database by UUID
   * @param {string} id
   * @returns {Promise<IProfile>} queried profile data
   */
  get(id: string): Promise<IProfile> {
    return this.profileModel
      .findOne({ _id: id, isDeleted: false })
      .select("-password")
      .exec();
  }

  /**
   * Fetches a profile from database by wallet address
   * @param {string} walletAddress
   * @returns {Promise<IProfile>} queried profile data
   */
  getByWalletAddress(walletAddress: string): Promise<IProfile> {
    return this.profileModel
      .findOne({ walletAddress, isDeleted: false })
      .select("-password")
      .exec();
  }

  /**
   * Fetches a profile from database by username
   * @param {string} username
   */
  async getByUsername(username: string): Promise<{ user: any }> {
    const user = await this.profileModel
      .findOne({ username, isDeleted: false })
      .select("-password")
      .exec();

    if (!user) {
      return { user: null };
    }

    return {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        roleId: user.roleId,
        walletAddress: user.walletAddress,
        date: user.date,
        socialLinks: user.socialLinks,
      },
    };
  }

  /**
   * Fetches a profile by their username and password
   * @param {string} username
   * @param {string} password
   * @returns {Promise<IProfile>} queried profile data
   */
  async getByUsernameAndPass(
    username: string,
    password: string
  ): Promise<IProfile> {
    const profile = await this.profileModel
      .findOne({ username, isDeleted: false })
      .exec();
    if (!profile) {
      return null;
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, profile.password);
    return isPasswordValid ? profile : null;
  }

  /**
   * Fetches a profile by their email and password
   * @param {string} email
   * @param {string} password
   * @returns {Promise<IProfile>} queried profile data
   */
  async getByEmailAndPass(email: string, password: string): Promise<IProfile> {
    const profile = await this.profileModel
      .findOne({ email, isDeleted: false })
      .exec();

    if (!profile) {
      return null;
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, profile.password);

    return isPasswordValid ? profile : null;
  }

  /**
   * Create a profile with RegisterPayload fields
   * @param {RegisterPayload} payload profile payload
   * @returns {Promise<IProfile>} created profile data
   */
  async create(payload: RegisterPayload): Promise<IProfile> {
    const user = await this.getByUsername(payload.username);
    if (user && user.user) {
      throw new NotAcceptableException(
        "The account with the provided username currently exists. Please choose another one."
      );
    }

    // Validate that the role exists
    try {
      await this.rolesService.get(payload.roleId);
    } catch (error) {
      throw new NotFoundException("Role not found");
    }

    // Hash the password with bcrypt using 12 salt rounds (industry standard)
    const hashedPassword = await bcrypt.hash(payload.password, 12);

    // Derive a safe email value for avatar when needed (fallback to wallet-based alias)
    const emailForAvatar = (
      payload.email || `${payload.walletAddress?.slice(0, 8)}@wallet.local`
    )
      .toString()
      .trim()
      .toLowerCase();

    const createdProfile = new this.profileModel({
      ...payload,
      password: hashedPassword,
      avatar: gravatar.url(emailForAvatar, {
        protocol: "http",
        s: "200",
        r: "pg",
        d: "404",
      }),
      roleId: payload.roleId,
    });

    const savedProfile = await createdProfile.save();
    // Return profile without password
    return this.get(savedProfile._id.toString());
  }

  /**
   * Edit profile data by user ID
   * @param {string} userId - The user ID from JWT token
   * @param {PatchProfilePayload} payload
   * @returns {Promise<IProfile>} mutated profile data
   */
  async editById(userId: string, payload: PatchProfilePayload): Promise<any> {
    // Hash the password if provided
    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 12);
    }

    // Set isTwitterConnected to true if twitter_username is provided and not empty
    if (payload.twitter_username && payload.twitter_username.trim() !== "") {
      (payload as any).isTwitterConnected = true;
    }
    
    // // Update avatar if email is being changed
    // if (payload.email) {
    //   const emailForAvatar = payload.email.toString().trim().toLowerCase();
    //   (payload as any).avatar = gravatar.url(emailForAvatar, {
    //     protocol: "http",
    //     s: "200",
    //     r: "pg",
    //     d: "404",
    //   });
    // }

    const updateResult = await this.profileModel.updateOne(
      { _id: userId, isDeleted: false },
      payload
    );

    if (updateResult.modifiedCount !== 1) {
      throw new BadRequestException(
        "The profile could not be updated. Please ensure you are updating your own profile."
      );
    }

    // console.log("updateResult ----->", userId);
    // console.log("payload", payload);
    // console.log("updateResult", updateResult);

    // Return the updated profile data
    return this.get(userId);
  }

  /**
   * Delete profile given a username
   * @param {string} id
   * @returns {Promise<IGenericMessageBody>} whether or not the crud operation was completed
   */
  async deleteById(id: string): Promise<IGenericMessageBody> {
    const result = await this.profileModel.updateOne(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true } }
    );
    if (result.modifiedCount === 1) {
      return { message: `Soft deleted user ${id} from records` };
    }
    throw new BadRequestException(
      `Failed to delete a profile by the id of ${id}.`
    );
  }

  /**
   * Fetches a profile from database by Twitter ID
   * @param {string} twitterId
   * @returns Twitter details object containing user info and tokens
   */
  async getByTwitterId(twitterId: string): Promise<{
    name?: string;
    profile_image_url?: string;
    username?: string;
    id?: string;
    accessToken?: string;
    refreshToken?: string;
  }> {
    const profile = await this.profileModel
      .findOne({ twitterId, isDeleted: false })
      .select("twitterDetails")
      .exec();

    return profile?.twitterDetails || null;
  }

  /**
   * Fetches full profile from database by Twitter ID (internal use)
   * @param {string} twitterId
   * @returns {Promise<IProfile>} queried profile data
   */
  getProfileByTwitterId(twitterId: string): Promise<IProfile> {
    return this.profileModel
      .findOne({ twitterId, isDeleted: false })
      .select("-password")
      .exec();
  }

  /**
   * Create a profile from Twitter OAuth profile data
   * @param {any} twitterData Twitter profile data
   * @returns Twitter details object containing user info and tokens
   */
  async createFromTwitterProfile(twitterData: {
    twitterId: string;
    username: string;
    displayName: string;
    email: string | null;
    avatar: string | null;
    twitterAccessToken: string;
    twitterRefreshToken: string;
  }): Promise<{
    name?: string;
    profile_image_url?: string;
    username?: string;
    id?: string;
    accessToken?: string;
    refreshToken?: string;
  }> {
    // Check if user already exists with this Twitter ID
    const existingUser = await this.getByTwitterId(twitterData.twitterId);
    if (existingUser) {
      return existingUser;
    }

    // Get default user role
    const defaultRole = await this.rolesService.getByName("USER");
    if (!defaultRole) {
      throw new NotFoundException("Default USER role not found");
    }

    // Generate a unique username if the Twitter username already exists
    let uniqueUsername = twitterData.username;
    let counter = 1;
    while (true) {
      const existing = await this.getByUsername(uniqueUsername);
      if (!existing.user) {
        break;
      }
      uniqueUsername = `${twitterData.username}${counter}`;
      counter++;
    }

    // Generate a random password (user won't need it for Twitter OAuth)
    const randomPassword = await bcrypt.hash(
      Math.random().toString(36).slice(-8) + Date.now().toString(),
      12
    );

    // Use Twitter avatar or generate gravatar
    const avatarUrl =
      twitterData.avatar ||
      gravatar.url(
        twitterData.email || `${twitterData.twitterId}@twitter.local`,
        {
          protocol: "http",
          s: "200",
          r: "pg",
          d: "identicon",
        }
      );

    // Generate a unique wallet address placeholder (can be updated later by user)
    const walletAddressPlaceholder = `twitter_${twitterData.twitterId}`;

    const createdProfile = new this.profileModel({
      username: uniqueUsername,
      email: twitterData.email || `${twitterData.twitterId}@twitter.local`,
      name: twitterData.displayName,
      password: randomPassword,
      avatar: avatarUrl,
      walletAddress: walletAddressPlaceholder,
      roleId: defaultRole._id,
      twitterId: twitterData.twitterId,
      twitterUsername: twitterData.username,
      twitterDetails: {
        id: twitterData.twitterId,
        username: twitterData.username,
        name: twitterData.displayName,
        profile_image_url: twitterData.avatar,
        accessToken: twitterData.twitterAccessToken,
        refreshToken: twitterData.twitterRefreshToken,
      },
    });

    const savedProfile = await createdProfile.save();
    // Return only twitterDetails
    return savedProfile.twitterDetails;
  }

  /**
   * Update Twitter tokens for an existing user
   * @param {string} userId User ID
   * @param {string} accessToken Twitter access token
   * @param {string} refreshToken Twitter refresh token
   * @returns {Promise<IProfile>} updated profile data
   */
  async updateTwitterTokens(
    userId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<IProfile> {
    const updateResult = await this.profileModel.updateOne(
      { _id: userId, isDeleted: false },
      {
        $set: {
          "twitterDetails.accessToken": accessToken,
          "twitterDetails.refreshToken": refreshToken,
        },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      throw new BadRequestException(
        "Failed to update Twitter tokens for the user."
      );
    }

    return this.get(userId);
  }
}
