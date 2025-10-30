# Domain Access Control Implementation

## Overview

This implementation restricts API access to only the authorized frontend domain `https://defimarkets.blocsys.com` and localhost for development purposes.

## Implementation Details

### 1. CORS Configuration

- **File**: `src/main.ts`
- **Changes**: Updated `app.enableCors()` to restrict origins with environment-based configuration
- **Configuration**:

  ```typescript
  // Configure CORS with specific allowed origins for security
  const corsOrigins = configService.getCorsOrigins();
  const isDev = configService.isEnv("dev");

  // Add development origins if in dev environment
  const allOrigins = isDev
    ? [
        ...corsOrigins,
        // Development origins
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/0\.0\.0\.0:\d+$/,
      ]
    : corsOrigins;

  app.enableCors({
    origin: allOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Origin",
      "Referer",
    ],
    optionsSuccessStatus: 200,
  });
  ```

- **Environment Configuration**: CORS origins can be configured via `CORS_ORIGINS` environment variable
- **Default Origins**:
  - Production: `https://defimarkets.blocsys.com`, `https://admin.defimarkets.blocsys.com`
  - Development: Includes localhost and 127.0.0.1 with any port

### 2. Domain Validation Middleware

- **File**: `src/middlewares/domainValidationMiddleware.ts`
- **Purpose**: Additional layer of security by validating Origin header
- **Allowed Origins**:
  - `https://defimarkets.blocsys.com` (production)
  - `http://localhost:3000` (development)
  - `http://localhost:3001` (development)
  - `http://127.0.0.1:3000` (development)
  - `http://127.0.0.1:3001` (development)

### 3. Middleware Integration

- **File**: `src/modules/app/app.module.ts`
- **Changes**: Added `DomainValidationMiddleware` before `AuthMiddleware`
- **Order**: Domain validation runs first, then authentication

## Security Features

1. **CORS Protection**: Browser-level protection against cross-origin requests
2. **Origin Validation**: Server-side validation of request origins
3. **Development Support**: Allows localhost for development while blocking production access
4. **Server-to-Server**: Allows requests without origin header (for internal API calls)

## Testing

Use the provided test scripts to verify CORS and domain validation:

```bash
# Test CORS configuration
node test-cors-config.js

# Test domain validation middleware
node test-domain-validation.js
```

## Configuration

### CORS Configuration

To modify allowed CORS origins, set the `CORS_ORIGINS` environment variable:

```bash
# In your .env file
CORS_ORIGINS=https://defimarkets.blocsys.com,https://admin.defimarkets.blocsys.com,https://your-custom-domain.com
```

### Domain Validation Middleware

To modify allowed domains, update the `allowedOrigins` array in `domainValidationMiddleware.ts`:

```typescript
private readonly allowedOrigins = [
  'https://defimarkets.blocsys.com',
  'https://your-new-domain.com', // Add new domains here
  // Development domains...
];
```

## Notes

- The implementation maintains all existing authentication logic
- No changes to existing business logic
- Backward compatible with existing API endpoints
- Supports both browser and server-to-server requests
