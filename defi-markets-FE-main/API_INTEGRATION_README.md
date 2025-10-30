# API Integration Documentation

This document provides comprehensive information about all APIs integrated in the DeFi Markets frontend application.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Authentication APIs](#authentication-apis)
- [Vault Management APIs](#vault-management-apis)
- [Portfolio APIs](#portfolio-apis)
- [Wallet APIs](#wallet-apis)
- [Transaction Management APIs](#transaction-management-apis)
- [File Upload APIs](#file-upload-apis)
- [Asset Allocation APIs](#asset-allocation-apis)
- [Solana Integration](#solana-integration)
- [External Services](#external-services)

## Environment Variables

### Required Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:3001/api/v1

# Solana Program IDs
VITE_VAULT_FACTORY_PROGRAM_ID=B4hqrBAGZrMrXv5phVeNE8FMxXxH2njfjnkocQt7D1n6
VITE_ETF_VAULT_PROGRAM_ID=11111111111111111111111111111111

# Reown AppKit (WalletConnect) Project ID
VITE_PROJECT_ID=ba03ea93183ff3ca223ce73b7e08bd01
```

### Default Values

If environment variables are not set, the application uses these defaults:

- **API Base URL**: `http://localhost:3001/api/v1`
- **Vault Factory Program ID**: `B4hqrBAGZrMrXv5phVeNE8FMxXxH2njfjnkocQt7D1n6`
- **ETF Vault Program ID**: `11111111111111111111111111111111`

## Authentication APIs

### Base URL

All authentication endpoints are prefixed with the API base URL.

### Endpoints

#### 1. Legacy Login

```typescript
POST / auth / login;
```

**Parameters:**

- `address`: string - User's wallet address
- `signature`: string - Signed message signature

**Response:**

```typescript
{
  status: "success",
  data: {
    user: User,
    token: string
  }
}
```

#### 2. Create Nonce (4-Step Auth)

```typescript
POST /user/create-nonce;
```

**Parameters:**

- `address`: string - User's wallet address

**Response:**

```typescript
{
  status: "success",
  data: {
    nonce: string
  }
}
```

#### 3. Create Message (4-Step Auth)

```typescript
POST / user / create - message;
```

**Parameters:**

- `domain`: string - Application domain
- `address`: string - User's wallet address
- `statement`: string - Sign-in statement
- `uri`: string - Application URI
- `version`: string - Message version
- `chainId`: string - Blockchain chain ID
- `nonce`: string - Generated nonce

**Response:**

```typescript
{
  status: "success",
  data: {
    message: string
  }
}
```

#### 4. Verify Signature (4-Step Auth)

```typescript
POST / user / verify - payload;
```

**Parameters:**

- `message`: unknown - Message object
- `signature`: string - Base58 encoded signature
- `chainId`: string - Blockchain chain ID

**Response:**

```typescript
{
  status: "success",
  data: {
    user: User,
    token: string
  }
}
```

#### 5. Logout

```typescript
POST / auth / logout;
```

**Response:**

```typescript
{
  status: "success";
}
```

#### 6. Get Profile

```typescript
GET / auth / verify;
```

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```typescript
{
  success: boolean,
  data: {
    user?: User
  } & User
}
```

#### 7. Update Profile

```typescript
PUT / profile;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `username`: string
- `email`: string
- `name`: string
- `avatar`: string
- `socialLinks`: Array<{platform: string, url: string}>

**Response:**

```typescript
{
  status: "success",
  data: User
}
```

## Vault Management APIs

### Endpoints

#### 1. Get All Vaults

```typescript
GET /vaults?page=1&limit=10&search=query
```

**Query Parameters:**

- `page`: number (optional) - Page number
- `limit`: number (optional) - Items per page
- `search`: string (optional) - Search query

**Response:**

```typescript
{
  status: "success",
  data: {
    data: Vault[],
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}
```

#### 2. Get User Vaults

```typescript
GET /vault-insights/user?page=1&limit=9
```

**Query Parameters:**

- `page`: number - Page number (default: 1)
- `limit`: number - Items per page (default: 9)

**Response:**

```typescript
{
  data: Vault[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

#### 3. Get Vault by ID

```typescript
GET /vaults/{id}?t={timestamp}
```

**Parameters:**

- `id`: string - Vault ID
- `t`: number - Cache-busting timestamp

**Response:**

```typescript
{
  status: "success",
  data: Vault
}
```

#### 4. Create Vault

```typescript
POST / vaults;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `vaultName`: string
- `vaultSymbol`: string
- `underlyingAssets`: VaultAsset[]
- `feeConfig`: VaultFeeConfig
- `params`: VaultParams

**Response:**

```typescript
{
  status: "success",
  data: Vault
}
```

#### 5. Update Vault

```typescript
PUT / vaults / { id };
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- Partial Vault object

**Response:**

```typescript
{
  status: "success",
  data: Vault
}
```

#### 6. Delete Vault

```typescript
DELETE / vaults / { id };
```

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```typescript
{
  status: "success";
}
```

#### 7. Deposit to Vault

```typescript
POST / vaults / { vaultId } / deposit;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `amount`: number - Deposit amount

**Response:**

```typescript
{
  status: "success",
  data: Transaction
}
```

#### 8. Withdraw from Vault

```typescript
POST / vaults / { vaultId } / withdraw;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `amount`: number - Withdrawal amount

**Response:**

```typescript
{
  status: "success",
  data: Transaction
}
```

#### 9. Get Featured Vaults

```typescript
GET /vaults/featured/list?page=1&limit=10
```

**Query Parameters:**

- `page`: number - Page number (default: 1)
- `limit`: number - Items per page (default: 10)

**Response:**

```typescript
{
  data: Vault[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

## Portfolio APIs

### Endpoints

#### 1. Get Portfolio

```typescript
GET / portfolio;
```

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```typescript
{
  status: "success",
  data: Portfolio
}
```

#### 2. Get Transactions

```typescript
GET /portfolio/transactions?page=1&limit=10&type=deposit
```

**Headers:**

- `Authorization: Bearer <token>`

**Query Parameters:**

- `page`: number (optional) - Page number
- `limit`: number (optional) - Items per page
- `type`: string (optional) - Transaction type filter

**Response:**

```typescript
{
  status: "success",
  data: {
    data: Transaction[],
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}
```

#### 3. Get Transaction by ID

```typescript
GET / portfolio / transactions / { id };
```

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```typescript
{
  status: "success",
  data: Transaction
}
```

#### 4. Get Vault Deposits

```typescript
GET /vault-deposit/transactions/deposits?page=1&limit=10
```

**Headers:**

- `Authorization: Bearer <token>`

**Query Parameters:**

- `page`: number (optional) - Page number
- `limit`: number (optional) - Items per page

**Response:**

```typescript
{
  status: "success",
  message: "OK",
  data: VaultDepositTransaction[]
}
```

#### 5. Get Transaction History

```typescript
GET /history/transactions-user?page=1&limit=10
```

**Headers:**

- `Authorization: Bearer <token>`

**Query Parameters:**

- `page`: number (optional) - Page number
- `limit`: number (optional) - Items per page

**Response:**

```typescript
{
  data: Array<{
    _id: string;
    action: string;
    description: string;
    performedBy: {
      _id: string;
      username: string;
      email: string;
      name: string;
    };
    vaultId: {
      _id: string;
      vaultName: string;
      vaultSymbol: string;
    };
    relatedEntity: string;
    metadata: {
      [key: string]: string | number;
    };
    transactionSignature: string;
    createdAt: string;
    updatedAt: string;
    __v: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }
}
```

## Wallet APIs

### Endpoints

#### 1. Get Wallet Balance

```typescript
GET / wallet / balance / { address };
```

**Parameters:**

- `address`: string - Wallet address

**Response:**

```typescript
{
  status: "success",
  data: {
    balance: number,
    network: string
  }
}
```

#### 2. Get Transaction History

```typescript
GET /wallet/transactions/{address}?page=1&limit=10
```

**Parameters:**

- `address`: string - Wallet address

**Query Parameters:**

- `page`: number (optional) - Page number
- `limit`: number (optional) - Items per page

**Response:**

```typescript
{
  status: "success",
  data: {
    data: Transaction[],
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}
```

## Transaction Management APIs

### Endpoints

#### 1. Read Transaction

```typescript
POST / tx - event - management / read - transaction;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `transactionSignature`: string - Transaction signature

**Response:**

```typescript
{
  status: "success",
  data: unknown
}
```

#### 2. Deposit Transaction

```typescript
POST / tx - event - management / deposit - transaction;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `transactionSignature`: string - Transaction signature

**Response:**

```typescript
{
  status: "success",
  data: unknown
}
```

#### 3. Redeem Transaction

```typescript
POST / tx - event - management / redeem - transaction;
```

**Headers:**

- `Authorization: Bearer <token>`

**Parameters:**

- `transactionSignature`: string - Transaction signature

**Response:**

```typescript
{
  status: "success",
  data: unknown
}
```

## File Upload APIs

### Endpoints

#### 1. Upload to S3

```typescript
POST / s3 - bucket / upload;
```

**Headers:**

- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Body:**

- `file`: File - Image file (JPG, PNG, GIF, max 5MB)

**Response:**

```typescript
{
  success: boolean,
  data: string // File URL
}
```

## Asset Allocation APIs

### Endpoints

#### 1. Get All Assets

```typescript
GET /asset-allocation/all?page=1&limit=20&network=devnet&symbol=SOL
```

**Query Parameters:**

- `page`: number - Page number (default: 1)
- `limit`: number - Items per page (default: 20)
- `network`: string - Network type (default: "devnet")
- `symbol`: string (optional) - Asset symbol filter

**Response:**

```typescript
{
  data: Array<{
    _id: string,
    mintAddress: string,
    name: string,
    symbol: string,
    type: string,
    decimals: number,
    logoUrl?: string,
    active: boolean,
    createdAt: string,
    updatedAt: string
  }>,
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

## Solana Integration

### Network Configuration

The application supports multiple Solana networks:

```typescript
// Network Types
export const SOLANA_NETWORKS = {
  MAINNET: "mainnet-beta",
  DEVNET: "devnet",
} as const;

// RPC URLs
export const SOLANA_RPC_URLS = {
  [SOLANA_NETWORKS.MAINNET]: "https://api.mainnet-beta.solana.com",
  [SOLANA_NETWORKS.DEVNET]: "https://api.devnet.solana.com",
} as const;
```

### Program IDs

#### Vault Factory Program

- **Environment Variable**: `VITE_VAULT_FACTORY_PROGRAM_ID`
- **Default**: `B4hqrBAGZrMrXv5phVeNE8FMxXxH2njfjnkocQt7D1n6`

#### ETF Vault Program

- **Environment Variable**: `VITE_ETF_VAULT_PROGRAM_ID`
- **Default**: `11111111111111111111111111111111`

### Token Mint Addresses

#### Devnet Tokens

```typescript
DEVNET: {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN',
  SOL: 'So11111111111111111111111111111111111111112',
  BTC: '9n4nM48XwJ4x3bP1Z36Nydq4ijMkofCL1MoDc64vvL1W',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
}
```

#### Mainnet Tokens

```typescript
MAINNET: {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL: 'So11111111111111111111111111111111111111112',
  BTC: '9n4nM48XwJ4x3bP1Z36Nydq4ijMkofCL1MoDc64vvL1W',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
}
```

## External Services

### Reown AppKit (WalletConnect)

#### Configuration

- **Project ID**: `ba03ea93183ff3ca223ce73b7e08bd01`
- **Network**: Solana Devnet (configurable)
- **Features**:
  - Social logins: Disabled
  - Email logins: Disabled
  - All wallets: Disabled (Solana only)

#### Supported Wallets

- Phantom
- Solflare
- Backpack
- Glow
- And other Solana-compatible wallets

### Solana Explorer Integration

#### Transaction Links

- **Base URL**: `https://solscan.io/tx/`
- **Network Parameter**: `?` (for devnet transactions)

#### Usage Example

```typescript
const explorerUrl = `https://solscan.io/tx/${transactionSignature}?`;
```

## Error Handling

### API Error Structure

```typescript
class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}
```

### Common Error Codes

- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Authentication Flow

### 4-Step Solana Authentication

1. **Get Nonce**: Request a unique nonce from the server
2. **Create Message**: Generate a SIWS (Sign-In with Solana) message
3. **Sign Message**: User signs the message with their wallet
4. **Verify Signature**: Server verifies the signature and returns a JWT token

### Token Management

- **Storage**: JWT tokens are stored in `sessionStorage`
- **Header**: Tokens are automatically included in API requests via `Authorization: Bearer <token>`
- **Expiration**: Tokens expire and require re-authentication

## Rate Limiting

The API implements rate limiting to prevent abuse. Common limits:

- **Authentication**: 5 requests per minute per IP
- **General API**: 100 requests per minute per user
- **File Upload**: 10 uploads per hour per user

## Security Considerations

1. **HTTPS Only**: All API communications should use HTTPS in production
2. **Token Security**: JWT tokens are stored in sessionStorage (not localStorage)
3. **Input Validation**: All user inputs are validated on both client and server
4. **File Upload Limits**: 5MB maximum file size for image uploads
5. **CORS**: API endpoints are configured with appropriate CORS policies

## Development vs Production

### Development

- **API Base URL**: `http://localhost:3001/api/v1`
- **Network**: Solana Devnet
- **Debug Mode**: Enabled with console logging

### Production

- **API Base URL**: Set via `VITE_API_BASE_URL` environment variable
- **Network**: Solana Mainnet (configurable)
- **Debug Mode**: Disabled
- **Error Reporting**: Implement proper error tracking

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure API server has proper CORS configuration
2. **Authentication Failures**: Check token validity and expiration
3. **Network Errors**: Verify API base URL and network connectivity
4. **File Upload Issues**: Check file size limits and supported formats
5. **Solana Connection**: Verify RPC endpoint and network configuration

### Debug Mode

Enable debug logging by setting `localStorage.setItem('debug', 'true')` in the browser console.

## Support

For API-related issues or questions:

1. Check the browser console for error messages
2. Verify environment variables are correctly set
3. Ensure the API server is running and accessible
4. Check network connectivity and CORS configuration

---

_Last updated: January 2025_
