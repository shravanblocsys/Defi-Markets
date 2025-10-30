# Vault Factory Module

## Overview
The Vault Factory module manages the creation, retrieval, and management of vaults in the DeFi system.

## Features
- Create new vaults
- Retrieve vaults with pagination and filtering
- Update vault information
- Delete vaults
- Blockchain event integration
- Redis caching for improved performance

## Redis Caching

### How It Works
The Vault Factory API now includes Redis caching to improve response times and reduce database load. Here's how it works:

1. **First Request**: When you hit the API for the first time, the data is fetched from the database and stored in Redis with a configurable TTL (Time To Live).

2. **Subsequent Requests**: If the same request is made again within the TTL period, the data is returned directly from Redis, bypassing the database.

3. **Cache Invalidation**: When vault data is modified (create, update, delete), the cache is automatically cleared to ensure data consistency.

### Cached Endpoints

#### `GET /api/v1/vaults` - Find All Paginated
- **Cache Key**: `vaults:findAllPaginated`
- **TTL**: 5 minutes (300 seconds)
- **Cache Strategy**: Query parameters and pagination are included in the cache key

#### `GET /api/v1/vaults/:id` - Find One
- **Cache Key**: `vaults:findOne`
- **TTL**: 10 minutes (600 seconds)

#### `GET /api/v1/vaults/address/:address` - Find By Address
- **Cache Key**: `vaults:findByAddress`
- **TTL**: 10 minutes (600 seconds)

#### `GET /api/v1/vaults/transaction/:signature` - Find By Transaction
- **Cache Key**: `vaults:findByTransactionSignature`
- **TTL**: 10 minutes (600 seconds)

### Cache Invalidation
The following operations automatically clear all vault-related cache entries:

- Creating a new vault (`POST /api/v1/vaults`)
- Creating a vault from blockchain event (`POST /api/v1/vaults/blockchain-event`)
- Updating a vault (`PATCH /api/v1/vaults/:id`)
- Deleting a vault (`DELETE /api/v1/vaults/:id`)
- Setting vault address (`POST /api/v1/vaults/:id/address`)
- Updating vault status (`PATCH /api/v1/vaults/:id/status`)

### Cache Key Structure
Cache keys are automatically generated based on:
- The endpoint being called
- Query parameters (for paginated requests)
- Request body (for POST/PUT requests)
- User ID (if authenticated)

Example cache keys:
```
vaults:findAllPaginated:vaultName=test&status=active&page=1&limit=10
vaults:findOne:vault123
vaults:findByAddress:address123
```

### Configuration
Redis configuration is handled through environment variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
REDIS_TTL=300
REDIS_MAX_ITEMS=100
```

### Benefits
- **Faster Response Times**: Cached responses are served in milliseconds
- **Reduced Database Load**: Fewer database queries for frequently accessed data
- **Better User Experience**: Consistent response times even under load
- **Automatic Cache Management**: No manual cache invalidation required

### Monitoring
Cache operations are logged for debugging and monitoring:
- Cache hits and misses
- Cache invalidation events
- Error handling for cache operations

#### Log Messages
The system provides detailed logging for all cache operations:

**Cache Hits (Data from Redis):**
```
🚀 Cache HIT: Data retrieved from Redis cache for key: vaults:findAllPaginated:vaultName=test&status=active&page=1&limit=10
```

**Cache Misses (Data from Database):**
```
💾 Cache MISS: Data not found in cache for key: vaults:findAllPaginated:vaultName=test&status=active&page=1&limit=10, fetching from database...
✅ Cache SET: Data stored in Redis cache for key: vaults:findAllPaginated:vaultName=test&status=active&page=1&limit=10 with TTL: 300s
```

**Cache Invalidation:**
```
🔄 Triggering cache invalidation after vault creation
🗑️ Cache CLEARED: Removed 3 vault cache entries from Redis
🗑️ Cache Manager RESET: Cleared all cache manager entries
```

**API Operations:**
```
📊 Fetching paginated vaults - this will be cached if available in Redis
🔄 Triggering cache invalidation after vault update (ID: vault123)
🔄 Triggering cache invalidation after vault status update (ID: vault123, Status: active)
```

#### Log Levels
- **Info (📊, 🚀, ✅, 💾)**: Normal cache operations
- **Warning (🔄)**: Cache invalidation triggers
- **Info (🗑️)**: Cache clearing operations
- **Error (❌)**: Cache operation failures

#### Monitoring Cache Performance
You can monitor cache performance by looking for these patterns in your logs:

1. **High Cache Hit Rate**: Many `🚀 Cache HIT` messages indicate good caching performance
2. **Cache Misses**: `💾 Cache MISS` messages show when data is fetched from the database
3. **Cache Invalidation**: `🔄` messages show when cache is cleared due to data changes
4. **Cache Storage**: `✅ Cache SET` messages confirm data is being stored in Redis

#### Example Log Output
```
[VaultFactoryController] 📊 Fetching paginated vaults - this will be cached if available in Redis
[CacheInterceptor] 🚀 Cache HIT: Data retrieved from Redis cache for key: vaults:findAllPaginated:vaultName=test&status=active&page=1&limit=10

