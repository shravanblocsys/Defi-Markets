import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response, NextFunction } from "express";
import { ConfigService } from "../../modules/config/config.service";
import { ProfileService } from "../../modules/profile/profile.service";

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly jwtService: JwtService;

  constructor(
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    jwtService: JwtService
  ) {
    this.jwtService = jwtService;
  }

  private isWhitelisted(path: string): boolean {
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    const exactAllowed = new Set<string>([
      // Login/Register
      "api/v1/auth/login",
      "api/v1/auth/register",
      "api/v1/auth/admin/login",
      // Twitter OAuth
      "api/v1/auth/twitter",
      "api/v1/auth/twitter/callback",
      // SIWX public endpoints only
      "api/v1/user/create-nonce",
      "api/v1/user/create-message",
      "api/v1/user/verify",
      "api/v1/user/verify-payload",
      // Health and docs
      "api/health",
      "api/docs",
      //helius webhook
      "helius-stream/webhook",
    ]);
    if (exactAllowed.has(normalized)) return true;
    // Swagger docs allow list - handles exact match and all paths starting with api/docs/
    if (normalized === "api/docs" || normalized.startsWith("api/docs/"))
      return true;
    return false;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Allow CORS preflight requests to pass through without auth
    if (req.method === "OPTIONS") {
      return next();
    }
    const path = req.path || req.url || "";
    if (this.isWhitelisted(path)) {
      return next();
    }

    const authHeader = req.headers["authorization"] as string | undefined;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.slice(7);
    try {
      const payload: any = this.jwtService.verify(token);

      let user = null;
      if (payload && payload._id) {
        user = await this.profileService.get(payload._id);
      } else if (payload && payload.address) {
        user = await this.profileService.getByWalletAddress(payload.address);
      }

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // attach to request for downstream handlers
      (req as any).user = user;
      return next();
    } catch (err) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
