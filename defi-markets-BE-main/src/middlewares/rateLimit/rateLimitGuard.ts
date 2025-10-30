import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY } from "./rateLimit.decorator";
import { ConfigService } from "../../modules/config/config.service";

/**
 * In-memory store for rate limiting
 * In production, consider using Redis for distributed rate limiting
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();

  constructor(
    private reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rateLimitConfig = this.reflector.get<{
      maxRequests: number;
      timeWindow: number;
    }>(RATE_LIMIT_KEY, context.getHandler());

    // If no specific rate limit is configured, use environment defaults
    if (!rateLimitConfig) {
      const defaultMaxRequests = parseInt(
        this.configService.get("RATE_LIMIT_REQ_COUNT") || "10"
      );
      const defaultTimeWindow = parseInt(
        this.configService.get("RATE_LIMIT_TIME_WINDOW") || "1000"
      );

      // Apply default rate limiting
      return this.applyRateLimit(
        context,
        defaultMaxRequests,
        defaultTimeWindow
      );
    }

    return this.applyRateLimit(
      context,
      rateLimitConfig.maxRequests,
      rateLimitConfig.timeWindow
    );
  }

  private applyRateLimit(
    context: ExecutionContext,
    maxRequests: number,
    timeWindow: number
  ): boolean {
    const request = context.switchToHttp().getRequest();
    const clientId = this.getClientIdentifier(request);
    const now = Date.now();

    // Clean up expired entries periodically
    this.cleanupExpiredEntries(now);

    const entry = this.rateLimitStore.get(clientId);

    if (!entry) {
      // First request from this client
      this.rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + timeWindow,
      });
      return true;
    }

    if (now > entry.resetTime) {
      // Time window has expired, reset the counter
      this.rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + timeWindow,
      });
      return true;
    }

    if (entry.count >= maxRequests) {
      // Rate limit exceeded
      this.logger.warn(`Rate limit exceeded for client: ${clientId}`, {
        clientId,
        count: entry.count,
        maxRequests: maxRequests,
        timeWindow: timeWindow,
        resetTime: new Date(entry.resetTime).toISOString(),
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Increment the counter
    entry.count++;
    this.rateLimitStore.set(clientId, entry);

    return true;
  }

  /**
   * Get a unique identifier for the client
   * Uses IP address + endpoint path as the identifier for endpoint-specific rate limiting
   */
  private getClientIdentifier(request: any): string {
    // Try to get IP from various headers (for load balancers/proxies)
    const forwardedFor = request.headers["x-forwarded-for"];
    const realIp = request.headers["x-real-ip"];
    const cfConnectingIp = request.headers["cf-connecting-ip"];

    let ip = request.ip || request.connection?.remoteAddress;

    if (forwardedFor) {
      ip = forwardedFor.split(",")[0].trim();
    } else if (realIp) {
      ip = realIp;
    } else if (cfConnectingIp) {
      ip = cfConnectingIp;
    }

    // Fallback to a default identifier if IP is not available
    const clientIp = ip || "unknown";

    // Include endpoint path to create endpoint-specific rate limiting
    const endpointPath = request.url || request.path || "";

    return `${clientIp}:${endpointPath}`;
  }

  /**
   * Clean up expired entries to prevent memory leaks
   */
  private cleanupExpiredEntries(now: number): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.rateLimitStore.delete(key));
  }
}
