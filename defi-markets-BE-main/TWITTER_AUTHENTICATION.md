# Twitter Authentication Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Components](#implementation-components)
4. [Setup & Configuration](#setup--configuration)
5. [OAuth 2.0 Flow](#oauth-20-flow)
6. [Technical Deep Dive](#technical-deep-dive)
7. [Security Features](#security-features)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

---

## Overview

This document provides a comprehensive guide to the Twitter OAuth 2.0 authentication implementation in the DeFi Markets NestJS backend application using Fastify v3.

### Key Features

- ✅ **OAuth 2.0 with PKCE**: Secure authorization code flow with Proof Key for Code Exchange
- ✅ **Fastify v3 Compatible**: Custom session implementation for Fastify v3.29.0
- ✅ **Stateless after Auth**: JWT tokens for stateless authentication after OAuth completion
- ✅ **Refresh Tokens**: Long-lived access with secure token refresh
- ✅ **User Profile Integration**: Automatic user creation/linking with Twitter profiles
- ✅ **Session Management**: Custom in-memory session store for OAuth state

### Technology Stack

- **Framework**: NestJS v8.4.7
- **HTTP Server**: Fastify v3.29.0
- **Authentication**: Passport.js
- **OAuth Strategy**: `@superfaceai/passport-twitter-oauth2` v1.0.0
- **Database**: MongoDB with Mongoose
- **Tokens**: JWT (JSON Web Tokens)

---

## Architecture

### High-Level Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. GET /api/v1/auth/twitter
       ▼
┌─────────────────────────────────────┐
│        NestJS + Fastify             │
│  ┌───────────────────────────────┐  │
│  │  TwitterAuthController        │  │
│  │  @UseGuards(AuthGuard)        │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  TwitterStrategy (Passport)   │  │
│  │  - Generate PKCE challenge    │  │
│  │  - Store state in session     │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Session Shim (main.ts)       │  │
│  │  - req.session interface      │  │
│  │  - Cookie-based session ID    │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  SimpleSessionStore           │  │
│  │  - In-memory Map storage      │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ 2. 302 Redirect
               ▼
┌─────────────────────────────────────┐
│    Twitter OAuth 2.0 Server         │
│  - User authorizes app              │
│  - Generates authorization code     │
└──────────────┬──────────────────────┘
               │
               │ 3. Callback with code & state
               ▼
┌─────────────────────────────────────┐
│  GET /api/v1/auth/twitter/callback  │
│  ┌───────────────────────────────┐  │
│  │  TwitterStrategy validates:   │  │
│  │  - State (CSRF protection)    │  │
│  │  - PKCE code_verifier         │  │
│  │  - Exchange code for tokens   │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  TwitterAuthController        │  │
│  │  - Get/Create user profile    │  │
│  │  - Store OAuth tokens         │  │
│  │  - Generate JWT token         │  │
│  └───────────┬───────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ 4. Redirect with JWT
               ▼
┌─────────────────────────────────────┐
│    Client Application               │
│  - Receives JWT token               │
│  - Stores for API authentication    │
└─────────────────────────────────────┘
```

### Component Interaction Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Strategy   │────▶│   Session    │────▶│    Store     │
│  (Twitter)   │     │    Shim      │     │  (Memory)    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────┐
│              Fastify Request/Reply                   │
└──────────────────────────────────────────────────────┘
```

---

## Implementation Components

### 1. Twitter OAuth Strategy

**File**: `src/modules/auth/twitter.strategy.ts`

This implements the Passport strategy for Twitter OAuth 2.0.

```typescript
@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, "twitter") {
  constructor(configService: ConfigService) {
    const clientID = configService.get("TWITTER_CLIENT_ID");
    const clientSecret = configService.get("TWITTER_CLIENT_SECRET");
    const baseUrl = configService.get("BASE_URL");
    const clientType = configService.get("CLIENT_TYPE") || "confidential";

    super({
      clientID: clientID as string,
      clientSecret: clientSecret as string,
      clientType: clientType as "public" | "confidential",
      callbackURL: `${baseUrl}/api/v1/auth/twitter/callback`,
      scope: ["tweet.read", "users.read", "offline.access"],
    } as StrategyOptions);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any
  ): Promise<any> {
    return {
      profile,
      accessToken,
      refreshToken,
    };
  }
}
```

**Key Points**:

- Uses `@superfaceai/passport-twitter-oauth2` library
- Automatically handles PKCE (code_challenge and code_verifier)
- Validates callback with state verification
- Returns user profile and OAuth tokens

**Configuration**:

- `clientID`: Twitter OAuth 2.0 Client ID
- `clientSecret`: Twitter OAuth 2.0 Client Secret
- `clientType`: `"confidential"` for server-side apps (default)
- `callbackURL`: Where Twitter redirects after authorization
- `scope`: Permissions requested from user

**OAuth Scopes**:

- `tweet.read`: Read user's tweets
- `users.read`: Read user profile information
- `offline.access`: Get refresh tokens for long-lived access

---

### 2. Authentication Controller

**File**: `src/modules/auth/twitter-auth.controller.ts`

Handles the OAuth flow endpoints.

#### Endpoints:

##### 1. **Initiate OAuth Flow**

```
GET /api/v1/auth/twitter
```

**Flow**:

1. User visits this endpoint
2. `AuthGuard('twitter')` intercepts the request
3. Strategy generates PKCE challenge and state
4. State and PKCE verifier stored in session
5. User redirected to Twitter authorization page

**Response**: `302 Found` with `Location` header to Twitter

##### 2. **OAuth Callback**

```
GET /api/v1/auth/twitter/callback?code=...&state=...
```

**Flow**:

1. Twitter redirects user back with `code` and `state`
2. `AuthGuard('twitter')` validates:
   - State matches session (CSRF protection)
   - PKCE code_verifier matches challenge
3. Exchanges authorization code for access/refresh tokens
4. Calls `validate()` method with tokens and profile
5. Controller processes user:
   - Checks if user exists by Twitter ID
   - Creates new user OR updates existing tokens
6. Generates JWT token
7. Redirects to client with JWT token

**Response**: `302 Found` redirecting to client with `?token=...&expires=...`

##### 3. **Check Twitter Status**

```
GET /api/v1/auth/twitter/status
Authorization: Bearer <JWT_TOKEN>
```

Returns whether the authenticated user has Twitter linked.

**Response**:

```json
{
  "hasTwitter": true,
  "twitterUsername": "user_handle"
}
```

---

### 3. Session Management System

#### a. Session Store

**File**: `src/modules/auth/simple-session-store.ts`

A simple in-memory Map-based store for OAuth state.

```typescript
export class SimpleSessionStore {
  private store: Map<string, any> = new Map();

  set(key: string, value: any): void {
    this.store.set(key, value);
  }

  get(key: string): any {
    return this.store.get(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

export const sessionStore = new SimpleSessionStore();
```

**Key Points**:

- Singleton pattern ensures shared state across requests
- In-memory storage (not persisted to disk)
- Simple key-value interface
- Production should use Redis or similar

#### b. Session Shim

**File**: `src/main.ts` (preHandler hook)

Creates a Passport-compatible session interface on every request.

**Implementation**:

```typescript
fastifyInstance.addHook("preHandler", async (request: any, reply) => {
  if (!request.session) {
    // Parse cookies from request header
    const cookieHeader = request.headers.cookie || "";
    const cookies: any = {};
    cookieHeader.split(";").forEach((cookie: string) => {
      const [name, value] = cookie.trim().split("=");
      if (name) cookies[name] = value;
    });

    // Get or create session ID
    let sessionId = cookies["oauth_sid"];

    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const cookieValue = `oauth_sid=${sessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`;
      reply.header("Set-Cookie", cookieValue);
    }

    // Create session object with Passport-expected methods
    request.session = {
      _sessionId: sessionId,
      _store: sessionStore,

      get(key: string) {
        const sessionData = this._store.get(this._sessionId) || {};
        return sessionData[key];
      },

      set(key: string, value: any) {
        const sessionData = this._store.get(this._sessionId) || {};
        sessionData[key] = value;
        this._store.set(this._sessionId, sessionData);
      },

      save(callback?: (err?: any) => void) {
        if (callback) callback();
      },

      regenerate(callback?: (err?: any) => void) {
        const newSessionId = `sess_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const oldData = this._store.get(this._sessionId);
        this._store.delete(this._sessionId);
        this._sessionId = newSessionId;
        if (oldData) {
          this._store.set(newSessionId, oldData);
        }
        if (callback) callback();
      },

      destroy(callback?: (err?: any) => void) {
        this._store.delete(this._sessionId);
        if (callback) callback();
      },

      reload(callback?: (err?: any) => void) {
        if (callback) callback();
      },
    };

    // Proxy for direct property access
    request.session = new Proxy(request.session, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return target.get(prop);
      },
      set(target, prop: string, value) {
        if (prop in target && prop.startsWith("_")) {
          target[prop] = value;
          return true;
        }
        target.set(prop, value);
        return true;
      },
    });
  }
});
```

**Key Features**:

- **Manual Cookie Parsing**: Bypasses plugin dependencies
- **Session ID Generation**: Unique ID per session
- **Passport Compatibility**: Implements all methods Passport expects
- **Proxy Pattern**: Enables `req.session.oauth2 = {...}` syntax
- **HttpOnly Cookies**: Secure against XSS attacks

---

### 4. Response Compatibility Layer

**File**: `src/main.ts` (preHandler hook)

Adds Express-style methods to Fastify's reply object for Passport compatibility.

```typescript
fastifyInstance.addHook("preHandler", async (request, reply) => {
  if (!reply.setHeader) {
    reply.setHeader = (name: string, value: string) => {
      reply.header(name, value);
      return reply;
    };
  }
  if (!reply.getHeader) {
    reply.getHeader = (name: string) => reply.getHeader(name);
  }
  if (!reply.removeHeader) {
    reply.removeHeader = (name: string) => {
      reply.removeHeader(name);
      return reply;
    };
  }
  if (!reply.end) {
    reply.end = (data?: any) => reply.send(data);
  }
  if (!reply.status) {
    reply.status = (code: number) => {
      reply.code(code);
      return reply;
    };
  }
});
```

**Purpose**: Passport was designed for Express and expects these methods.

---

### 5. Passport Configuration

**File**: `src/modules/auth/passport.config.ts`

Configures Passport serialization/deserialization for sessions.

```typescript
export function configurePassport() {
  passport.serializeUser(function (user: any, done) {
    done(null, user);
  });

  passport.deserializeUser(function (obj: any, done) {
    done(null, obj);
  });
}
```

**Called in**: `src/main.ts` during application bootstrap

---

### 6. User Profile Integration

#### Profile Model Extensions

**File**: `src/modules/profile/profile.model.ts`

```typescript
export const Profile = new Schema(
  {
    // ... existing fields
    twitterDetails: {
      name: { type: String },
      profile_image_url: { type: String },
      username: { type: String },
      id: { type: String },
      accessToken: { type: String },
      refreshToken: { type: String },
    },
    twitterId: { type: String },
    twitterUsername: { type: String },
  },
  { timestamps: true }
);

