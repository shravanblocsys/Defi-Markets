# Vault Deposit Module

This module implements the ETF vaults program functionality for managing vault deposits, redemptions, and operations based on the Solana blockchain program specifications.

## Overview

The Vault Deposit module provides comprehensive functionality for:
- **Vault Management**: Create, update, and manage ETF vaults
- **Deposit Operations**: Handle user deposits with fee calculations
- **Redemption Operations**: Process share redemptions
- **Asset Allocation**: Manage vault asset allocation to targets
- **NAV Management**: Net Asset Value calculations and updates
- **Emergency Operations**: Handle emergency withdrawals and vault closure
- **Transaction Tracking**: Complete transaction lifecycle management

## Features
- Vault deposit and redemption management
- Emergency withdrawal operations
- Vault closure operations
- Asset allocation and NAV management
- Transaction status tracking
- Redis caching for improved performance

## Redis Caching

### How It Works
The Vault Deposit API now includes Redis caching to improve response times and reduce database load. Here's how it works:

1. **First Request**: When you hit the API for the first time, the data is fetched from the database and stored in Redis with a configurable TTL (Time To Live).

2. **Subsequent Requests**: If the same request is made again within the TTL period, the data is returned directly from Redis, bypassing the database.

3. **Cache Invalidation**: When vault or transaction data is modified, the cache is automatically cleared to ensure data consistency.

### Cached Endpoints

#### Vault Management
- **`GET /vault-deposit` - Find All Vaults**
  - **Cache Key**: `vault-deposit:findAll`
  - **TTL**: 5 minutes (300 seconds)

- **`GET /vault-deposit/:id` - Find One Vault**
  - **Cache Key**: `vault-deposit:findOne`
  - **TTL**: 10 minutes (600 seconds)

- **`GET /vault-deposit/address/:address` - Find By Address**
  - **Cache Key**: `vault-deposit:findByAddress`
  - **TTL**: 10 minutes (600 seconds)

#### Transaction Queries
- **`GET /vault-deposit/transactions/deposits` - Get Deposit Transactions**
  - **Cache Key**: `vault-deposit:getDepositTransactions`
  - **TTL**: 5 minutes (300 seconds)

- **`GET /vault-deposit/transactions/redeems` - Get Redeem Transactions**
  - **Cache Key**: `vault-deposit:getRedeemTransactions`
  - **TTL**: 5 minutes (300 seconds)

- **`GET /vault-deposit/transactions/emergency-withdraws` - Get Emergency Withdrawals**
  - **Cache Key**: `vault-deposit:getEmergencyWithdrawTransactions`
  - **TTL**: 5 minutes (300 seconds)

- **`GET /vault-deposit/transactions/vault-closures` - Get Vault Closures**
  - **Cache Key**: `vault-deposit:getVaultClosureTransactions`
  - **TTL**: 5 minutes (300 seconds)

### Cache Invalidation
The following operations automatically clear all vault-deposit-related cache entries:

- Creating a new vault (`POST /vault-deposit`)
- Updating a vault (`PATCH /vault-deposit/:id`)
- Deleting a vault (`DELETE /vault-deposit/:id`)
- Creating deposit transactions (`POST /vault-deposit/deposit`)
- Creating redeem transactions (`POST /vault-deposit/redeem`)
- Creating emergency withdrawal transactions (`POST /vault-deposit/emergency-withdraw`)
- Creating vault closure transactions (`POST /vault-deposit/vault-closure`)
- Updating transaction statuses (all transaction types)
- Allocating assets (`POST /vault-deposit/:id/allocate`)
- Refreshing NAV (`POST /vault-deposit/:id/refresh-nav`)
- Updating vault status (`PATCH /vault-deposit/:id/status`)

### Cache Key Structure
Cache keys are automatically generated based on:
- The endpoint being called
- Query parameters (for transaction queries)
- Request body (for POST/PUT requests)
- User ID (if authenticated)

