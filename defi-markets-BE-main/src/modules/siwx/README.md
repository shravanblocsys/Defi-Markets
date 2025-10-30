# SIWX (Sign In With X) Authentication Module

## 📋 Overview

The SIWX module provides decentralized authentication across multiple blockchain networks using the Sign In With X (SIWX) standard. This implementation uses Reown AppKit patterns and types while maintaining a custom backend architecture for maximum control and flexibility.

## 🏗️ Architecture

### Core Components

```
src/modules/siwx/
├── siwx.controller.ts      # REST API endpoints
├── siwx.service.ts         # Business logic & Reown AppKit integration
├── siwx-storage.service.ts # Session storage management
├── siwx.module.ts          # NestJS module configuration
├── siwx.service.spec.ts    # Unit tests
├── dto/
│   └── siwx.dto.ts         # Request/response validation
└── interfaces/
    └── siwx.interface.ts   # TypeScript type definitions
```

### Storage System Architecture

The SIWX module uses a **hybrid storage approach**:

1. **In-Memory Storage** (Current Implementation)
   - Fast access for active sessions
   - Automatic cleanup of expired sessions
   - Session statistics and monitoring

2. **Database Integration** (Future Enhancement)
   - Persistent session storage
   - User profile management
   - Audit trail and analytics

## 🔧 API Endpoints

### 1. Create Nonce
```http
POST /api/siwx/create-nonce
Content-Type: application/json

{
  "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
}
```

**Response:**
```json
{
  "nonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
}
```

### 2. Create Test Signature
```http
POST /api/siwx/create-test-signature
Content-Type: application/json

{
  "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "chainId": "solana:mainnet"
}
```

**Response:**
```json
{
  "message": {
    "domain": "defi-markets.com",
    "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "statement": "Sign in to access the DeFi Markets platform",
    "uri": "https://defi-markets.com",
    "version": "1",
    "chainId": "solana:mainnet",
    "nonce": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expirationTime": "2024-01-02T00:00:00.000Z"
  },
  "signature": "mock_signature_a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456_9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "chainId": "solana:mainnet"
}
```

### 3. Verify Signature
```http
POST /api/siwx/verify
Content-Type: application/json

{
  "signature": "mock_signature_a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456_9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
}
```

**Response:**
```json
{
  "isValid": true,
  "session": {
    "id": "siwx_1756376106802_b5kcq93cg",
    "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "chainId": "solana:mainnet",
    "message": { /* message object */ },
    "signature": "mock_signature_...",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "isValid": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 4. Get Sessions
```http
GET /api/siwx/sessions?chainId=solana:mainnet&address=9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "siwx_1756376106802_b5kcq93cg",
      "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "chainId": "solana:mainnet",
      "message": { /* message object */ },
      "signature": "mock_signature_...",
      "issuedAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-01-02T00:00:00.000Z",
      "isValid": true
    }
  ]
}
```

### 5. Revoke Sessions
```http
DELETE /api/siwx/sessions?chainId=solana:mainnet&address=9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
```

**Response:**
```json
{
  "success": true,
  "message": "Sessions revoked successfully"
}
```

### 6. Validate Token
```http
GET /api/siwx/validate-token?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "id": "siwx_1756376106802_b5kcq93cg",
  "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "chainId": "solana:mainnet",
  "message": { /* message object */ },
  "signature": "mock_signature_...",
  "issuedAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": "2024-01-02T00:00:00.000Z",
  "isValid": true
}
```

### 7. Storage Statistics
```http
GET /api/siwx/stats
```

**Response:**
```json
{
  "totalSessions": 150,
  "activeSessions": 120,
  "expiredSessions": 30,
  "storageSize": "2.5MB",
  "lastCleanup": "2024-01-01T12:00:00.000Z"
}
```

### 8. Cleanup Expired Sessions
```http
POST /api/siwx/cleanup
```

**Response:**
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "removedSessions": 30
}
```

## 💾 Storage System Details

### SiwxStorageService

The storage service provides in-memory session management with the following features:

#### Core Methods