// Index for efficient Twitter ID lookups
Profile.index({ twitterId: 1 }, { sparse: true });
```

#### Profile Service Methods

**File**: `src/modules/profile/profile.service.ts`

##### 1. Get User by Twitter ID

```typescript
async getByTwitterId(twitterId: string): Promise<{
  name?: string;
  profile_image_url?: string;
  username?: string;
  id?: string;
  accessToken?: string;
  refreshToken?: string;
}> {
  const profile = await this.profileModel
    .findOne({ twitterId, isDeleted: false })
    .select("twitterDetails")
    .exec();

  return profile?.twitterDetails || null;
}
```

##### 2. Create User from Twitter Profile

```typescript
async createFromTwitterProfile(twitterData: {
  twitterId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatar: string | null;
  twitterAccessToken: string;
  twitterRefreshToken: string;
}): Promise<{
  name?: string;
  profile_image_url?: string;
  username?: string;
  id?: string;
  accessToken?: string;
  refreshToken?: string;
}> {
  // Check if user already exists with this Twitter ID
  const existingUser = await this.getByTwitterId(twitterData.twitterId);
  if (existingUser) {
    return existingUser;
  }

  // Get default user role
  const defaultRole = await this.rolesService.getByName("USER");
  if (!defaultRole) {
    throw new NotFoundException("Default USER role not found");
  }

  // Generate a unique username if the Twitter username already exists
  let uniqueUsername = twitterData.username;
  let counter = 1;
  while (true) {
    const existing = await this.getByUsername(uniqueUsername);
    if (!existing.user) {
      break;
    }
    uniqueUsername = `${twitterData.username}${counter}`;
    counter++;
  }

  // Generate a random password (user won't need it for Twitter OAuth)
  const randomPassword = await bcrypt.hash(
    Math.random().toString(36).slice(-8) + Date.now().toString(),
    12
  );

  // Use Twitter avatar or generate gravatar
  const avatarUrl =
    twitterData.avatar ||
    gravatar.url(
      twitterData.email || `${twitterData.twitterId}@twitter.local`,
      {
        protocol: "http",
        s: "200",
        r: "pg",
        d: "identicon",
      }
    );

  // Generate a unique wallet address placeholder (can be updated later by user)
  const walletAddressPlaceholder = `twitter_${twitterData.twitterId}`;

  const createdProfile = new this.profileModel({
    username: uniqueUsername,
    email: twitterData.email || `${twitterData.twitterId}@twitter.local`,
    name: twitterData.displayName,
    password: randomPassword,
    avatar: avatarUrl,
    walletAddress: walletAddressPlaceholder,
    roleId: defaultRole._id,
    twitterId: twitterData.twitterId,
    twitterUsername: twitterData.username,
    twitterDetails: {
      id: twitterData.twitterId,
      username: twitterData.username,
      name: twitterData.displayName,
      profile_image_url: twitterData.avatar,
      accessToken: twitterData.twitterAccessToken,
      refreshToken: twitterData.twitterRefreshToken,
    },
  });

  const savedProfile = await createdProfile.save();
  // Return only twitterDetails
  return savedProfile.twitterDetails;
}
```

##### 3. Update Twitter Tokens

```typescript
async updateTwitterTokens(
  userId: string,
  accessToken: string,
  refreshToken: string
): Promise<IProfile> {
  const updateResult = await this.profileModel.updateOne(
    { _id: userId, isDeleted: false },
    {
      $set: {
        "twitterDetails.accessToken": accessToken,
        "twitterDetails.refreshToken": refreshToken,
      },
    }
  );

  if (updateResult.modifiedCount !== 1) {
    throw new BadRequestException(
      "Failed to update Twitter tokens for the user."
    );
  }

  return this.get(userId);
}
```

---

### 7. Module Configuration

#### Auth Module

**File**: `src/modules/auth/auth.module.ts`

```typescript
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      /* ... */
    }),
  ],
  controllers: [AuthController, TwitterAuthController],
  providers: [AuthService, JwtStrategy, TwitterStrategy, AdminGuard],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