Example cache keys:
```
vault-deposit:findAll
vault-deposit:findOne:vault123
vault-deposit:findByAddress:address123
vault-deposit:getDepositTransactions:vaultAddress=0x123&userAddress=0x456
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
🚀 Cache HIT: Data retrieved from Redis cache for key: vault-deposit:findAll
```

**Cache Misses (Data from Database):**
```
💾 Cache MISS: Data not found in cache for key: vault-deposit:findAll, fetching from database...
✅ Cache SET: Data stored in Redis cache for key: vault-deposit:findAll with TTL: 300s
```

**Cache Invalidation:**
```
🔄 Triggering cache invalidation after vault creation
🗑️ Cache CLEARED: Removed 5 vault-deposit cache entries from Redis
🗑️ Cache Manager RESET: Cleared all cache manager entries
```

**API Operations:**
```
📊 Fetching all vaults - this will be cached if available in Redis
🔄 Triggering cache invalidation after vault update (ID: vault123)
🔄 Triggering cache invalidation after deposit transaction creation
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
[VaultDepositController] 📊 Fetching all vaults - this will be cached if available in Redis
[CacheInterceptor] 🚀 Cache HIT: Data retrieved from Redis cache for key: vault-deposit:findAll

[VaultDepositController] Creating new vault
[VaultDepositController] 🔄 Triggering cache invalidation after vault creation
[VaultDepositController] 🗑️ Cache CLEARED: Removed 5 vault-deposit cache entries from Redis
[VaultDepositController] 🗑️ Cache Manager RESET: Cleared all cache manager entries
```

## Integration with Vault Factory

The Vault Deposit module works in conjunction with the **Vault Factory** module:

### Workflow
1. **Vault Factory** creates vault configurations with metadata, assets, and parameters
2. **Vault Deposit** initializes the actual vault with blockchain addresses and operational parameters
3. **Vault Deposit** maintains the deposit ledger and handles all vault operations

### Data Flow
```
Vault Factory (Configuration) → Vault Deposit (Operations)
├── Vault metadata (name, symbol, assets)
├── Fee configuration
├── Vault parameters
└── Creator information
    ↓
Vault Deposit (Execution)
├── Blockchain addresses
├── Admin/Guardian keys
├── State management
├── Transaction ledger
└── Operational logic
```

## Key Features

### 1. Vault Operations
- ✅ **Initialize Vault**: Create new ETF vaults with fee and parameter configuration
- ✅ **Deposit**: Users can deposit base tokens and receive ETF shares
- ✅ **Redeem**: Users can redeem ETF shares for base tokens
- ✅ **Allocate**: Admin/guardian can allocate vault assets to different targets
- ✅ **Refresh NAV**: Update Net Asset Value based on current assets
- ✅ **Emergency Withdraw**: Guardian can perform emergency withdrawals
- ✅ **Close Vault**: Admin can close vault and recover funds

### 2. Fee Management
- **Entry Fee**: Charged on deposits (basis points)
- **Exit Fee**: Charged on redemptions (basis points)
- **Performance Fee**: Performance-based fees (basis points)
- **Protocol Fee**: Protocol-level fees (basis points)
- **Validation**: Ensures fees don't exceed maximum bounds (MAX_BPS = 10000)

### 3. State Management
- **Vault States**: Active, Paused, Emergency, Closed
- **Reentrancy Protection**: Prevents reentrancy attacks
- **Balance Tracking**: Real-time asset and share tracking
- **Authorization**: Role-based access control (Admin, Guardian, User)

### 4. Transaction Management
- **Deposit Transactions**: Complete deposit lifecycle tracking
- **Redeem Transactions**: Redemption process management
- **Emergency Withdraw Transactions**: Guardian emergency operations
- **Vault Closure Transactions**: Admin vault closure operations
- **Status Updates**: Pending → Completed/Failed state transitions
- **Blockchain Integration**: Transaction signature tracking