[VaultFactoryController] Creating new vault
[VaultFactoryController] 🔄 Triggering cache invalidation after vault creation
[VaultFactoryController] 🗑️ Cache CLEARED: Removed 3 vault cache entries from Redis
[VaultFactoryController] 🗑️ Cache Manager RESET: Cleared all cache manager entries
```

## Schema Overview

The vault creation follows the blockchain event structure with the following components:

### Core Parameters
- **vault_name**: String (max 32 characters)
- **vault_symbol**: String (max 8 characters)
- **underlying_assets**: Vector of UnderlyingAsset (max 10 assets)
- **management_fee_bps**: Management fee in basis points
- **blockchain_metadata**: Transaction details, slot, network info

## Data Structures

### UnderlyingAsset
```typescript
interface UnderlyingAsset {
  mint: string;        // Token mint address
  pct_bps: number;     // Percentage allocation in basis points (e.g., 4000 = 40%)
  symbol: string;      // Token symbol
  name: string;        // Token name
  decimals?: number;   // Optional token decimals
}
```

### FeeConfig
```typescript
interface FeeConfig {
  managementFeeBps: number;  // Management fee in basis points (e.g., 150 = 1.5%)
}
```

### VaultParams
```typescript
interface VaultParams {
  minDeposit: number;          // Minimum deposit amount
  maxDeposit: number;          // Maximum deposit amount
  lockPeriod: number;          // Lock period in seconds
  rebalanceThreshold: number;  // Percentage for rebalancing
  maxSlippage: number;         // Maximum slippage in basis points
  strategy: string;            // Strategy identifier
}
```

### Blockchain Event Data
```typescript
interface VaultCreationEvent {
  event_type: string;
  program_id: string;
  transaction_signature: string;
  slot: number;
  block_time: number;
  accounts: {
    factory: string;
    vault: string;
    creator: string;
    etf_vault_program: string;
    system_program: string;
  };
  vault_data: {
    vault_name: string;
    vault_symbol: string;
    management_fee_bps: number;
    underlying_assets: UnderlyingAsset[];
  };
  metadata: {
    network: string;
    instruction_name: string;
    compute_units_consumed: number;
    fee: number;
  };
}
```

## Services

### VaultFactoryService
The main service for vault creation and management. Integrates with:
- **ProfileService**: Resolves creator profiles from blockchain addresses
- **TokenManagementService**: Manages payment token resolution and validation

#### Key Methods

**`createFromBlockchainEvent(vaultData)`**
Creates a vault from simplified blockchain data structure. This method is designed for direct integration with blockchain events that provide minimal vault information.

**Input Parameters:**
```typescript
{
  vault: string;           // Vault public key
  factory: string;         // Factory public key
  creator: string;         // Creator public key
  vault_name: string;      // Vault name
  vault_symbol: string;    // Vault symbol
  management_fee_bps: number; // Management fee in basis points
  underlying_assets: Array<{
    mint: string;          // Token mint address
    pct_bps: number;      // Percentage allocation in basis points
    name: string;          // Token name
    symbol: string;        // Token symbol
  }>;
  underlying_assets_count: number; // Total number of underlying assets
  total_supply: number;    // Initial total supply
  nav: number;             // Net Asset Value
  timestamp: number;       // Creation timestamp
}
```

**Return Value:**
Returns a `VaultFactoryDocument` with the created vault data. The vault is created with:
- Status set to `'pending'`
- Basic blockchain data populated (vaultAddress, creatorAddress, blockTime)
- Default values for required fields (paymentTokens, params)
- Creator field set to `null` (requires later resolution)

**Usage Example:**
```typescript
const vaultData = {
  vault: "E5c8ukh5QADovptEBey5ipLuqAoetX1D5eegjeDECAaD",
  factory: "5sEPvxv3YpF29ghoyaLubY8feqHF4E7DzLXurnmFEfyJ",
  creator: "AexZm9S565MmrLuJvNvtvfoAwB5z52Wcj6bgJ9xaHrA",
  vault_name: "Blue Chip Portfolio",
  vault_symbol: "BCP",
  management_fee_bps: 150,
  underlying_assets: [
    {
      mint: "So11111111111111111111111111111111111111112",
      pct_bps: 4000,
      name: "Solana",
      symbol: "SOL"
    }
  ],
  underlying_assets_count: 1,
  total_supply: 0,
  nav: 0,
  timestamp: 1733159674
};