```typescript
// Add a new session
async addSession(session: SIWXSession): Promise<void>

// Get sessions for a specific chain and address
async getSessions(chainId: string, address: string): Promise<SIWXSession[]>

// Set multiple sessions (batch operation)
async setSessions(sessions: SIWXSession[]): Promise<void>

// Delete sessions for a specific chain and address
async deleteSessions(chainId: string, address: string): Promise<void>

// Get all sessions (for admin purposes)
async getAllSessions(): Promise<SIWXSession[]>

// Get storage statistics
async getStorageStats(): Promise<StorageStats>

// Clean up expired sessions
async cleanupExpiredSessions(): Promise<void>
```

#### Storage Structure

```typescript
interface StorageStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  storageSize: string;
  lastCleanup: string;
}

interface SIWXSession {
  id: string;
  address: string;
  chainId: string;
  message: SIWXMessage;
  signature: string;
  issuedAt: string;
  expiresAt: string;
  isValid: boolean;
}
```

#### Session Lifecycle

1. **Creation**: Session created with 24-hour expiration
2. **Validation**: Sessions checked for expiration on access
3. **Cleanup**: Automatic cleanup of expired sessions
4. **Revocation**: Manual session revocation by user

#### Performance Optimizations

- **In-Memory Storage**: Fast access for active sessions
- **Automatic Cleanup**: Background cleanup of expired sessions
- **Session Indexing**: Efficient lookup by chainId and address
- **Memory Management**: Automatic garbage collection

## 🔐 Security Features

### 1. Nonce Generation
- Cryptographically secure random nonces
- 32-byte hex strings for maximum entropy
- Prevents replay attacks

### 2. Session Management
- JWT token-based authentication
- Configurable expiration times
- Automatic session cleanup

### 3. Signature Verification
- Mock signature support for testing
- Extensible for real cryptographic verification
- Address extraction from signatures

### 4. User Profile Integration
- Automatic user profile creation
- Wallet address association
- Role-based access control

## 🧪 Testing

### Unit Tests
```bash
npm run test src/modules/siwx/siwx.service.spec.ts
```

### API Testing with Postman

#### Test Collection
```json
{
  "info": {
    "name": "SIWX Authentication",
    "description": "Test collection for SIWX endpoints"
  },
  "item": [
    {
      "name": "Create Nonce",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/api/siwx/create-nonce",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"address\": \"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\"\n}"
        }
      }
    },
    {
      "name": "Create Test Signature",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/api/siwx/create-test-signature",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"address\": \"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\",\n  \"chainId\": \"solana:mainnet\"\n}"
        }
      }
    },
    {
      "name": "Verify Signature",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/api/siwx/verify",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"signature\": \"mock_signature_a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456_9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\"\n}"
        }
      }
    }
  ]
}
```

## 🔄 Frontend Integration

### React Hook Example
```typescript
import { useState, useEffect } from 'react';

export function useSIWXAuth(backendUrl: string) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const signIn = async (address: string, chainId: string) => {
    setIsLoading(true);
    try {
      // Step 1: Get nonce
      const nonceResponse = await fetch(`${backendUrl}/api/siwx/create-nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const { nonce } = await nonceResponse.json();

      // Step 2: Create and sign message (using wallet)
      const message = {
        domain: 'defi-markets.com',
        address,
        statement: 'Sign in to access the DeFi Markets platform',
        uri: 'https://defi-markets.com',
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Step 3: Sign with wallet (implementation depends on wallet)
      const signature = await wallet.signMessage(message);

      // Step 4: Verify with backend
      const verifyResponse = await fetch(`${backendUrl}/api/siwx/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });

      const result = await verifyResponse.json();
      if (result.isValid) {
        setIsAuthenticated(true);
        setUser(result.session);
        localStorage.setItem('siwx_token', result.session.token);
      }
    } catch (error) {
      console.error('Sign in failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    const token = localStorage.getItem('siwx_token');
    if (token) {
      try {
        await fetch(`${backendUrl}/api/siwx/sessions`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch (error) {
        console.error('Sign out error:', error);
      }
    }
    localStorage.removeItem('siwx_token');
    setIsAuthenticated(false);
    setUser(null);
  };

  return { signIn, signOut, isAuthenticated, isLoading, user };
}
```
