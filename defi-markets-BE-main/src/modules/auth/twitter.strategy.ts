import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import {
  Strategy,
  StrategyOptions,
} from "@superfaceai/passport-twitter-oauth2";
import { ConfigService } from "../config/config.service";

/**
 * Twitter OAuth2 Strategy
 */
@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, "twitter") {
  /**
   * Constructor
   * @param {ConfigService} configService
   * Note: We don't use 'private readonly' here because Passport strategies
   * only need ConfigService during initialization, not as a class property.
   * Using 'private' can cause issues with the super() call timing.
   */
  constructor(configService: ConfigService) {
    const clientID = configService.get("TWITTER_CLIENT_ID");
    const clientSecret = configService.get("TWITTER_CLIENT_SECRET");
    const baseUrl = configService.get("BASE_URL");
    const clientType = configService.get("CLIENT_TYPE") || "confidential";

    // Log configuration for debugging (remove in production)
    // console.log("🐦 Twitter OAuth Configuration:");
    // console.log("Client ID:", clientID ? "✓ Set" : "✗ Missing");
    // console.log("Client Secret:", clientSecret ? "✓ Set" : "✗ Missing");
    // console.log("Base URL:", baseUrl || "✗ Missing");
    // console.log("Client Type:", clientType);
    // console.log("Callback URL:", `${baseUrl}/api/v1/auth/twitter/callback`);

    if (!clientID || !clientSecret || !baseUrl) {
      throw new Error(
        "Missing required Twitter OAuth configuration. Please check TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, and BASE_URL in your .env file"
      );
    }

    super({
      clientID: clientID as string,
      clientSecret: clientSecret as string,
      clientType: clientType as "public" | "confidential",
      callbackURL: `${baseUrl}/api/v1/auth/twitter/callback`,
      scope: ["tweet.read", "users.read", "offline.access"],
    } as StrategyOptions);
  }

  /**
   * Validate callback from Twitter OAuth
   * @param accessToken Twitter access token
   * @param refreshToken Twitter refresh token
   * @param profile User profile from Twitter
   * @returns User data to be attached to request
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any
  ): Promise<any> {
    // console.log("✅ Twitter validation successful");

    // Return the profile along with tokens for further processing
    return {
      profile,
      accessToken,
      refreshToken,
    };
  }
}