const createdVault = await vaultFactoryService.createFromSimpleData(vaultData);
```

**Post-Creation Steps:**
After creating a vault with this method, you typically need to:
1. Resolve the creator profile from the blockchain address
2. Populate payment tokens for the specific network
3. Configure vault parameters (minDeposit, maxDeposit, etc.)
4. Update the vault status to `'active'` when all data is populated

### TokenManagementService
Handles payment token management across different networks:

#### Supported Networks
- **mainnet-beta**: USDC, USDT, SOL, mSOL, BONK
- **devnet**: USDC, SOL
- **testnet**: USDC, SOL

#### Key Features
- Network-specific token resolution
- Token validation and support checking
- Automatic fallback to default tokens
- Token deduplication and merging

#### Payment Token Interface
```typescript
interface PaymentToken {
  mint: string;        // Token mint address
  decimals: number;    // Token decimal places
  symbol: string;      // Token symbol
  name: string;        // Token full name
  network?: string;    // Network where token is available
  isActive?: boolean;  // Whether token is currently active
}
```

### ProfileService Integration
The vault factory now properly resolves creator profiles from blockchain addresses:
- Uses `getByWalletAddress()` method to find existing profiles
- Creates proper creator associations for vaults
- Enables full vault activation from blockchain events

## API Endpoints

### Create Vault (Manual)
```http
POST /vaults
```

**Request Body:**
```json
{
  "vaultName": "My DeFi Vault",
  "vaultSymbol": "MDV",
  "underlyingAssets": [
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "pct_bps": 6000,
      "symbol": "USDC",
      "name": "USD Coin"
    },
    {
      "mint": "So11111111111111111111111111111111111111112",
      "pct_bps": 4000,
      "symbol": "SOL",
      "name": "Solana"
    }
  ],
  "paymentTokens": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "decimals": 9,
      "symbol": "SOL",
      "name": "Solana"
    }
  ],
  "feeConfig": {
    "managementFeeBps": 150
  },
  "params": {
    "minDeposit": 1000000,
    "maxDeposit": 1000000000,
    "lockPeriod": 86400,
    "rebalanceThreshold": 500,
    "maxSlippage": 100,
    "strategy": "balanced"
  },
  "creator": "CreatorPublicKey123..."
}
```

### Create Vault from Simple Data
```http
POST /vaults/simple-data
```

**Request Body:**
```json
{
  "vault": "PublicKey",
  "factory": "PublicKey",
  "creator": "PublicKey",
  "vault_name": "Buffer(String)",
  "vault_symbol": "Buffer(String)",
  "management_fee_bps": 150,
  "underlying_assets": [
    {
      "mint": "PublicKey",
      "pct_bps": 4000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    },
    {
      "mint": "PublicKey",
      "pct_bps": 3000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    },
    {
      "mint": "PublicKey",
      "pct_bps": 3000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    }
  ],
  "underlying_assets_count": 3,
  "total_supply": 0,
  "nav": 0,
  "timestamp": 1234567890
}
```

**Expected Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "vaultName": "Buffer(String)",
  "vaultSymbol": "Buffer(String)",
  "underlyingAssets": [
    {
      "mint": "PublicKey",
      "pct_bps": 4000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    },
    {
      "mint": "PublicKey",
      "pct_bps": 3000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    },
    {
      "mint": "PublicKey",
      "pct_bps": 3000,
      "name": "Buffer(String)",
      "symbol": "Buffer(String)"
    }
  ],
  "paymentTokens": [],
  "feeConfig": {
    "managementFeeBps": 150
  },
  "params": {
    "minDeposit": 0,
    "maxDeposit": 0,
    "lockPeriod": 0,
    "rebalanceThreshold": 0,
    "maxSlippage": 0,
    "strategy": "default"
  },
  "vaultAddress": "PublicKey",
  "creatorAddress": "PublicKey",
  "creator": null,
  "status": "pending",
  "blockTime": 1234567890,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Notes:**
- The vault is created with `status: "pending"` initially
- `paymentTokens` is set to an empty array and should be populated later
- `params` are set to default values and should be configured as needed
- `creator` is set to `null` and should be resolved from the blockchain address
- The vault will remain in `pending` status until all required data is populated

### Create Vault from Blockchain Event
```http
POST /vaults/blockchain-event
```

**Request Body:**
```json
{
  "event_type": "vault_created",
  "program_id": "3nRdknTKDH2sUBQ6zzdhGL6XeYEpfFhYuCPkRuaF9yWC",
  "instruction_index": 0,
  "transaction_signature": "nECCCD58oX8tSVGz5p271sp2z9ngZDAmGcehfq5RT77GpALmZQsdNnnuUnPKwRfQdb83ak1wnZFNwSA9rQBUG7S",
  "slot": 404991589,
  "block_time": 1733159674,
  "accounts": {
    "factory": "5sEPvxv3YpF29ghoyaLubY8feqHF4E7DzLXurnmFEfyJ",
    "vault": "E5c8ukh5QADovptEBey5ipLuqAoetX1D5eegjeDECAaD",
    "creator": "AexZm9S565MmrLuJvNvtvfoAwB5z52Wcj6bgJ9xaHrA",
    "etf_vault_program": "FKqYmpNsp2uF64HCoT4rAbhQ35KR8kDmvqT7fnVjG8Qm",
    "system_program": "11111111111111111111111111111111"
  },
  "vault_data": {
    "vault_name": "Blue Chip Portfolio",
    "vault_symbol": "BCP",
    "management_fee_bps": 150,
    "underlying_assets": [
      {
        "mint": "So11111111111111111111111111111111111111112",
        "pct_bps": 4000,
        "name": "Solana",
        "symbol": "SOL"
      },
      {
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "pct_bps": 3000,
        "name": "USDC",
        "symbol": "USDC"
      },
      {
        "mint": "EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN",
        "pct_bps": 3000,
        "name": "USDT",
        "symbol": "USDT"
      }
    ]
  },
  "metadata": {
    "network": "devnet",
    "instruction_name": "CreateVault",
    "compute_units_consumed": 15659,
    "fee": 5000
  }
}
```

### Get All Vaults
```http
GET /vaults
```

### Get Vault by ID
```http
GET /vaults/:id
```

### Get Vault by Address
```http
GET /vaults/address/:address
```

### Get Vault by Transaction Signature
```http
GET /vaults/transaction/:signature
```

### Update Vault
```http
PATCH /vaults/:id
```

### Delete Vault
```http
DELETE /vaults/:id
```

### Set Vault Address
```http
POST /vaults/:id/address
```

**Request Body:**
```json
{
  "vaultAddress": "VaultProgramAddress123..."
}
```

### Update Vault Status
```http
PATCH /vaults/:id/status
```

**Request Body:**
```json
{
  "status": "active"
}
```

**Status Options:**
- `pending`: Vault is being created or awaiting data population
- `active`: Vault is operational with all required data
- `paused`: Vault is temporarily paused
- `closed`: Vault is permanently closed

## Validation Rules

1. **Vault Name**: Maximum 32 characters
2. **Vault Symbol**: Maximum 8 characters
3. **Underlying Assets**: Maximum 10 assets
4. **Asset Percentages**: Must sum to 10000 basis points (100%)
5. **Management Fee**: Must be between 0 and 10000 basis points
6. **Deposits**: Minimum deposit must be less than maximum deposit
7. **Lock Period**: Must be non-negative

## Blockchain Integration

The vault factory module now supports:
- **Direct blockchain event processing**: Create vaults directly from blockchain events
- **Transaction tracking**: Store transaction signatures, slots, and block times
- **Network identification**: Track which network (mainnet, devnet) the vault was created on
- **Program ID tracking**: Store the program ID that created the vault
- **Creator resolution**: Automatically resolve creator profiles from blockchain addresses
- **Payment token management**: Network-specific token resolution and validation

## Data Population and Vault Activation

### From Blockchain Events
When creating vaults from blockchain events, the system:

1. **Creates initial vault record** with status 'pending'
2. **Populates blockchain data** (address, program ID, transaction details)
3. **Resolves creator profile** from blockchain address using ProfileService
4. **Resolves payment tokens** using TokenManagementService for the specific network
5. **Activates vault** when all required data is populated

### Required Data for Activation
A vault requires the following data to transition from 'pending' to 'active':
- Creator profile (resolved from blockchain address)
- Payment tokens (resolved from network configuration)
- All blockchain metadata (address, program ID, transaction details)

### Automatic Fallbacks
- **Creator resolution**: Falls back to null if profile not found (vault remains pending)
- **Payment tokens**: Falls back to network-specific default tokens
- **Token validation**: Ensures only active and supported tokens are used

## Integration with Helius Stream

The vault factory module can be integrated with the Helius stream service to automatically process vault creation events and update vault statuses in real-time.

## Error Handling

The module includes comprehensive error handling for:
- Invalid parameter validation
- Duplicate vault names
- Exceeding asset/token limits
- Invalid fee configurations
- Non-existent vault operations
- Blockchain event validation
- Asset percentage validation (must sum to 100%)
- Creator profile resolution failures
- Payment token resolution failures
- Incomplete vault data validation

## Module Dependencies

The vault factory module now properly integrates with:
- **ProfileModule**: For creator profile resolution
- **ConfigModule**: For configuration management
- **TokenManagementService**: For payment token management
- **MongooseModule**: For database operations

This ensures that vaults created from blockchain events can be fully activated and operational, resolving the previous functional gaps in creator assignment and payment token resolution.