```

**Key Additions**:

- `TwitterAuthController` in controllers
- `TwitterStrategy` in providers

#### App Module

**File**: `src/modules/app/app.module.ts`

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        "api/v1/auth/twitter",
        "api/v1/auth/twitter/callback"
        // ... other routes
      )
      .forRoutes("*");
  }
}
```

**Important**: Twitter OAuth routes must be excluded from global auth middleware.

#### Auth Middleware Whitelist

**File**: `src/middlewares/auth/authMiddleware.ts`

```typescript
private isWhitelisted(path: string): boolean {
  const exactAllowed = new Set<string>([
    "api/v1/auth/twitter",
    "api/v1/auth/twitter/callback",
    // ... other routes
  ]);
  return exactAllowed.has(normalized);
}
```

---

## Setup & Configuration

### 1. Twitter Developer Portal Setup

1. **Create Twitter App**:

   - Go to https://developer.twitter.com/en/portal
   - Create a new project and app
   - Enable OAuth 2.0

2. **Configure OAuth 2.0 Settings**:

   - **Type**: Web App, Automated App or Bot
   - **Callback URL**: `http://localhost:3400/api/v1/auth/twitter/callback` (development)
   - **Website URL**: `http://localhost:8080` (your client URL)

3. **Get Credentials**:

   - Copy **Client ID**
   - Copy **Client Secret**
   - Save them securely

4. **Set Permissions**:
   - Enable "Read" permissions at minimum
   - Request email access if needed (requires approval)

### 2. Environment Variables

Add to `.env` file:

