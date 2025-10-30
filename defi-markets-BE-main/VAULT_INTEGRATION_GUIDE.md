# Vault Factory & Vault Deposit Integration Guide

This guide explains how the **Vault Factory** and **Vault Deposit** modules work together to implement the complete ETF vaults program functionality based on the Solana blockchain program specifications.

## Overview

The ETF vaults system consists of two main modules that work in sequence:

1. **Vault Factory** (`vault-factory/`) - Handles vault creation and configuration
2. **Vault Deposit** (`vault-deposit/`) - Manages vault operations and deposit ledger

## Architecture Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vault Factory │    │  Vault Deposit  │    │  Blockchain     │
│   (Config)      │───▶│   (Operations)  │───▶│   (Execution)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Phase 1: Vault Configuration (Vault Factory)
- Create vault metadata (name, symbol)
- Define underlying assets and payment tokens
- Configure fee structure
- Set vault parameters
- Assign creator and initial status

### Phase 2: Vault Initialization (Vault Deposit)
- Initialize vault with blockchain addresses
- Set up admin and guardian keys
- Configure operational parameters
- Establish vault state
- Link to vault factory via foreign key

### Phase 3: Vault Operations (Vault Deposit)
- Handle deposits and redemptions
- Manage asset allocation
- Track NAV updates
- Process emergency operations
- Maintain transaction ledger

## Module Responsibilities

### Vault Factory Module
**Purpose**: Vault creation and configuration management

**Key Functions**:
- ✅ **Vault Creation**: Create new vault configurations
- ✅ **Metadata Management**: Handle vault names, symbols, descriptions
- ✅ **Asset Configuration**: Define underlying assets and payment tokens
- ✅ **Fee Setup**: Configure management, performance, entry, and exit fees
- ✅ **Parameter Management**: Set deposit limits, lock periods, strategies
- ✅ **Status Tracking**: Track vault lifecycle (pending → active → paused → closed)

**Data Structures** (Mongoose Schema):
```typescript
interface VaultFactory {
  _id: ObjectId;
  vaultName: string;           // No length limit
  vaultSymbol: string;          // No length limit
  underlyingAssets: UnderlyingAsset[];  // No size limit
  paymentTokens: PaymentToken[];        // No size limit
  feeConfig: FeeConfig;
  params: VaultParams;
  vaultAddress?: string;        // Set after blockchain deployment
  creator: string;
  status: 'pending' | 'active' | 'paused' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

interface UnderlyingAsset {
  mint: string;
  decimals: number;
  symbol: string;
  name: string;
}

interface PaymentToken {
  mint: string;
  decimals: number;
  symbol: string;
  name: string;
}

interface FeeConfig {
  managementFee: number;    // 0-10000 basis points
  performanceFee: number;   // 0-10000 basis points
  entryFee: number;         // 0-10000 basis points
  exitFee: number;          // 0-10000 basis points
  feeCollector: string;
}

interface VaultParams {
  minDeposit: number;
  maxDeposit: number;
  lockPeriod: number;
  rebalanceThreshold: number;
  maxSlippage: number;
  strategy: string;
}
```

### Vault Deposit Module
**Purpose**: Vault operations and deposit ledger management

**Key Functions**:
- ✅ **Vault Initialization**: Initialize vault with blockchain addresses
- ✅ **Foreign Key Validation**: Validate vault factory reference
- ✅ **Deposit Management**: Handle user deposits with fee calculations
- ✅ **Redemption Processing**: Process share redemptions
- ✅ **Asset Allocation**: Manage vault asset allocation to targets
- ✅ **NAV Management**: Calculate and update Net Asset Value
- ✅ **Emergency Operations**: Handle emergency withdrawals (guardian)
- ✅ **Vault Closure**: Process vault closure (admin)
- ✅ **Transaction Tracking**: Complete transaction lifecycle management

