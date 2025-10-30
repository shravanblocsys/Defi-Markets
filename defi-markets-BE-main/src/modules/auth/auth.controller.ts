import {
  Controller,
  Body,
  Post,
  Get,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse, ApiTags, ApiHeader } from "@nestjs/swagger";
import { AuthService, ITokenReturnBody } from "./auth.service";
import { LoginPayload } from "./payload/login.payload";
import { AdminLoginPayload } from "./payload/admin.payload";
import { RegisterPayload } from "./payload/register.payload";
import { ProfileService } from "../profile/profile.service";
import { SiwxService } from "../siwx/siwx.service";
import { AdminGuard } from "../../middlewares";

/**
 * Authentication Controller
 */
@Controller("api/v1/auth")
@ApiTags("authentication")
export class AuthController {
  /**
   * Constructor
   * @param {AuthService} authService authentication service
   * @param {ProfileService} profileService profile service
   */
  constructor(
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly siwxService: SiwxService
  ) {}

  /**
   * Login route to validate and create tokens for users
   * @param {LoginPayload} payload the login dto
   */
  // test pending
  @Post("login")
  @ApiResponse({ status: 201, description: "Login Completed" })
  @ApiResponse({ status: 400, description: "Bad Request" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async login(@Body() payload: LoginPayload): Promise<ITokenReturnBody> {
    const user = await this.authService.validateUser(payload);
    return await this.authService.createToken(user);
  }

  /**
   * Admin login route to validate and create tokens for admin users
   * @param {AdminLoginPayload} payload the admin login dto
   */
  @Post("admin/login")
  @ApiResponse({ status: 201, description: "Admin Login Completed" })
  @ApiResponse({ status: 400, description: "Bad Request" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async adminLogin(
    @Body() payload: AdminLoginPayload
  ): Promise<ITokenReturnBody> {
    const admin = await this.authService.validateAdmin(payload);
    return await this.authService.createToken(admin);
  }

  /**
   * Logout current session. For SIWX tokens, revoke the session; for classic JWTs, respond success.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Authorization", description: "Bearer token" })
  @ApiResponse({ status: 200, description: "Logged out successfully" })
  async logout(
    @Headers("authorization") authorization: string
  ): Promise<{ success: boolean }> {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid authorization header");
    }
    const token = authorization.substring(7);

    // Try to decode and revoke SIWX session if applicable
    const payload: any = this.authService.decodeToken(token);
    if (payload && payload.sessionId && payload.address && payload.chainId) {
      await this.siwxService.revokeSessions(payload.chainId, payload.address);
    }
    return { success: true };
  }
  /**
   * Registration route to create user profile
   * @param {RegisterPayload} payload the registration dto
   */
  @Post("register")
  @ApiResponse({ status: 200, description: "Profile User Created" })
  @ApiResponse({ status: 400, description: "Bad Request" })
  @ApiResponse({ status: 406, description: "Username Already Exists" })
  @ApiResponse({ status: 404, description: "Role Not Found" })
  async register(
    @Body() payload: RegisterPayload
  ): Promise<{ message: string; user: any }> {
    const user = await this.profileService.create(payload);
    return {
      message: "Profile user created successfully",
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
   * Verify user token and return user details
   * @param {string} authorization Bearer token from header
   * @returns {Promise<any>} user profile data
   */
  @Get("verify")
  @ApiHeader({ name: "Authorization", description: "Bearer token" })
  @ApiResponse({ status: 200, description: "Token Verified Successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized - Invalid Token" })
  async verifyToken(
    @Headers("authorization") authorization: string
  ): Promise<any> {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    const token = authorization.substring(7); // Remove "Bearer " prefix
    const user = await this.authService.verifyToken(token);

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
        twitter_username: user.twitter_username,
        isTwitterConnected: user.isTwitterConnected,
      },
    };
  }

  /**
   * Verify admin token and return admin details with role validation
   * @param {string} authorization Bearer token from header
   * @returns {Promise<any>} admin profile data with role validation
   */
  @Get("admin/verify")
  @UseGuards(AdminGuard)
  @ApiHeader({ name: "Authorization", description: "Bearer token" })
  @ApiResponse({
    status: 200,
    description: "Admin Token Verified Successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid Token or Not Admin",
  })
  async verifyAdminToken(
    @Headers("authorization") authorization: string
  ): Promise<any> {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    const token = authorization.substring(7); // Remove "Bearer " prefix
    const admin = await this.authService.verifyAdminToken(token);

    return {
      admin: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        name: admin.name,
        avatar: admin.avatar,
        roleId: admin.roleId,
        walletAddress: admin.walletAddress,
        date: admin.date,
        socialLinks: admin.socialLinks,
      },
    };
  }
}
