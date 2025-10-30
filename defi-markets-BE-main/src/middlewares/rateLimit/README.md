# Rate Limiting Middleware

A comprehensive rate limiting solution for NestJS applications that protects your API endpoints from abuse and ensures fair usage across all clients.

## 🚀 Features

- **Environment-Based Configuration**: Configurable request limits and time windows via environment variables
- **Client Identification**: Automatic IP-based client tracking with proxy support
- **Memory Efficient**: Automatic cleanup of expired entries
- **Easy Integration**: Simple decorator-based implementation with environment variable support
- **Detailed Logging**: Comprehensive logging for monitoring and debugging
- **Flexible Setup**: Environment-specific rate limiting configuration

## 📦 Installation

The rate limiting middleware is already included in your project. No additional installation required.

## 🛠️ Quick Start

### 1. Environment Configuration

First, configure your rate limiting settings in your `.env` file:

```bash
# Rate Limiting Configuration
# Maximum number of requests allowed
RATE_LIMIT_REQ_COUNT=10

# Time window in milliseconds (e.g., 60000 = 1 minute)
RATE_LIMIT_TIME_WINDOW=60000
```

### 2. Basic Usage with Environment Variables

```typescript
import { Controller, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { RateLimit, RateLimitGuard } from "../../middlewares";

// Create a ConfigService instance to read environment variables
const configService = new ConfigService(".env");

// Resolve rate limit configuration from environment
const RATE_LIMIT_REQ_COUNT = parseInt(
  configService.get("RATE_LIMIT_REQ_COUNT")
);
const RATE_LIMIT_TIME_WINDOW = parseInt(
  configService.get("RATE_LIMIT_TIME_WINDOW")
);

@Controller("api/v1/your-endpoint")
@UseGuards(RateLimitGuard)
export class YourController {
  @Post("sensitive-operation")
  @RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
  async sensitiveOperation() {
    // Your endpoint logic here
  }
}
```

### 3. Custom Configuration (Hardcoded Values)

```typescript
// Custom: 5 requests per 30 seconds
@RateLimit(5, 30000)

// Custom: 100 requests per 5 minutes
@RateLimit(100, 300000)
```

## 📋 Environment Variable Configuration

| Variable                 | Type   | Description                        | Example            | Default  |
| ------------------------ | ------ | ---------------------------------- | ------------------ | -------- |
| `RATE_LIMIT_REQ_COUNT`   | number | Maximum number of requests allowed | `10`               | Optional |
| `RATE_LIMIT_TIME_WINDOW` | number | Time window in milliseconds        | `60000` (1 minute) | Optional |

### Environment Variable Examples

```bash
# Development environment - more lenient
RATE_LIMIT_REQ_COUNT=100
RATE_LIMIT_TIME_WINDOW=60000

# Production environment - stricter
RATE_LIMIT_REQ_COUNT=10
RATE_LIMIT_TIME_WINDOW=60000

# High-frequency endpoints
RATE_LIMIT_REQ_COUNT=5
RATE_LIMIT_TIME_WINDOW=30000

# Critical endpoints
RATE_LIMIT_REQ_COUNT=3
RATE_LIMIT_TIME_WINDOW=60000
```

## 🔧 Implementation Details

### Rate Limit Guard

The `RateLimitGuard` is responsible for enforcing rate limits:

- **Client Identification**: Uses IP address + endpoint path for endpoint-specific rate limiting
- **Sliding Window**: Implements a sliding time window for accurate rate limiting
- **Memory Management**: Automatically cleans up expired entries
- **Error Handling**: Returns HTTP 429 with detailed error information
- **Endpoint Isolation**: Each endpoint has its own rate limit counter

### Endpoint-Specific Rate Limiting

The rate limiting system creates separate counters for each endpoint:

```typescript
// Each endpoint has its own rate limit counter
Client IP: 192.168.1.100
├── /api/v1/tx-event-management/read-transaction: 5/10 requests
├── /api/v1/tx-event-management/update-fees: 3/10 requests
├── /api/v1/tx-event-management/deposit-transaction: 10/10 requests (BLOCKED)
└── /api/v1/tx-event-management/redeem-transaction: 2/10 requests
```

**Benefits:**

- ✅ If one endpoint is rate limited, other endpoints remain accessible
- ✅ Different endpoints can have different rate limits
- ✅ More granular control over API usage
- ✅ Better user experience

### Client Identification

The guard identifies clients using the following priority:

