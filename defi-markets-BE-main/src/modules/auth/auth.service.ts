import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "../config/config.service";
import { ProfileService } from "../profile/profile.service";
import { IProfile } from "../profile/profile.model";
import { SiwxService } from "../siwx/siwx.service";
import { RolesService } from "../roles/roles.service";
import { LoginPayload } from "./payload/login.payload";
import { AdminLoginPayload } from "./payload/admin.payload";

/**
 * Models a typical Login/Register route return body
 */
export interface ITokenReturnBody {
  /**
   * When the token is to expire in seconds
   */
  expires: string;
  /**
   * A human-readable format of expires
   */
  expiresPrettyPrint: string;
  /**
   * The Bearer token
   */
  token: string;
}

/**
 * Authentication Service
 */
@Injectable()
export class AuthService {
  /**
   * Time in seconds when the token is to expire
   * @type {string}
   */
  private readonly expiration: string;

  /**
   * Constructor
   * @param {JwtService} jwtService jwt service
   * @param {ConfigService} configService
   * @param {ProfileService} profileService profile service
   * @param {SiwxService} siwxService siwx service
   * @param {RolesService} rolesService roles service
   */
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly siwxService: SiwxService,
    private readonly rolesService: RolesService
  ) {
    this.expiration = this.configService.get("WEBTOKEN_EXPIRATION_TIME");
  }

  /**
   * Creates a signed jwt token based on IProfile payload
   * @param {Profile} param dto to generate token from
   * @returns {Promise<ITokenReturnBody>} token body
   */
  async createToken({
    _id,
    username,
    email,
    roleId,
    walletAddress,
  }: IProfile): Promise<ITokenReturnBody> {
    return {
      expires: this.expiration,
      expiresPrettyPrint: AuthService.prettyPrintSeconds(this.expiration),
      token: this.jwtService.sign({
        _id,
        username,
        email,
        roleId,
        walletAddress,
      }),
    };
  }

  /**
   * Formats the time in seconds into human-readable format
   * @param {string} time
   * @returns {string} hrf time
   */
  private static prettyPrintSeconds(time: string): string {
    const ntime = Number(time);
    const hours = Math.floor(ntime / 3600);
    const minutes = Math.floor((ntime % 3600) / 60);
    const seconds = Math.floor((ntime % 3600) % 60);

    return `${hours > 0 ? hours + (hours === 1 ? " hour," : " hours,") : ""} ${
      minutes > 0 ? minutes + (minutes === 1 ? " minute" : " minutes") : ""
    } ${seconds > 0 ? seconds + (seconds === 1 ? " second" : " seconds") : ""}`;
  }

  /**
   * Validates whether or not the profile exists in the database
   * @param {LoginPayload} payload login payload to authenticate with
   * @returns {Promise<IProfile>} registered profile
   */
  async validateUser(payload: LoginPayload): Promise<IProfile> {
    const user = await this.profileService.getByUsernameAndPass(
      payload.username,
      payload.password
    );
    if (!user) {
      throw new UnauthorizedException(
        "Could not authenticate. Please try again."
      );
    }
    return user;
  }

  /**
   * Validates admin user by email and password
   * @param {AdminLoginPayload} payload admin login payload to authenticate with
   * @returns {Promise<IProfile>} registered admin profile
   */
  async validateAdmin(payload: AdminLoginPayload): Promise<IProfile> {
    const admin = await this.profileService.getByEmailAndPass(
      payload.email,
      payload.password
    );

    if (!admin) {
      throw new UnauthorizedException(
        "Could not authenticate admin. Please try again."
      );
    }

    // Verify that the user has an admin role
    try {
      const role = await this.rolesService.get(admin.roleId.toString());

      if (!role || role.name !== "ADMIN" || !role.isActive) {
        throw new UnauthorizedException(
          "Access denied. Admin privileges required."
        );
      }
    } catch (error) {
      throw new UnauthorizedException(
        "Access denied. Admin privileges required."
      );
    }

    return admin;
  }

  /**
   * Verifies a JWT token produced by either login or SIWX flows
   * - If payload contains `_id`, fetch by profile id (classic login)
   * - If payload contains `address`, fetch by wallet address (SIWX)
   */
  async verifyToken(token: string): Promise<IProfile> {
    try {
      const payload: any = this.jwtService.verify(token);

      if (payload && payload._id) {
        const user = await this.profileService.get(payload._id);
        if (!user) {
          throw new UnauthorizedException("User not found");
        }
        return user;
      }

      if (payload && payload.address) {
        const user = await this.profileService.getByWalletAddress(
          payload.address
        );
        if (!user) {
          throw new UnauthorizedException("User not found for wallet");
        }
        return user;
      }

      throw new UnauthorizedException("Unsupported token payload");
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  /**
   * Verifies an admin JWT token and validates admin role
   * @param {string} token JWT token to verify
   * @returns {Promise<IProfile>} admin profile with validated role
   */
  async verifyAdminToken(token: string): Promise<IProfile> {
    try {
      const payload: any = this.jwtService.verify(token);

      if (payload && payload._id) {
        const user = await this.profileService.get(payload._id);
        if (!user) {
          throw new UnauthorizedException("Admin user not found");
        }

        // Verify that the user has an admin role
        try {
          const role = await this.rolesService.get(user.roleId.toString());

          if (!role || role.name !== "ADMIN" || !role.isActive) {
            throw new UnauthorizedException(
              "Access denied. Admin privileges required."
            );
          }
        } catch (error) {
          throw new UnauthorizedException(
            "Access denied. Admin privileges required."
          );
        }

        return user;
      }

      if (payload && payload.address) {
        const user = await this.profileService.getByWalletAddress(
          payload.address
        );
        if (!user) {
          throw new UnauthorizedException("Admin user not found for wallet");
        }

        // Verify that the user has an admin role
        try {
          const role = await this.rolesService.get(user.roleId.toString());

          if (!role || role.name !== "ADMIN" || !role.isActive) {
            throw new UnauthorizedException(
              "Access denied. Admin privileges required."
            );
          }
        } catch (error) {
          throw new UnauthorizedException(
            "Access denied. Admin privileges required."
          );
        }

        return user;
      }

      throw new UnauthorizedException("Unsupported admin token payload");
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired admin token");
    }
  }

  /**
   * Decodes token without throwing on expiration (for logout flows)
   */
  decodeToken(token: string): any {
    try {
      return this.jwtService.decode(token);
    } catch {
      return null;
    }
  }
}