**Data Structures** (Mongoose Schema):
```typescript
interface VaultDeposit {
  _id: ObjectId;
  vaultFactory: ObjectId;      // Foreign key to VaultFactory
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

interface VaultState {
  status: 'Active' | 'Paused' | 'Emergency' | 'Closed';
  totalAssets: number;
  totalShares: number;
  nav: number;
  lastUpdated: Date;
}

interface FeeConfig {
  entryFee: number;        // 0+ basis points (no max limit)
  exitFee: number;         // 0+ basis points (no max limit)
  performanceFee: number;  // 0+ basis points (no max limit)
  protocolFee: number;     // 0+ basis points (no max limit)
}

interface VaultParams {
  cap: number;
  maxAllocationTargets: number;  // 1+ (no max limit)
  router: string;
  oracle: string;
}
```

## Foreign Key Relationships

### Database Schema Relationships
```
VaultFactory (1) ←→ (N) VaultDeposit (1) ←→ (N) Transactions
```

### Foreign Key Fields
- `VaultDeposit.vaultFactory` → `VaultFactory._id`
- `DepositTransaction.vaultDeposit` → `VaultDeposit._id`
- `RedeemTransaction.vaultDeposit` → `VaultDeposit._id`
- `EmergencyWithdrawTransaction.vaultDeposit` → `VaultDeposit._id`
- `VaultClosureTransaction.vaultDeposit` → `VaultDeposit._id`

### Validation Rules
- ✅ Vault factory must exist before creating vault deposit
- ✅ Vault factory must be in 'active' status
- ✅ Unique constraints on `vaultAddress` and `vaultFactory`
- ✅ Required field validation
- ✅ MongoDB ObjectId type safety

## Integration Workflow

### Step 1: Create Vault Configuration
```http
POST /vault-factory
{
  "vaultName": "DeFi Growth ETF",
  "vaultSymbol": "DGETF",
  "underlyingAssets": [
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "decimals": 6,
      "symbol": "USDC",
      "name": "USD Coin"
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
    "managementFee": 100,
    "performanceFee": 200,
    "entryFee": 50,
    "exitFee": 50,
    "feeCollector": "FeeCollectorPublicKey123..."
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

**Response**:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "vaultName": "DeFi Growth ETF",
  "vaultSymbol": "DGETF",
  "status": "pending",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Step 2: Deploy to Blockchain
After the vault configuration is created, deploy the vault to the blockchain and get the vault address.

### Step 3: Set Vault Address
```http
POST /vault-factory/507f1f77bcf86cd799439011/address
{
  "vaultAddress": "VaultProgramAddress123..."
}
```

**Response**:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "vaultName": "DeFi Growth ETF",
  "vaultSymbol": "DGETF",
  "vaultAddress": "VaultProgramAddress123...",
  "status": "active"
}
```

### Step 4: Initialize Vault Operations
```http
POST /vault-deposit
{
  "vaultFactory": "507f1f77bcf86cd799439011",  // VaultFactory ObjectId
  "vaultAddress": "VaultProgramAddress123...",
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
    "maxAllocationTargets": 25,  // No max limit
    "router": "RouterProgramAddress123...",
    "oracle": "OracleProgramAddress123..."
  }
}
```

**Response**:
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "vaultFactory": {
    "_id": "507f1f77bcf86cd799439011",
    "vaultName": "DeFi Growth ETF",
    "vaultSymbol": "DGETF",
    "status": "active"
  },
  "vaultAddress": "VaultProgramAddress123...",
  "state": {
    "status": "Active",
    "totalAssets": 0,
    "totalShares": 0,
    "nav": 1.0,
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  },
  "admin": "AdminPublicKey123...",
  "guardian": "GuardianPublicKey123..."
}
```

### Step 5: Vault Operations
Now the vault is ready for operations:

#### Deposit
```http
POST /vault-deposit/deposit
{
  "vaultAddress": "VaultProgramAddress123...",
  "userAddress": "UserWalletAddress123...",
  "amount": 1000000,
  "minSharesOut": 950000
}
```

#### Redeem
```http
POST /vault-deposit/redeem
{
  "vaultAddress": "VaultProgramAddress123...",
  "userAddress": "UserWalletAddress123...",
  "shares": 1000000,
  "toBase": true
}
```

#### Allocate Assets
```http
POST /vault-deposit/507f1f77bcf86cd799439012/allocate
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

