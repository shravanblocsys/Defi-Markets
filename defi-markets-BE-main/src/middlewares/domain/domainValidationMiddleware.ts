import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { ConfigService } from "../../modules/config/config.service";

@Injectable()
export class DomainValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DomainValidationMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  private getAllowedDomains(): string[] {
    const domains = this.configService.getCorsOrigins();
    this.logger.debug(`Allowed domains from config: ${JSON.stringify(domains)}`);
    return domains;
  }

  private isLocalhost(origin: string): boolean {
    // Check for localhost with any port
    return (
      origin.startsWith("http://0.0.0.0:") ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    );
  }

  private isAllowedDomain(origin: string): boolean {
    // Remove trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, "");
    const allowedDomains = this.getAllowedDomains();

    return allowedDomains.includes(normalizedOrigin);
  }

  private isAllowedReferer(referer: string): boolean {
    // Compare based on the referer's origin (scheme + host + port)
    try {
      const refererOrigin = new URL(referer).origin.replace(/\/$/, "");
      const allowedDomains = this.getAllowedDomains();

      this.logger.debug(`Checking referer origin: ${refererOrigin} against allowed domains: ${JSON.stringify(allowedDomains)}`);

      const isAllowed = allowedDomains.includes(refererOrigin) || this.isLocalhost(refererOrigin);
      
      this.logger.debug(`Referer ${referer} (origin: ${refererOrigin}) is ${isAllowed ? 'allowed' : 'blocked'}`);
      
      return isAllowed;
    } catch (error) {
      this.logger.error(`Error parsing referer URL: ${referer}`, error);
      // If referer is malformed, treat as not allowed
      return false;
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const userAgent = req.headers["user-agent"];

    // Log all request details for debugging
    this.logger.debug(
      `Request details: origin=${origin}, referer=${referer}, userAgent=${userAgent}, ip=${req.ip}, path=${req.path}`
    );

    // Debug: Log the exact comparison being made
    if (origin && referer) {
      this.logger.debug(`Processing request with both origin and referer headers`);
      this.logger.debug(`Origin: ${origin}`);
      this.logger.debug(`Referer: ${referer}`);
      this.logger.debug(`Allowed domains: ${JSON.stringify(this.getAllowedDomains())}`);
    }

    // Allow Twitter OAuth callback requests without strict domain validation
    // Twitter redirects don't include referer headers
    if (req.path === "/api/v1/auth/twitter/callback") {
      this.logger.debug(
        "Twitter OAuth callback request - allowing without domain validation"
      );
      return next();
    }

    // Allow requests without origin header (server-to-server requests, Postman, etc.)
    // BUT only if there's also no referer header
    if (!origin && !referer) {
      this.logger.debug(
        "Request without origin and referer headers - allowing (server-to-server/Postman)"
      );
      return next();
    }

    // If there's no origin but there is a referer, validate the referer
    if (!origin && referer) {
      if (this.isAllowedReferer(referer)) {
        this.logger.debug(`Referer ${referer} is allowed (no origin header)`);
        return next();
      } else {
        this.logger.warn(
          `Blocked request from unauthorized referer (no origin): ${referer}`,
          {
            origin,
            referer,
            userAgent,
            ip: req.ip,
            path: req.path,
            method: req.method,
          }
        );

        const allowedDomains = this.getAllowedDomains().join(", ");
        throw new ForbiddenException(
          `Access denied: Request referer is not authorized. Only requests from ${allowedDomains} and localhost are allowed.`
        );
      }
    }

    // Check if origin is production domain, admin domain, or localhost
    if (this.isAllowedDomain(origin) || this.isLocalhost(origin)) {
      this.logger.debug(`Origin ${origin} is allowed`);

      // If referer is present, validate it as well
      if (referer) {
        this.logger.debug(`Validating referer: ${referer} for origin: ${origin}`);
        
        if (this.isAllowedReferer(referer)) {
          this.logger.debug(`Referer ${referer} is allowed`);
          return next();
        } else {
          this.logger.warn(
            `Blocked request from unauthorized referer: ${referer}`,
            {
              origin,
              referer,
              userAgent,
              ip: req.ip,
              path: req.path,
              method: req.method,
              allowedDomains: this.getAllowedDomains(),
            }
          );

          const allowedDomains = this.getAllowedDomains().join(", ");
          throw new ForbiddenException(
            `Access denied: Request referer is not authorized. Only requests from ${allowedDomains} and localhost are allowed.`
          );
        }
      }

      this.logger.debug(`Request allowed - origin: ${origin}, no referer validation needed`);
      return next();
    }

    // Log the blocked request for security monitoring
    this.logger.warn(`Blocked request from unauthorized origin: ${origin}`, {
      origin,
      referer,
      userAgent,
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    const allowedDomains = this.getAllowedDomains().join(", ");
    throw new ForbiddenException(
      `Access denied: Request origin is not authorized. Only requests from ${allowedDomains} and localhost are allowed.`
    );
  }
}