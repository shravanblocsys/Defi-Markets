# SIWX (Sign In With X) Implementation

This document describes the implementation of SIWX (Sign In With X) authentication for the DeFi Markets Backend. SIWX enables decentralized applications to authenticate users seamlessly across multiple blockchain networks.

## Overview

The SIWX implementation provides backend services for:
- Message creation for wallet signing
- Signature verification for multiple blockchain networks
- Session management and storage
- JWT token generation and validation

## Architecture

### Components

1. **SiwxModule** - Main module that orchestrates all SIWX functionality
2. **SiwxService** - Core service handling business logic
3. **SiwxVerifierService** - Handles cryptographic signature verification
4. **SiwxStorageService** - Manages session storage and persistence
5. **SiwxController** - REST API endpoints for SIWX operations

### Supported Networks

- **EIP-155 Networks**: Ethereum, Polygon, BSC, etc.
- **Solana**: Placeholder implementation (requires @solana/web3.js)

## API Endpoints

### 1. Create SIWX Message
```
POST /api/siwx/create-message
```

Creates a message for the user to sign with their wallet.

**Request Body:**
```json
{
  "domain": "your-app.com",
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "statement": "Sign in to access the DeFi Markets platform",
  "uri": "https://your-app.com",
  "version": "1",
  "chainId": "eip155:1",
  "nonce": "random-nonce-string"
}
```

**Response:**
```json
{
  "message": {
    "domain": "your-app.com",
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "statement": "Sign in to access the DeFi Markets platform",
    "uri": "https://your-app.com",
    "version": "1",
    "chainId": "eip155:1",
    "nonce": "random-nonce-string",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expirationTime": "2024-01-02T00:00:00.000Z"
  }
}
```

### 2. Verify Signature
```
POST /api/siwx/verify
```

Verifies the signed message and creates a session.

**Request Body:**
```json
{
  "message": {
    "domain": "your-app.com",
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "statement": "Sign in to access the DeFi Markets platform",
    "uri": "https://your-app.com",
    "version": "1",
    "chainId": "eip155:1",
    "nonce": "random-nonce-string",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expirationTime": "2024-01-02T00:00:00.000Z"
  },
  "signature": "0x...",
  "chainId": "eip155:1",
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
}
```

**Response:**
```json
{
  "isValid": true,
  "session": {
    "id": "siwx_1234567890_abc123",
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "chainId": "eip155:1",
    "message": { ... },
    "signature": "0x...",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "isValid": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. Get Sessions
```
GET /api/siwx/sessions?chainId=eip155:1&address=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
```

Retrieves all valid sessions for a specific chain and address.

**Response:**
```json
{
  "sessions": [
    {
      "id": "siwx_1234567890_abc123",
      "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      "chainId": "eip155:1",
      "message": { ... },
      "signature": "0x...",
      "issuedAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-01-02T00:00:00.000Z",
      "isValid": true
    }
  ]
}
```

### 4. Revoke Sessions
```
DELETE /api/siwx/sessions?chainId=eip155:1&address=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
```

Revokes all sessions for a specific chain and address.

**Response:**
```json
{
  "success": true,
  "message": "Sessions revoked successfully"
}
```

### 5. Validate Token
```
GET /api/siwx/validate-token
Authorization: Bearer <jwt-token>
```

Validates a session JWT token.

**Response:**
```json
{
  "isValid": true,
  "session": {
    "id": "siwx_1234567890_abc123",
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "chainId": "eip155:1",
    "message": { ... },
    "signature": "0x...",
    "issuedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "isValid": true
  }
}
```

### 6. Get Statistics
```
GET /api/siwx/stats
```

Retrieves storage statistics (admin endpoint).

**Response:**
```json
{
  "totalSessions": 150,
  "totalAddresses": 45
}
```

### 7. Cleanup Expired Sessions
```
POST /api/siwx/cleanup
```

Cleans up expired sessions (admin endpoint).

**Response:**
```json
{
  "message": "Expired sessions cleaned up successfully"
}
```

## Frontend Integration

### Using with Reown AppKit

```typescript
import { createAppKit } from '@reown/appkit';
import { DefaultSIWX } from '@reown/appkit-siwx';