## API Endpoints

### Vault Management
```http
POST   /vault-deposit                    # Create new vault
GET    /vault-deposit                    # Get all vaults
GET    /vault-deposit/:id                # Get vault by ID
GET    /vault-deposit/address/:address   # Get vault by blockchain address
PATCH  /vault-deposit/:id                # Update vault
DELETE /vault-deposit/:id                # Delete vault
```

### Deposit Operations
```http
POST   /vault-deposit/deposit            # Create deposit transaction
GET    /vault-deposit/transactions/deposits  # Get deposit transactions
PATCH  /vault-deposit/transactions/deposits/:id  # Update deposit status
```

### Redemption Operations
```http
POST   /vault-deposit/redeem             # Create redeem transaction
GET    /vault-deposit/transactions/redeems    # Get redeem transactions
PATCH  /vault-deposit/transactions/redeems/:id   # Update redeem status
```

### Emergency Operations
```http
POST   /vault-deposit/emergency-withdraw     # Create emergency withdrawal (guardian only)
GET    /vault-deposit/transactions/emergency-withdraws  # Get emergency withdrawal transactions
PATCH  /vault-deposit/transactions/emergency-withdraws/:id  # Update emergency withdrawal status
```

### Vault Closure Operations
```http
POST   /vault-deposit/vault-closure       # Create vault closure (admin only)
GET    /vault-deposit/transactions/vault-closures  # Get vault closure transactions
PATCH  /vault-deposit/transactions/vault-closures/:id  # Update vault closure status
```

### Vault Operations
```http
POST   /vault-deposit/:id/allocate       # Allocate assets
POST   /vault-deposit/:id/refresh-nav    # Refresh NAV
PATCH  /vault-deposit/:id/status         # Update vault status
```

## Data Models

### VaultDeposit Entity
```typescript
{
  id: number;
  vaultAddress: string;
  feeConfig: FeeConfig;
  vaultParams: VaultParams;
  state: VaultState;
  admin: string;
  guardian: string;
  factory: string;
  etfMint: string;
  vaultBaseTreasury: string;
  baseMint: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### FeeConfig
```typescript
{
  entryFee: number;        // Basis points (100 = 1%)
  exitFee: number;         // Basis points
  performanceFee: number;  // Basis points
  protocolFee: number;     // Basis points
}
```

### VaultParams
```typescript
{
  cap: number;                    // Maximum vault capacity
  maxAllocationTargets: number;   // Maximum allocation targets
  router: string;                 // Router program address
  oracle: string;                 // Oracle program address
}
```

### VaultState
```typescript
{
  status: 'Active' | 'Paused' | 'Emergency' | 'Closed';
  totalAssets: number;
  totalShares: number;
  nav: number; // Net Asset Value
  lastUpdated: Date;
}
```

### Transaction Entities
```typescript
// Deposit Transaction
{
  id: string;
  vaultAddress: string;
  userAddress: string;
  amount: number;
  sharesReceived: number;
  feePaid: number;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}

// Emergency Withdraw Transaction
{
  id: string;
  vaultAddress: string;
  guardianAddress: string;
  target: string;
  amount: number;
  reason: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}