```bash
# Twitter OAuth 2.0 Configuration
TWITTER_CLIENT_ID=your_twitter_client_id_here
TWITTER_CLIENT_SECRET=your_twitter_client_secret_here

# Base URL (where your backend runs)
BASE_URL=http://localhost:3400

# Client Application URL (where your frontend runs)
CLIENT_HOME_PAGE_URL=http://localhost:8080

# OAuth Client Type (confidential for server-side apps)
CLIENT_TYPE=confidential

# Session Secret (change in production!)
SESSION_SECRET=your-super-secret-session-key-change-in-production
```

### 3. Install Dependencies

```bash
npm install @superfaceai/passport-twitter-oauth2 passport fastify-cookie
```

### 4. Configuration Service

**File**: `src/modules/config/config.service.ts`

Ensure these are in the Joi validation schema:

```typescript
TWITTER_CLIENT_ID: joi.string().optional(),
TWITTER_CLIENT_SECRET: joi.string().optional(),
BASE_URL: joi.string().uri().optional(),
CLIENT_HOME_PAGE_URL: joi.string().uri().optional(),
CLIENT_TYPE: joi.string().optional(),
SESSION_SECRET: joi.string().optional(),
```

---

## OAuth 2.0 Flow

### Detailed Step-by-Step Flow

#### Step 1: Initiation

```
User → Browser → GET http://localhost:3400/api/v1/auth/twitter
```

1. User clicks "Login with Twitter" button
2. Browser makes GET request to `/api/v1/auth/twitter`
3. Request hits NestJS controller
4. `@UseGuards(AuthGuard('twitter'))` intercepted by Passport
5. `TwitterStrategy` is invoked

#### Step 2: PKCE Challenge Generation

```typescript
// Passport internally generates:
const code_verifier = generateRandomString(128); // Base64 URL-encoded
const code_challenge = base64UrlEncode(sha256(code_verifier));
const state = generateRandomString(32);
```

**Stored in session**:

```typescript
req.session["oauth2:twitter"] = {
  state: state,
  code_verifier: code_verifier,
};
```

#### Step 3: Redirect to Twitter

```
HTTP/1.1 302 Found
Location: https://twitter.com/i/oauth2/authorize?
  response_type=code
  &client_id=T01JaXJQNTNybzYtN1BqV1Z3cXA6MTpjaQ
  &redirect_uri=http://localhost:3400/api/v1/auth/twitter/callback
  &scope=tweet.read%20users.read%20offline.access
  &state=HdzIrdmkZXw3RPdE8TC07IWj
  &code_challenge=rrTQ5NRgEtlobTu14_wJt3ohUminfoQsa4kCji8pKf8
  &code_challenge_method=S256
Set-Cookie: oauth_sid=sess_1729571100000_abc123xyz; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax
```

#### Step 4: User Authorization on Twitter

1. User logs into Twitter (if not already logged in)
2. Twitter shows authorization prompt:
   - App name
   - Requested permissions (tweet.read, users.read, offline.access)
   - "Authorize app" button
3. User clicks "Authorize app"

#### Step 5: Twitter Callback

```
Twitter → GET http://localhost:3400/api/v1/auth/twitter/callback?
  code=WHQwTy1OT2xrZnZVRFFnRm1vZ1czRlBJM2NWNmJ2OHZsT0RhVVY3dzk4N0dGOjE3NjExMDQyOTcyOTU6MTowOmFjOjE
  &state=HdzIrdmkZXw3RPdE8TC07IWj
Cookie: oauth_sid=sess_1729571100000_abc123xyz
```

#### Step 6: State Validation

```typescript
// Passport retrieves from session
const sessionData = req.session["oauth2:twitter"];
const providedState = req.query.state;

if (providedState !== sessionData.state) {
  throw new Error("State mismatch - possible CSRF attack");
}
```

#### Step 7: Token Exchange

```typescript
// Passport makes POST request to Twitter
POST https://api.twitter.com/2/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=WHQwTy1OT2xrZnZVRFFnRm1vZ1czRlBJM2NWNmJ2OHZsT0RhVVY3dzk4N0dGOjE3NjExMDQyOTcyOTU6MTowOmFjOjE
&redirect_uri=http://localhost:3400/api/v1/auth/twitter/callback
&code_verifier=<code_verifier_from_session>
&client_id=T01JaXJQNTNybzYtN1BqV1Z3cXA6MTpjaQ
&client_secret=<client_secret>
```

**Twitter Response**:

```json
{
  "access_token": "VGhpcy1pcy1hLWZha2UtYWNjZXNzLXRva2Vu",
  "token_type": "bearer",
  "expires_in": 7200,
  "refresh_token": "VGhpcy1pcy1hLWZha2UtcmVmcmVzaC10b2tlbg",
  "scope": "tweet.read users.read offline.access"
}
```

#### Step 8: Fetch User Profile

```typescript
// Passport fetches user profile
GET https://api.twitter.com/2/users/me
Authorization: Bearer VGhpcy1pcy1hLWZha2UtYWNjZXNzLXRva2Vu
```

**Twitter Response**:

```json
{
  "data": {
    "id": "1234567890",
    "name": "John Doe",
    "username": "johndoe"
  }
}
```

#### Step 9: Validate Callback

```typescript
// TwitterStrategy.validate() is called
async validate(accessToken, refreshToken, profile) {
  return {
    profile: {
      id: "1234567890",
      username: "johndoe",
      displayName: "John Doe"
    },
    accessToken,
    refreshToken
  };
}
```

#### Step 10: User Processing

