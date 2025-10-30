import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

/**
 * Rate limiting decorator for controlling request frequency
 * @param maxRequests Maximum number of requests allowed
 * @param timeWindow Time window in milliseconds
 */
export const RateLimit = (maxRequests: number, timeWindow: number) =>
  SetMetadata(RATE_LIMIT_KEY, { maxRequests, timeWindow });