#### Emergency Withdrawal (Guardian Only)
```http
POST /vault-deposit/emergency-withdraw
{
  "vaultAddress": "VaultProgramAddress123...",
  "guardianAddress": "GuardianWalletAddress123...",
  "target": "TargetAddress123...",
  "amount": 500000,
  "reason": "Emergency liquidity need"
}
```

#### Vault Closure (Admin Only)
```http
POST /vault-deposit/vault-closure
{
  "vaultAddress": "VaultProgramAddress123...",
  "adminAddress": "AdminWalletAddress123...",
  "reason": "Strategy termination",
  "finalDistribution": true
}
```

## Blockchain Program Alignment

The implementation aligns with the ETF vaults program instructions:

### ✅ initializeVault
- **Vault Factory**: Creates vault configuration
- **Vault Deposit**: Initializes vault with blockchain addresses and parameters

### ✅ deposit
- **Vault Deposit**: Handles deposit transactions with fee calculations and share issuance

### ✅ redeem
- **Vault Deposit**: Processes redemption transactions with fee calculations

### ✅ allocate
- **Vault Deposit**: Manages asset allocation to different targets

### ✅ refreshNav
- **Vault Deposit**: Updates Net Asset Value based on current assets

### ✅ emergencyWithdraw
- **Vault Deposit**: Handles emergency withdrawals by guardian

### ✅ closeVault
- **Vault Deposit**: Processes vault closure by admin

## Security Features

### Authorization Levels
1. **Creator**: Can create vault configurations
2. **Admin**: Can close vault and update parameters
3. **Guardian**: Can perform emergency withdrawals
4. **Users**: Can deposit and redeem

### Validation Rules
- Fee validation (no max limit, but business logic validation)
- Asset allocation percentage validation
- State validation for operations
- Balance verification
- Authorization checks
- Foreign key validation

### Transaction Security
- Transaction signature tracking
- Status management (pending → completed/failed)
- Reentrancy protection
- State consistency checks
- MongoDB atomic operations

## Data Consistency

### Vault Factory → Vault Deposit Mapping
```typescript
// Vault Factory Configuration
{
  _id: "507f1f77bcf86cd799439011",
  vaultName: "DeFi Growth ETF",
  vaultSymbol: "DGETF",
  feeConfig: {
    managementFee: 100,
    performanceFee: 200,
    entryFee: 50,
    exitFee: 50
  }
}

// Vault Deposit Operations
{
  _id: "507f1f77bcf86cd799439012",
  vaultFactory: "507f1f77bcf86cd799439011",  // Foreign key reference
  vaultAddress: "VaultProgramAddress123...",
  feeConfig: {
    entryFee: 50,        // Mapped from factory
    exitFee: 50,         // Mapped from factory
    performanceFee: 200, // Mapped from factory
    protocolFee: 10     // Additional operational fee
  }
}
```

### Foreign Key Benefits
- ✅ **Referential Integrity**: No orphaned records
- ✅ **Data Consistency**: Validated relationships
- ✅ **Query Optimization**: Efficient joins through population
- ✅ **Cascade Behavior**: Proper relationship management
- ✅ **Type Safety**: MongoDB ObjectId validation

## Error Handling

### Common Error Scenarios
1. **FeeTooHigh**: Invalid fee configuration
2. **Unauthorized**: Wrong signer for operations
3. **InsufficientLiquidity**: Not enough shares/tokens
4. **InvalidInput**: Invalid parameters
5. **VaultPaused**: Vault is paused
6. **VaultClosed**: Vault is closed
7. **GuardianOnly**: Emergency operations require guardian
8. **AdminOnly**: Vault closure requires admin
9. **VaultFactoryNotFound**: Foreign key validation failed
10. **VaultFactoryInactive**: Referenced vault factory not active

### Foreign Key Validation Errors
```typescript
// Vault factory does not exist
throw new BadRequestException(`Vault factory with ID ${vaultFactoryId} does not exist`);

// Vault factory not active
throw new BadRequestException(`Vault factory with ID ${vaultFactoryId} is not active (status: ${status})`);

// Validation failed
throw new BadRequestException(`Failed to validate vault factory reference: ${error.message}`);
```

## Monitoring and Analytics

### Transaction Tracking
- Deposit transactions with fee calculations
- Redemption transactions with share calculations
- Emergency withdrawal transactions
- Vault closure transactions
- NAV updates and performance tracking