const appkit = createAppKit({
  projectId: 'your-project-id',
  networks: [
    // Your network configuration
  ],
  metadata: {
    name: 'DeFi Markets',
    description: 'DeFi Markets Platform',
    url: 'https://your-app.com',
    icons: ['https://your-app.com/icon.png']
  },
  siwx: new DefaultSIWX({
    messenger: new InformalMessenger({
      domain: 'your-app.com',
      uri: 'https://your-app.com',
      getNonce: async () => Math.round(Math.random() * 10000).toString()
    }),
    verifiers: [
      new EIP155Verifier({
        // Custom verifier that calls your backend
        verify: async (session) => {
          const response = await fetch('/api/siwx/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: session.message,
              signature: session.signature,
              chainId: session.chainId,
              address: session.address
            })
          });
          
          const result = await response.json();
          return result.isValid;
        }
      })
    ],
    storage: new LocalStorage({ key: '@defi-markets/siwx' })
  })
});
```

### Custom SIWX Implementation

```typescript
import { createAppKit, type SIWXConfig } from '@reown/appkit';

const siwx: SIWXConfig = {
  createMessage: async (input) => {
    const response = await fetch('/api/siwx/create-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    const result = await response.json();
    return result.message;
  },
  
  addSession: async (session) => {
    // Frontend stores session locally
    // Backend handles verification and storage
  },
  
  revokeSession: async (chainId, address) => {
    await fetch(`/api/siwx/sessions?chainId=${chainId}&address=${address}`, {
      method: 'DELETE'
    });
  },
  
  setSessions: async (sessions) => {
    // Frontend updates local storage
    // Backend validates and stores sessions
  },
  
  getSessions: async (chainId, address) => {
    const response = await fetch(`/api/siwx/sessions?chainId=${chainId}&address=${address}`);
    const result = await response.json();
    return result.sessions;
  },
  
  getRequired: () => false,
  signOutOnDisconnect: true
};

createAppKit({
  // ... your configuration
  siwx
});
```

## Security Considerations

### Backend Security
1. **Signature Verification**: All signatures are cryptographically verified on the backend
2. **Message Validation**: Messages are validated for structure, expiration, and authenticity
3. **Session Management**: Sessions are stored securely with expiration times
4. **JWT Tokens**: JWT tokens are signed with a secret key and have expiration times

### Frontend Security
1. **Message Integrity**: Messages are created on the backend to prevent tampering
2. **Nonce Generation**: Unique nonces prevent replay attacks
3. **Session Validation**: Frontend validates session tokens before making authenticated requests

## Configuration

### Environment Variables
```env
# JWT Configuration
WEBTOKEN_SECRET_KEY=your-secret-key
WEBTOKEN_EXPIRATION_TIME=86400

# Database Configuration (if using database storage)
DB_URL=mongodb://localhost:27017/defi-markets
```

### Session Storage
The current implementation uses in-memory storage. For production, consider:
1. **Database Storage**: Implement database-based session storage
2. **Redis Storage**: Use Redis for high-performance session management
3. **Distributed Storage**: For multi-instance deployments

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "statusCode": 400,
  "message": "Failed to create SIWX message",
  "error": "Bad Request"
}
```

**401 Unauthorized**
```json
{
  "statusCode": 401,
  "message": "Invalid signature",
  "error": "Unauthorized"
}
```

## Testing

### Manual Testing
1. Create a message using the `/api/siwx/create-message` endpoint
2. Sign the message with a wallet (MetaMask, etc.)
3. Verify the signature using the `/api/siwx/verify` endpoint
4. Use the returned JWT token for authenticated requests

### Automated Testing
```typescript
describe('SIWX Authentication', () => {
  it('should create a SIWX message', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/siwx/create-message')
      .send({
        domain: 'test.com',
        address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        statement: 'Test message',
        uri: 'https://test.com',
        version: '1',
        chainId: 'eip155:1',
        nonce: 'test-nonce'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.message).toBeDefined();
  });
});
```

## Production Considerations

1. **Rate Limiting**: Implement rate limiting on SIWX endpoints
2. **Monitoring**: Add logging and monitoring for SIWX operations
3. **Backup**: Implement session backup and recovery mechanisms
4. **Scaling**: Consider horizontal scaling for high-traffic applications
5. **Security Audits**: Regular security audits of the SIWX implementation

## Troubleshooting

### Common Issues

1. **Invalid Signature**: Ensure the message format matches the expected SIWX standard
2. **Expired Sessions**: Check session expiration times and implement cleanup
3. **Network Issues**: Verify chain ID format and network connectivity
4. **JWT Errors**: Check JWT secret configuration and token expiration

### Debug Mode
Enable debug logging by setting the log level to 'debug' in your Winston configuration.

## Support

For issues and questions:
1. Check the API documentation at `/api-docs`
2. Review the error logs
3. Test with the provided endpoints
4. Contact the development team