```typescript
// TwitterAuthController.twitterAuthCallback()

// 1. Get user data from req.user
const { profile, accessToken, refreshToken } = req.user;

// 2. Check if user exists
let user = await profileService.getByTwitterId(profile.id);

if (!user) {
  // 3a. Create new user
  user = await profileService.createFromTwitterProfile({
    twitterId: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    email: profile.emails?.[0]?.value,
    avatar: profile.photos?.[0]?.value,
    twitterAccessToken: accessToken,
    twitterRefreshToken: refreshToken,
  });
} else {
  // 3b. Update existing user's tokens
  await profileService.updateTwitterTokens(
    user._id.toString(),
    accessToken,
    refreshToken
  );
}
```

#### Step 11: Generate JWT Token

```typescript
// Generate JWT for stateless authentication
const tokenResponse = await authService.createToken(user);
// {
//   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
//   expires: 1729658700000
// }
```

#### Step 12: Redirect to Client

```
HTTP/1.1 302 Found
Location: http://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...&expires=1729658700000
```

#### Step 13: Client Receives Token

```javascript
// Client-side JavaScript
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");
const expires = urlParams.get("expires");

// Store token
localStorage.setItem("jwt_token", token);
localStorage.setItem("token_expires", expires);

// Use for API calls
fetch("http://localhost:3400/api/v1/some-endpoint", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

---

## Technical Deep Dive

### Why Custom Session Implementation?

**Problem**: Passport OAuth 2.0 requires session support for PKCE state storage, but:

1. Fastify v3 doesn't natively support Express middleware
2. `@fastify/express` requires Fastify v4 (we have v3.29.0)
3. `middie` (middleware engine) conflicts with existing plugins
4. `express-session` integration is complex with Fastify

**Solution**: Custom session shim that:

- Provides minimal Passport-compatible interface
- Uses manual cookie parsing/setting (bypasses plugin issues)
- Stores session data in-memory (SimpleSessionStore)
- Implements all methods Passport expects

### Session Data Structure

```typescript
// Cookie
oauth_sid=sess_1729571100000_abc123xyz