### Relationship Queries
```typescript
// Get vault deposit with populated vault factory
const vaultDeposit = await vaultDepositService.findOne(id);
// vaultDeposit.vaultFactory will contain full VaultFactory object

// Get all vault deposits for a vault factory
const vaultDeposits = await vaultDepositService.findByVaultFactory(factoryId);

// Get vault factory by address
const vaultFactory = await vaultFactoryService.findByAddress(vaultAddress);
```

### Integration Points
- **Helius Stream**: Blockchain event monitoring
- **Authentication**: User authorization system
- **Analytics**: Performance metrics and reporting
- **Notifications**: Transaction status updates
- **MongoDB**: Persistent data storage with relationships

## Database Schema

### Collections
1. **vaultfactories**: Vault configurations and metadata
2. **vaultdeposits**: Vault operations and state
3. **deposittransactions**: Deposit transaction records
4. **redeemtransactions**: Redemption transaction records
5. **emergencywithdrawtransactions**: Emergency withdrawal records
6. **vaultclosuretransactions**: Vault closure records

### Indexes
- `vaultfactories.vaultAddress` (unique, sparse)
- `vaultdeposits.vaultAddress` (unique)
- `vaultdeposits.vaultFactory` (foreign key)
- `transactions.vaultDeposit` (foreign key)
- `transactions.vaultAddress` (for filtering)
- `transactions.timestamp` (for sorting)

## Future Enhancements

### Planned Features
- **Real-time Blockchain Integration**: Direct Solana program interaction
- **Event Emission**: Blockchain event monitoring and processing
- **Advanced Analytics**: Performance metrics and reporting
- **Multi-token Support**: Support for multiple base tokens
- **Automated Rebalancing**: Automatic asset rebalancing
- **Yield Farming**: Integration with DeFi yield strategies
- **Cross-chain Support**: Multi-chain vault operations
- **Advanced Risk Management**: Risk assessment and mitigation tools

### Scalability Considerations
- **Database Optimization**: MongoDB query optimization and indexing
- **Caching Layer**: Implement Redis for performance optimization
- **Microservices**: Split into separate services for better scalability
- **API Gateway**: Centralized API management and rate limiting
- **Sharding**: Database sharding for large-scale deployments

## Technical Implementation Details

### Mongoose Schema Design
```typescript
// Nested schemas for complex objects
@Schema()
export class FeeConfig {
  @Prop({ required: true, min: 0 })
  entryFee: number;
  // ... other fee properties
}

// Main schema with foreign key
@Schema({ timestamps: true })
export class VaultDeposit {
  @Prop({ 
    required: true, 
    unique: true,
    ref: 'VaultFactory',
    type: mongoose.Schema.Types.ObjectId
  })
  vaultFactory: mongoose.Types.ObjectId;
  // ... other properties
}
```

### Population Strategy
```typescript
// Populate foreign key references
return this.vaultDepositModel.find()
  .populate('vaultFactory')
  .exec();

// Populate nested relationships
return this.depositTransactionModel.find()
  .populate('vaultDeposit')
  .populate('vaultDeposit.vaultFactory')
  .exec();
```

### Validation Pipeline
1. **Input Validation**: DTO validation with class-validator
2. **Business Logic Validation**: Service-level validation
3. **Foreign Key Validation**: Relationship validation
4. **Database Constraints**: MongoDB schema validation
5. **Transaction Integrity**: Atomic operations

## Conclusion

The Vault Factory and Vault Deposit modules provide a comprehensive implementation of the ETF vaults program functionality with proper foreign key relationships and MongoDB persistence. The modular design allows for:

1. **Clear Separation of Concerns**: Configuration vs. Operations
2. **Scalable Architecture**: Easy to extend and modify
3. **Security**: Role-based access control and validation
4. **Flexibility**: Support for various vault configurations
5. **Monitoring**: Complete transaction tracking and analytics
6. **Data Integrity**: Foreign key relationships and validation
7. **Performance**: Optimized queries with population and indexing

This implementation serves as a solid foundation for building a production-ready ETF vaults system that can be integrated with real blockchain networks while maintaining data consistency and referential integrity.
