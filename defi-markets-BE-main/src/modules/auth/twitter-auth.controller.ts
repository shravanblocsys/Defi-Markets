import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  HttpException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { ProfileService } from "../profile/profile.service";
import { ConfigService } from "../config/config.service";

/**
 * Twitter Authentication Controller
 */
@Controller("api/v1/auth/twitter")
@ApiTags("twitter-authentication")
export class TwitterAuthController {
  /**
   * Constructor
   * @param {AuthService} authService
   * @param {ProfileService} profileService
   * @param {ConfigService} configService
   */
  constructor(
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Initiate Twitter OAuth flow
   */
  @Get()
  @UseGuards(AuthGuard("twitter"))
  @ApiOperation({ summary: "Initiate Twitter OAuth authentication" })
  @ApiResponse({
    status: 302,
    description: "Redirects to Twitter OAuth authorization page",
  })
  async twitterAuth() {
    // NOTE: This method won't execute because the AuthGuard redirects to Twitter
    // before this code runs. This is normal OAuth behavior.
    // Guard redirects to Twitter
  }

  /**
   * Twitter OAuth callback
   * Handles the callback from Twitter after user authorization
   */
  @Get("callback")
  @UseGuards(AuthGuard("twitter"))
  @ApiOperation({ summary: "Twitter OAuth callback endpoint" })
  @ApiResponse({
    status: 302,
    description: "Redirects to client home page with authentication token",
  })
  @ApiResponse({ status: 401, description: "Authentication failed" })
  async twitterAuthCallback(
    @Req() req: FastifyRequest & { user: any },
    @Res() res: FastifyReply
  ) {
    try {
      // console.log("🐦 Twitter OAuth callback received");
      // console.log(
      //   "User data from Twitter:",
      //   req.user ? "✓ Present" : "✗ Missing"
      // );
      // console.log("req.user is:", req.user);
      // console.log("req.user is:", req.user.profile._json);

      const { profile, accessToken, refreshToken } = req.user;
      const twitterUserName = profile._json.username;
      // console.log("twitterDetails is:", twitterUserName);

      if (!profile || !profile.id) {
        console.error("❌ Failed to retrieve Twitter profile from request");
        throw new HttpException(
          "Failed to retrieve Twitter profile",
          HttpStatus.UNAUTHORIZED
        );
      }

      // console.log("✓ Twitter Profile ID:", profile.id);
      // console.log("✓ Twitter Username:", profile.username);

      // Check if user exists with Twitter ID
      // let twitterDetails = await this.profileService.getByTwitterId(profile.id);
      // let userProfile;

      // if (!twitterDetails) {
      //   console.log("📝 Creating new user from Twitter profile...");
      //   // Create new user with Twitter profile data
      //   twitterDetails = await this.profileService.createFromTwitterProfile({
      //     twitterId: profile.id,
      //     username: profile.username,
      //     displayName: profile.displayName || profile.username,
      //     email: profile.emails?.[0]?.value || null,
      //     avatar: profile.photos?.[0]?.value || null,
      //     twitterAccessToken: accessToken,
      //     twitterRefreshToken: refreshToken,
      //   });
      //   console.log("✓ User created successfully:", twitterDetails.username);
      //   // Get full profile for token generation
      //   userProfile = await this.profileService.getProfileByTwitterId(
      //     profile.id
      //   );
      // } else {
      //   console.log("✓ Existing user found:", twitterDetails.username);
      //   console.log("🔄 Updating Twitter tokens...");
      //   // Get full profile to update tokens
      //   userProfile = await this.profileService.getProfileByTwitterId(
      //     profile.id
      //   );
      //   await this.profileService.updateTwitterTokens(
      //     userProfile._id.toString(),
      //     accessToken,
      //     refreshToken
      //   );
      //   console.log("✓ Tokens updated successfully");
      //   // Refresh user profile with updated tokens
      //   userProfile = await this.profileService.getProfileByTwitterId(
      //     profile.id
      //   );
      // }
      // console.log("twitterDetails is:", twitterDetails);

      // Generate JWT token using full user profile
      // Generate JWT token using twitter username (currently applied)
      // const tokenResponse = await this.authService.createToken(twitterDetails);

      // console.log("✓ JWT token generated", tokenResponse.token);

      // Set JWT token in HTTP-only cookie
      // const isProduction = this.configService.get("NODE_ENV") === "production";
      // const cookieMaxAge = parseInt(tokenResponse.expires) * 1000; // Convert seconds to milliseconds

      // res.setCookie("auth_token", tokenResponse.token, {
      //   httpOnly: true, // Prevents JavaScript access (XSS protection)
      //   secure: isProduction, // Only send over HTTPS in production
      //   sameSite: isProduction ? "none" : "lax", // CSRF protection (use 'none' for cross-site in production)
      //   maxAge: cookieMaxAge, // Cookie expiration in milliseconds
      //   path: "/", // Cookie available for all routes
      //   domain: isProduction
      //     ? this.configService.get("COOKIE_DOMAIN") || undefined
      //     : undefined, // Set domain for production if configured
      // });

      // console.log("✓ JWT token set in HTTP-only cookie");

      // Redirect to client home page WITHOUT token in URL
      const clientHomePageUrl = this.configService.get("CLIENT_HOME_PAGE_URL");
      const redirectUrl = `${clientHomePageUrl}/portfolio?twitterUsername=${twitterUserName}`;

      // OLD APPROACH: Pass token in query parameters (commented out for security)
      // const redirectUrl = `${clientHomePageUrl}/portfolio?token=${tokenResponse.token}&expires=${tokenResponse.expires}`;

      // console.log("🔄 Redirecting to:", clientHomePageUrl);
      return res.status(HttpStatus.FOUND).redirect(redirectUrl);
    } catch (error) {
      console.error("❌ Twitter OAuth Error:", error);
      console.error("Error details:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }

      // On error, redirect to client with error message
      const clientHomePageUrl = this.configService.get("CLIENT_HOME_PAGE_URL");
      const errorUrl = `${clientHomePageUrl}?error=authentication_failed&details=${encodeURIComponent(
        error.message
      )}`;
      return res.status(HttpStatus.FOUND).redirect(errorUrl);
    }
  }

  /**
   * Get Twitter authentication status
   * Checks if current authenticated user has Twitter linked
   */
  @Get("status")
  @ApiOperation({ summary: "Check Twitter authentication status" })
  @ApiResponse({
    status: 200,
    description: "Returns Twitter authentication status",
  })
  async getTwitterStatus(@Req() req: FastifyRequest & { user: any }) {
    if (!req.user || !req.user._id) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const user = await this.profileService.get(req.user._id);

    return {
      hasTwitter: !!user.twitterId,
      twitterUsername: user.twitter_username || null,
    };
  }

  /**
   * Logout endpoint - clears the authentication cookies
   */
  @Get("logout")
  @ApiOperation({ summary: "Logout and clear authentication cookies" })
  @ApiResponse({
    status: 200,
    description: "Successfully logged out and cleared cookies",
  })
  async logout(@Res() res: FastifyReply) {
    const isProduction = this.configService.get("NODE_ENV") === "production";

    // Clear the auth token cookie
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });

    // Clear the OAuth session ID cookie with the exact same options used when setting it
    // The cookie is set with: HttpOnly; Secure (if production); Path=/; SameSite=Lax
    res.clearCookie("oauth_sid", {
      httpOnly: true,
      secure: isProduction, // Matches the dynamic Secure flag from main.ts
      sameSite: "lax", // Matches the SameSite=Lax from main.ts
      path: "/", // Matches Path=/ from main.ts
    });

    return res.status(HttpStatus.OK).send({
      message: "Successfully logged out",
      success: true,
    });
  }
}