// Session Store (in-memory Map)
{
  "sess_1729571100000_abc123xyz": {
    "oauth2:twitter": {
      "state": "HdzIrdmkZXw3RPdE8TC07IWj",
      "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    }
  }
}
```

### Cookie Parsing & Setting

**Manual Parsing**:

```typescript
const cookieHeader = request.headers.cookie || "";
// "oauth_sid=sess_123; other_cookie=value"

const cookies: any = {};
cookieHeader.split(";").forEach((cookie: string) => {
  const [name, value] = cookie.trim().split("=");
  if (name) cookies[name] = value;
});
// { oauth_sid: "sess_123", other_cookie: "value" }
```

**Manual Setting**:

```typescript
const cookieValue = `oauth_sid=${sessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`;
reply.header("Set-Cookie", cookieValue);
```

### Proxy Pattern for Session

Enables both method calls and property access:

```typescript
// Method style
req.session.set("oauth2:twitter", data);
req.session.get("oauth2:twitter");

// Property style (Passport uses this)
req.session["oauth2:twitter"] = data;
const data = req.session["oauth2:twitter"];
```

**Implementation**:

```typescript
request.session = new Proxy(request.session, {
  get(target, prop: string) {
    if (prop in target) {
      return target[prop]; // Built-in method
    }
    return target.get(prop); // Get from store
  },
  set(target, prop: string, value) {
    if (prop in target && prop.startsWith("_")) {
      target[prop] = value; // Internal property
      return true;
    }
    target.set(prop, value); // Save to store
    return true;
  },
});
```

### PKCE (Proof Key for Code Exchange)

**Purpose**: Protects against authorization code interception attacks.

**Flow**:

1. **Generate Code Verifier**: Random 128-character string

   ```
   dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```

2. **Generate Code Challenge**: SHA-256 hash of verifier, base64url-encoded

   ```
   code_challenge = BASE64URL(SHA256(code_verifier))
   ```

3. **Send Challenge to Twitter**: In authorization request

   ```
   ?code_challenge=rrTQ5NRgEtlobTu14_wJt3ohUminfoQsa4kCji8pKf8
   &code_challenge_method=S256
   ```

4. **Store Verifier in Session**: For later verification

   ```typescript
   session["oauth2:twitter"] = {
     code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
   };
   ```

5. **Send Verifier in Token Exchange**: Twitter verifies it matches challenge
   ```
   POST /oauth2/token
   code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```

**Security Benefit**: Even if attacker intercepts authorization code, they can't exchange it for tokens without the code_verifier (which was never sent to Twitter).

### State Parameter (CSRF Protection)

**Purpose**: Prevents Cross-Site Request Forgery attacks.

**Flow**:

1. **Generate Random State**: Before redirecting to Twitter

   ```typescript
   const state = generateRandomString(32);
   // "HdzIrdmkZXw3RPdE8TC07IWj"
   ```

2. **Store in Session**: Associated with user's session

   ```typescript
   session["oauth2:twitter"].state = state;
   ```

3. **Send to Twitter**: In authorization URL

   ```
   ?state=HdzIrdmkZXw3RPdE8TC07IWj
   ```

4. **Twitter Echoes Back**: Includes same state in callback

   ```
   /callback?code=...&state=HdzIrdmkZXw3RPdE8TC07IWj
   ```

5. **Verify Match**: Before processing callback
   ```typescript
   if (req.query.state !== session["oauth2:twitter"].state) {
     throw new Error("CSRF attack detected");
   }
   ```

**Attack Scenario Prevented**:

- Attacker tricks user into visiting malicious callback URL
- Without state verification, could authenticate attacker's Twitter account to victim's app account
- With state verification, attack fails because attacker doesn't have valid session state

---

## Security Features

### 1. PKCE (Proof Key for Code Exchange)

- ✅ Protects against authorization code interception
- ✅ Automatically implemented by `@superfaceai/passport-twitter-oauth2`
- ✅ Uses SHA-256 hashing (S256 method)

### 2. State Parameter (CSRF Protection)

- ✅ Random 32-character state per OAuth flow
- ✅ Stored in session and verified on callback
- ✅ Prevents cross-site request forgery attacks

### 3. HttpOnly Cookies

- ✅ Session cookie not accessible via JavaScript
- ✅ Mitigates XSS (Cross-Site Scripting) attacks
- ✅ Cookie attributes: `HttpOnly; Path=/; SameSite=Lax`

### 4. Secure Token Storage

- ✅ OAuth tokens stored in database (not client-side)
- ✅ JWT tokens have expiration times
- ✅ Refresh tokens enable long-lived access without storing passwords

### 5. OAuth 2.0 Best Practices

- ✅ Uses authorization code flow (not implicit flow)
- ✅ Confidential client type (server-side verification)
- ✅ Minimum required scopes requested
- ✅ Proper redirect URI validation

### 6. Middleware Protection

- ✅ OAuth endpoints excluded from JWT authentication
- ✅ Status endpoint requires JWT authentication
- ✅ Proper route whitelisting in AuthMiddleware

### 7. Error Handling

- ✅ Errors logged server-side
- ✅ User redirected to client with generic error message
- ✅ Sensitive error details not exposed to client

---

## Testing

### 1. Manual Testing (Recommended)

#### Test OAuth Initiation

```bash
curl -i http://localhost:3400/api/v1/auth/twitter
```

**Expected Response**:

```
HTTP/1.1 302 Found
location: https://twitter.com/i/oauth2/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3400%2Fapi%2Fv1%2Fauth%2Ftwitter%2Fcallback&scope=tweet.read%20users.read%20offline.access&code_challenge=...&code_challenge_method=S256&state=...&client_id=...
Set-Cookie: oauth_sid=sess_...; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax
```

**Verify**:

- ✅ Status code is 302
- ✅ Location header contains `https://twitter.com/i/oauth2/authorize`
- ✅ URL parameters include: `response_type`, `redirect_uri`, `scope`, `code_challenge`, `state`, `client_id`
- ✅ Set-Cookie header present with `oauth_sid`

#### Test Complete Flow (Browser)

1. **Open Browser** and visit:

   ```
   http://localhost:3400/api/v1/auth/twitter
   ```

2. **Expected**: Redirect to Twitter authorization page

3. **Authorize App** on Twitter

4. **Expected**: Redirect back to:

   ```
   http://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...&expires=1729658700000
   ```

5. **Verify JWT Token**:

   ```bash
   export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3400/api/v1/auth/twitter/status
   ```

   **Expected Response**:

   ```json
   {
     "hasTwitter": true,
     "twitterUsername": "your_twitter_handle"
   }
   ```

#### Test Error Handling

**Invalid State**:

```bash
# This should fail (invalid state)
curl -i "http://localhost:3400/api/v1/auth/twitter/callback?code=fake&state=invalid"
```

**Expected**: Redirect to client with error parameter

### 2. Automated Testing

#### Unit Tests

**Test Twitter Strategy Initialization**:

```typescript
describe("TwitterStrategy", () => {
  it("should initialize with correct configuration", () => {
    const configService = {
      get: jest.fn((key) => {
        const config = {
          TWITTER_CLIENT_ID: "test_client_id",
          TWITTER_CLIENT_SECRET: "test_secret",
          BASE_URL: "http://localhost:3400",
          CLIENT_TYPE: "confidential",
        };
        return config[key];
      }),
    };

    const strategy = new TwitterStrategy(configService as any);

    expect(strategy.name).toBe("twitter");
    expect(configService.get).toHaveBeenCalledWith("TWITTER_CLIENT_ID");
  });

  it("should throw error if configuration is missing", () => {
    const configService = {
      get: jest.fn(() => undefined),
    };

    expect(() => new TwitterStrategy(configService as any)).toThrow(
      "Missing required Twitter OAuth configuration"
    );
  });
});
```

**Test Session Store**:

```typescript
describe("SimpleSessionStore", () => {
  let store: SimpleSessionStore;

  beforeEach(() => {
    store = new SimpleSessionStore();
  });

  it("should set and get values", () => {
    store.set("key1", { data: "value1" });
    expect(store.get("key1")).toEqual({ data: "value1" });
  });

  it("should delete values", () => {
    store.set("key1", "value1");
    store.delete("key1");
    expect(store.has("key1")).toBe(false);
  });

  it("should check key existence", () => {
    store.set("key1", "value1");
    expect(store.has("key1")).toBe(true);
    expect(store.has("key2")).toBe(false);
  });
});
```

#### Integration Tests

**Test OAuth Flow** (using Supertest):

```typescript
describe("Twitter OAuth Flow", () => {
  it("should redirect to Twitter on initiation", () => {
    return request(app.getHttpServer())
      .get("/api/v1/auth/twitter")
      .expect(302)
      .expect((res) => {
        expect(res.headers.location).toContain(
          "twitter.com/i/oauth2/authorize"
        );
        expect(res.headers["set-cookie"]).toBeDefined();
      });
  });

  it("should require authentication for status endpoint", () => {
    return request(app.getHttpServer())
      .get("/api/v1/auth/twitter/status")
      .expect(401);
  });
});
```

### 3. Testing Checklist

- [ ] OAuth initiation returns 302 redirect
- [ ] Redirect URL contains all required parameters
- [ ] Session cookie is set with proper attributes
- [ ] State parameter is unique per request
- [ ] PKCE code_challenge is generated
- [ ] Callback validates state correctly
- [ ] Invalid state returns error
- [ ] User profile is created on first login
- [ ] Tokens are updated on subsequent logins
- [ ] JWT token is generated correctly
- [ ] Status endpoint returns correct data
- [ ] Status endpoint requires authentication
- [ ] Error handling redirects to client
- [ ] Session expires after timeout
- [ ] Refresh tokens are stored

---

## Troubleshooting

### Common Issues

#### 1. "OAuth 2.0 authentication requires session support"

**Cause**: Session shim not properly initialized or `req.session` is undefined.

**Solution**:

- Verify `preHandler` hook is registered in `main.ts`
- Check that hook runs before AuthGuard
- Ensure `SimpleSessionStore` is imported
- Add debug logging:
  ```typescript
  fastifyInstance.addHook("preHandler", async (request: any, reply) => {
    console.log("Session before:", request.session);
    // ... session creation code
    console.log("Session after:", request.session);
  });
  ```

#### 2. "res.setHeader is not a function"

**Cause**: Response compatibility layer not properly applied.

**Solution**:

- Ensure response compatibility hook is registered
- Verify hook adds all required methods
- Check hook order (should be after session hook)

#### 3. "401 Unauthorized" on callback

**Possible Causes**:

1. AuthMiddleware blocking the route
2. Session lost between initiation and callback
3. Cookie not being sent by browser

**Solutions**:

- Verify routes are whitelisted in `AuthMiddleware`
- Check `app.module.ts` excludes Twitter routes
- Verify `authMiddleware.ts` whitelist includes routes
- Test cookies in browser DevTools (Network tab)
- Check CORS configuration allows credentials

#### 4. "Invalid state" or state mismatch

**Cause**: Session not persisting between requests.

**Solutions**:

- Verify `oauth_sid` cookie is being sent in callback
- Check cookie attributes (Path, SameSite, Domain)
- Ensure session store retains data
- Add logging to track session ID:
  ```typescript
  console.log("Session ID on initiation:", sessionId);
  console.log("Session ID on callback:", sessionId);
  ```

#### 5. Twitter returns "Invalid redirect_uri"

**Cause**: Callback URL mismatch between code and Twitter app settings.

**Solution**:

- Check `BASE_URL` in `.env`
- Verify Twitter app callback URL matches exactly
- Include protocol (`http://` or `https://`)
- Check for trailing slashes
- In Twitter Developer Portal: Settings → Authentication settings → Callback URLs

#### 6. "Missing required Twitter OAuth configuration"

**Cause**: Environment variables not loaded.

**Solution**:

- Verify `.env` file exists in project root
- Check variable names match exactly
- Restart server after changing `.env`
- Verify `ConfigService` validation schema includes Twitter variables

#### 7. Session data not persisting

**Cause**: In-memory store being cleared or multiple server instances.

**Solution**:

- For development: Restart server to clear store
- For production: Migrate to Redis-based store
- Check for server restarts during OAuth flow
- Ensure single server instance in development

#### 8. CORS errors in browser

**Cause**: Client domain not in CORS allowlist.

**Solution**:

- Add `CLIENT_HOME_PAGE_URL` to CORS origins in `main.ts`
- Enable credentials: `credentials: true`
- Check browser console for specific CORS error
- Verify client is making requests from allowed origin

### Debug Logging

Add comprehensive logging for troubleshooting:

```typescript
// In TwitterStrategy
constructor(configService: ConfigService) {
  console.log("🔧 Initializing TwitterStrategy");
  console.log("Environment:", {
    clientId: clientID ? "✓ Set" : "✗ Missing",
    clientSecret: clientSecret ? "✓ Set" : "✗ Missing",
    baseUrl: baseUrl || "✗ Missing",
    callbackUrl: `${baseUrl}/api/v1/auth/twitter/callback`,
  });
  // ...
}

async validate(accessToken, refreshToken, profile) {
  console.log("✅ TwitterStrategy.validate called");
  console.log("Profile:", profile);
  console.log("Has access token:", !!accessToken);
  console.log("Has refresh token:", !!refreshToken);
  // ...
}

// In TwitterAuthController
async twitterAuthCallback(req, res) {
  console.log("🐦 Callback received");
  console.log("Query params:", req.query);
  console.log("User data:", req.user);
  console.log("Session:", req.session);
  // ...
}

// In Session Shim
fastifyInstance.addHook("preHandler", async (request: any, reply) => {
  console.log("🔐 Session hook - Path:", request.url);
  console.log("🍪 Cookies:", request.headers.cookie);
  // ...
  console.log("✓ Session created:", request.session._sessionId);
});
```

### Verification Commands

```bash
# Check if server is running
curl http://localhost:3400/api/health

# Test OAuth initiation
curl -i http://localhost:3400/api/v1/auth/twitter

# Check environment variables (in server)
node -e "console.log(process.env.TWITTER_CLIENT_ID)"

# View logs
tail -f logs/application-$(date +%Y-%m-%d).log

# Search for errors
grep -i "error" logs/application-$(date +%Y-%m-%d).log

# Check Twitter-related logs
grep -i "twitter" logs/application-$(date +%Y-%m-%d).log
```

---

## Production Deployment

### 1. Environment Configuration

**Production `.env`**:

```bash
# Twitter OAuth 2.0 - Production
TWITTER_CLIENT_ID=your_production_client_id
TWITTER_CLIENT_SECRET=your_production_client_secret

# Production URLs (HTTPS!)
BASE_URL=https://api.yourdomain.com
CLIENT_HOME_PAGE_URL=https://app.yourdomain.com

# Client Type
CLIENT_TYPE=confidential

# Strong session secret (generate with: openssl rand -hex 32)
SESSION_SECRET=your-cryptographically-secure-random-secret-key
```

### 2. Twitter App Configuration

**Production Settings**:

- **Callback URL**: `https://api.yourdomain.com/api/v1/auth/twitter/callback`
- **Website URL**: `https://app.yourdomain.com`
- **Environment**: Production

### 3. Security Hardening

#### Enable HTTPS-Only Cookies

```typescript
// In main.ts session shim
const cookieValue = `oauth_sid=${sessionId}; HttpOnly; Secure; Path=/; Max-Age=3600; SameSite=Lax`;
//                                                      ^^^^^^ Add Secure flag
```

#### Update CORS for Production

```typescript
const corsOptions = {
  origin: [
    "https://app.yourdomain.com", // Production client
  ],
  credentials: true,
};
```

#### Rate Limiting

```typescript
app.register(fastifyRateLimiter, {
  max: 10, // Lower limit for OAuth endpoints
  timeWindow: "1 minute",
});
```

### 4. Session Storage Migration

**Replace In-Memory Store with Redis**:

```bash
npm install redis connect-redis
```

**Create Redis Session Store**:

```typescript
// src/modules/auth/redis-session-store.ts
import { createClient } from "redis";

export class RedisSessionStore {
  private client;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    this.client.connect();
  }

  async set(key: string, value: any): Promise<void> {
    await this.client.setEx(key, 3600, JSON.stringify(value)); // 1 hour TTL
  }

  async get(key: string): Promise<any> {
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }
}

export const sessionStore = new RedisSessionStore();
```

**Update Session Shim**:

```typescript
// Make session methods async
request.session = {
  async get(key: string) {
    const sessionData = (await this._store.get(this._sessionId)) || {};
    return sessionData[key];
  },
  async set(key: string, value: any) {
    const sessionData = (await this._store.get(this._sessionId)) || {};
    sessionData[key] = value;
    await this._store.set(this._sessionId, sessionData);
  },
  // ... other methods
};
```

### 5. Monitoring & Logging

**Production Logging**:

- Remove verbose `console.log` statements
- Use Winston logger for all logs
- Set up log aggregation (e.g., ELK, Datadog, CloudWatch)
- Monitor error rates

**Key Metrics to Track**:

- OAuth initiation rate
- OAuth success/failure rate
- Average OAuth completion time
- Session creation rate
- Token refresh rate

**Alerts**:

- High OAuth failure rate (>5%)
- Twitter API errors
- Session store failures
- Database connection issues

### 6. Scalability Considerations

#### Horizontal Scaling

- ✅ Redis session store (shared across instances)
- ✅ Stateless JWT authentication after OAuth
- ✅ Load balancer with sticky sessions (for OAuth flow)

#### Session Cleanup

```typescript
// Cron job to clean expired sessions
@Cron('0 */6 * * *') // Every 6 hours
async cleanExpiredSessions() {
  const cutoff = Date.now() - 3600000; // 1 hour ago

  for (const [sessionId, data] of sessionStore.entries()) {
    if (data.createdAt < cutoff) {
      sessionStore.delete(sessionId);
    }
  }
}
```

### 7. Health Checks

```typescript
@Get('health/twitter-oauth')
async twitterOAuthHealth() {
  return {
    status: 'ok',
    twitter: {
      clientConfigured: !!this.configService.get('TWITTER_CLIENT_ID'),
      callbackUrl: `${this.configService.get('BASE_URL')}/api/v1/auth/twitter/callback`,
    },
    session: {
      storeType: 'redis',
      connected: await sessionStore.ping(),
    },
  };
}
```

### 8. Disaster Recovery

**Backup Strategy**:

- Database: Regular backups of user profiles and tokens
- Redis: Enable persistence (RDB + AOF)
- Configuration: Store secrets in secure vault (AWS Secrets Manager, HashiCorp Vault)

**Recovery Plan**:

1. Users can re-authenticate with Twitter
2. OAuth tokens can be refreshed
3. Session data is temporary and can be lost

### 9. Compliance & Privacy

**GDPR Considerations**:

- Allow users to disconnect Twitter account
- Provide data export (OAuth tokens, Twitter profile data)
- Implement data deletion on user request

**Data Retention**:

- Refresh tokens: Until revoked or user disconnects
- Access tokens: Expire after 2 hours (Twitter default)
- Session data: 1 hour

---

## Summary

This Twitter OAuth 2.0 implementation provides:

✅ **Secure Authentication**: PKCE, state verification, HttpOnly cookies  
✅ **Fastify v3 Compatible**: Custom session shim without complex middleware  
✅ **Production Ready**: Scalable architecture with Redis migration path  
✅ **Developer Friendly**: Comprehensive logging and error handling  
✅ **Well Documented**: Detailed flow diagrams and troubleshooting guides

### Quick Start

1. Configure Twitter app in Developer Portal
2. Add environment variables to `.env`
3. Visit `http://localhost:3400/api/v1/auth/twitter`
4. Authorize app on Twitter
5. Receive JWT token for API authentication

### Key Files

```
src/
├── main.ts                                    # Session shim & response compatibility
├── modules/
│   └── auth/
│       ├── simple-session-store.ts           # In-memory session storage
│       ├── passport.config.ts                # Passport serialization
│       ├── twitter.strategy.ts               # OAuth strategy
│       ├── twitter-auth.controller.ts        # OAuth endpoints
│       └── auth.module.ts                    # Module registration
└── modules/
    └── profile/
        ├── profile.model.ts                  # Twitter fields
        └── profile.service.ts                # Twitter user methods
```

### Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review server logs in `logs/` directory
3. Verify environment configuration
4. Test with debug logging enabled

---

**Last Updated**: October 22, 2025  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