1. `X-Forwarded-For` header (for load balancers)
2. `X-Real-IP` header (for reverse proxies)
3. `CF-Connecting-IP` header (for Cloudflare)
4. Direct IP address from request
5. Fallback to 'unknown' if no IP is available

### Memory Management

- **Automatic Cleanup**: Expired entries are automatically removed
- **Efficient Storage**: Uses Map for O(1) lookup performance
- **Memory Safe**: Prevents memory leaks through periodic cleanup

## 📊 Rate Limiting Behavior

### How It Works

1. **Request Arrives**: Client makes a request to a protected endpoint
2. **Client Identification**: System identifies the client by IP address
3. **Rate Check**: System checks if client has exceeded the rate limit
4. **Decision**: Allow request or return 429 error

### Time Window Mechanics

- **Sliding Window**: The time window is sliding, not fixed
- **Reset Behavior**: Counter resets when the time window expires
- **Per-Client**: Each client has an independent rate limit counter

### Example Timeline

```
Time 0s:     Request 1 ✅ (Allowed)
Time 10s:    Request 2 ✅ (Allowed)
Time 20s:    Request 3 ✅ (Allowed)
...
Time 50s:    Request 10 ✅ (Allowed - 10th request)
Time 55s:    Request 11 ❌ (BLOCKED - exceeds limit)
Time 60s:    Request 12 ❌ (BLOCKED - still in same window)
Time 61s:    Request 13 ✅ (ALLOWED - new window starts)
```

## 🚨 Error Responses

When rate limit is exceeded, the API returns:

```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 60
}
```

- **Status Code**: `429 Too Many Requests`
- **Message**: Clear explanation of the error
- **Retry After**: Seconds until the rate limit resets

## 🔍 Monitoring and Logging

The rate limiting system provides comprehensive logging:

### Log Levels

- **Debug**: Normal request processing
- **Warn**: Rate limit exceeded (includes client details)

### Log Information

```typescript
{
  clientId: "192.168.1.100",
  count: 11,
  maxRequests: 10,
  timeWindow: 60000,
  resetTime: "2024-01-15T10:30:00.000Z"
}
```

## 🎯 Best Practices

### 1. Environment-Based Configuration

Use environment variables for flexible rate limiting configuration:

```typescript
// Load configuration from environment
const configService = new ConfigService(".env");
const RATE_LIMIT_REQ_COUNT = parseInt(configService.get("RATE_LIMIT_REQ_COUNT"));
const RATE_LIMIT_TIME_WINDOW = parseInt(configService.get("RATE_LIMIT_TIME_WINDOW"));

// Apply to endpoints
@RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
```

### 2. Environment-Specific Settings

Configure different rate limits for different environments:

```bash
# Development - More lenient for testing
RATE_LIMIT_REQ_COUNT=100
RATE_LIMIT_TIME_WINDOW=60000

# Staging - Moderate limits
RATE_LIMIT_REQ_COUNT=50
RATE_LIMIT_TIME_WINDOW=60000

# Production - Strict limits
RATE_LIMIT_REQ_COUNT=10
RATE_LIMIT_TIME_WINDOW=60000
```

### 3. Apply to Individual Endpoints (Recommended)

```typescript
@Controller("api/v1/sensitive-endpoints")
export class SensitiveController {
  @Post("endpoint-1")
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
  async endpoint1() {
    // This endpoint has its own rate limit counter
  }

  @Post("endpoint-2")
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
  async endpoint2() {
    // This endpoint has a separate rate limit counter
  }
}
```

### 4. Apply to Controller Level (All Endpoints Share Counter)

```typescript
@Controller("api/v1/sensitive-endpoints")
@UseGuards(RateLimitGuard)
export class SensitiveController {
  // All endpoints in this controller will share the same rate limit counter
  // If one endpoint is rate limited, all endpoints are blocked
}
```

### 5. Combine with Other Guards

```typescript
@Controller("api/v1/admin")
@UseGuards(AuthGuard, AdminGuard, RateLimitGuard)
export class AdminController {
  // Multiple guards work together
}
```

## 🔧 Advanced Configuration

### Custom Rate Limit Store

For production environments with multiple instances, consider implementing a Redis-based store:

```typescript
// Future enhancement: Redis-based rate limiting
interface RateLimitStore {
  get(key: string): Promise<RateLimitEntry | null>;
  set(key: string, value: RateLimitEntry): Promise<void>;
  delete(key: string): Promise<void>;
}
```

### Environment-Specific Configuration