// Vault Closure Transaction
{
  id: string;
  vaultAddress: string;
  adminAddress: string;
  reason: string;
  finalDistribution: boolean;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionSignature?: string;
}
```

## Example Usage

### Create a Vault
```json
POST /vault-deposit
{
  "vaultAddress": "VaultAddress123...",
  "admin": "AdminPublicKey123...",
  "guardian": "GuardianPublicKey123...",
  "factory": "FactoryProgramAddress123...",
  "etfMint": "EtfMintAddress123...",
  "vaultBaseTreasury": "VaultBaseTreasury123...",
  "baseMint": "BaseMintAddress123...",
  "feeConfig": {
    "entryFee": 50,
    "exitFee": 50,
    "performanceFee": 200,
    "protocolFee": 10
  },
  "vaultParams": {
    "cap": 1000000000,
    "maxAllocationTargets": 10,
    "router": "RouterProgramAddress123...",
    "oracle": "OracleProgramAddress123..."
  }
}
```

### Create Deposit Transaction
```json
POST /vault-deposit/deposit
{
  "vaultAddress": "VaultAddress123...",
  "userAddress": "UserWalletAddress123...",
  "amount": 1000000,
  "minSharesOut": 950000
}
```

### Create Redeem Transaction
```json
POST /vault-deposit/redeem
{
  "vaultAddress": "VaultAddress123...",
  "userAddress": "UserWalletAddress123...",
  "shares": 1000000,
  "toBase": true
}
```

### Create Emergency Withdrawal
```json
POST /vault-deposit/emergency-withdraw
{
  "vaultAddress": "VaultAddress123...",
  "guardianAddress": "GuardianWalletAddress123...",
  "target": "TargetAddress123...",
  "amount": 500000,
  "reason": "Emergency liquidity need"
}
```

### Create Vault Closure
```json
POST /vault-deposit/vault-closure
{
  "vaultAddress": "VaultAddress123...",
  "adminAddress": "AdminWalletAddress123...",
  "reason": "Strategy termination",
  "finalDistribution": true
}
```

### Allocate Assets
```json
POST /vault-deposit/1/allocate
{
  "allocationTargets": [
    {
      "target": "TargetAddress1...",
      "percentage": 60
    },
    {
      "target": "TargetAddress2...",
      "percentage": 40
    }
  ]
}
```

## Error Handling

The module includes comprehensive error handling for:

- **FeeTooHigh**: Invalid fee configuration (> 10000 basis points)
- **Unauthorized**: Wrong signer for operations
- **InsufficientLiquidity**: Not enough shares/tokens
- **InvalidInput**: Invalid parameters
- **VaultPaused**: Vault is paused
- **VaultClosed**: Vault is closed
- **AllocationExceeded**: Too many allocation targets
- **GuardianOnly**: Emergency operations require guardian authorization
- **AdminOnly**: Vault closure requires admin authorization

## Security Features

1. **Authorization Checks**: Role-based access control
   - **Admin**: Can close vault and update parameters
   - **Guardian**: Can perform emergency withdrawals
   - **Users**: Can deposit and redeem
2. **Fee Validation**: Prevents excessive fees
3. **State Validation**: Ensures vault is in correct state for operations
4. **Reentrancy Protection**: Prevents reentrancy attacks
5. **Balance Verification**: Validates token balances before operations
6. **Transaction Signatures**: Tracks blockchain transaction signatures

## Integration Points

- **Helius Stream**: Can integrate with blockchain event monitoring
- **Vault Factory**: Works with vault creation and management
- **Authentication**: Integrates with user authentication system
- **Blockchain**: Ready for Solana program integration

## Testing

The module includes comprehensive test coverage for:
- ✅ Vault initialization with valid/invalid parameters
- ✅ Deposit functionality with balance verification
- ✅ Redemption with insufficient balance handling
- ✅ Asset allocation with percentage validation
- ✅ NAV refresh operations
- ✅ Emergency withdrawal by guardian
- ✅ Vault closure by admin
- ✅ Reentrancy protection
- ✅ Fee calculation validation
- ✅ Authorization checks for emergency operations
- ✅ Transaction status management

## Future Enhancements

- **Real-time Blockchain Integration**: Direct Solana program interaction
- **Event Emission**: Blockchain event monitoring and processing
- **Advanced Analytics**: Performance metrics and reporting
- **Multi-token Support**: Support for multiple base tokens
- **Automated Rebalancing**: Automatic asset rebalancing
- **Yield Farming**: Integration with DeFi yield strategies
- **Cross-chain Support**: Multi-chain vault operations
- **Advanced Risk Management**: Risk assessment and mitigation tools