The rate limiting system now uses environment variables for configuration, making it easy to adjust settings per environment:

```bash
# .env.development
RATE_LIMIT_REQ_COUNT=100
RATE_LIMIT_TIME_WINDOW=60000

# .env.production
RATE_LIMIT_REQ_COUNT=10
RATE_LIMIT_TIME_WINDOW=60000
```

```typescript
// In your controller
const configService = new ConfigService(".env");
const RATE_LIMIT_REQ_COUNT = parseInt(configService.get("RATE_LIMIT_REQ_COUNT"));
const RATE_LIMIT_TIME_WINDOW = parseInt(configService.get("RATE_LIMIT_TIME_WINDOW"));

@RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
```

## 🧪 Testing Rate Limits

### Manual Testing

```bash
# Test rate limiting with curl
for i in {1..15}; do
  curl -X POST http://localhost:3400/api/v1/tx-event-management/read-transaction \
    -H "Content-Type: application/json" \
    -d '{"signature": "test"}'
  echo "Request $i"
done
```

### Expected Behavior

- **Requests 1-10**: Should succeed (200 OK)
- **Requests 11-15**: Should fail (429 Too Many Requests)
- **After 1 minute**: Should succeed again

## 🚀 Production Considerations

### 1. Load Balancer Configuration

Ensure your load balancer forwards the correct IP headers:

```nginx
# Nginx configuration
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

### 2. Monitoring

Monitor rate limit violations:

```typescript
// Add to your monitoring system
if (statusCode === 429) {
  // Log to monitoring service
  monitoringService.trackRateLimitViolation(clientId, endpoint);
}
```

### 3. Scaling Considerations

- **Single Instance**: Current implementation works perfectly
- **Multiple Instances**: Consider Redis-based rate limiting for distributed systems
- **Memory Usage**: Monitor memory usage with high request volumes

## 📚 API Reference

### Environment Variables

#### `RATE_LIMIT_REQ_COUNT`

- **Type**: `number`
- **Description**: Maximum number of requests allowed within the time window
- **Example**: `10`
- **Default**: Optional (must be set in environment)

#### `RATE_LIMIT_TIME_WINDOW`

- **Type**: `number`
- **Description**: Time window in milliseconds
- **Example**: `60000` (1 minute)
- **Default**: Optional (must be set in environment)

### Decorators

#### `@RateLimit(maxRequests: number, timeWindow: number)`

Applies rate limiting to an endpoint.

**Parameters:**

- `maxRequests`: Maximum number of requests allowed
- `timeWindow`: Time window in milliseconds

**Usage with Environment Variables:**

```typescript
const configService = new ConfigService(".env");
const RATE_LIMIT_REQ_COUNT = parseInt(configService.get("RATE_LIMIT_REQ_COUNT"));
const RATE_LIMIT_TIME_WINDOW = parseInt(configService.get("RATE_LIMIT_TIME_WINDOW"));

@RateLimit(RATE_LIMIT_REQ_COUNT, RATE_LIMIT_TIME_WINDOW)
```

### Guards

#### `RateLimitGuard`

Enforces rate limiting rules.

**Features:**

- Automatic client identification
- Sliding window implementation
- Memory cleanup
- Detailed error responses
- Environment variable support

## ⚙️ Configuration Validation

The rate limiting configuration is validated through the `ConfigService` using Joi schema validation:

```typescript
// In config.service.ts
RATE_LIMIT_REQ_COUNT: joi.number().integer().min(1).optional(),
RATE_LIMIT_TIME_WINDOW: joi.number().integer().min(1000).optional(),
```

**Validation Rules:**

- `RATE_LIMIT_REQ_COUNT`: Must be a positive integer (minimum 1)
- `RATE_LIMIT_TIME_WINDOW`: Must be a positive integer (minimum 1000ms)

**Error Handling:**
If invalid values are provided, the application will throw a configuration validation error on startup.

## 🤝 Contributing

When contributing to the rate limiting middleware:

1. **Test Thoroughly**: Ensure rate limits work as expected with environment variables
2. **Consider Edge Cases**: Handle various client identification scenarios
3. **Performance**: Monitor memory usage and cleanup efficiency
4. **Documentation**: Update this README for any new features
5. **Environment Variables**: Ensure new configuration options are properly documented

## 📄 License

This rate limiting middleware is part of the DeFi Markets API project.

---

**Note**: This rate limiting implementation is designed for single-instance applications. For distributed systems, consider implementing a Redis-based rate limiting store for consistent rate limiting across multiple instances.
