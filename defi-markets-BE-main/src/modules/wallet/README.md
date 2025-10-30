# Wallet Management System

## Overview
The Wallet Management System provides comprehensive CRUD operations for managing cryptocurrency wallets with role-based access control. Each wallet can be assigned multiple roles (Treasury, Admin, Operator, Auditor) to define its purpose and permissions. Wallet balances are fetched directly from the blockchain on the frontend for real-time accuracy.

## Features
- **Wallet Management**: Create, read, update, and delete wallets
- **Role Assignment**: Assign multiple roles to wallets (foreign key relationship)
- **Blockchain Integration**: Real-time balance fetching from blockchain (frontend)
- **Address Management**: Unique wallet addresses with validation
- **Soft Delete**: Safe deletion with data preservation
- **Statistics**: Comprehensive wallet and role statistics
- **RESTful API**: Clean and intuitive API endpoints

## Database Schema

### Wallet Entity
```typescript
{
  address: string,           // Unique wallet address (e.g., 0x742d...8C8E)
  label: string,            // Human-readable name (e.g., "Treasury Main")
  roles: ObjectId[],        // Array of wallet role IDs (foreign keys)
  currency?: string,        // Optional currency type (ETH, SOL, USDC, BTC, MATIC)
  isActive: boolean,        // Whether wallet is active
  description?: string,     // Optional description
  tags?: string[],          // Optional categorization tags
  lastActivity?: Date,      // Last transaction/activity date
  metadata?: object,        // Additional metadata
  createdAt: Date,          // Creation timestamp
  updatedAt: Date           // Last update timestamp
}
```

### Wallet Role Entity
```typescript
{
  name: string,             // Role name (Treasury, Admin, Operator, Auditor)
  description: string,      // Role description
  isActive: boolean,        // Whether role is active
  color?: string,           // UI display color (hex)
  icon?: string,            // UI icon identifier
  createdAt: Date,          // Creation timestamp
  updatedAt: Date           // Last update timestamp
}
```

## API Endpoints

### Wallet Management

#### `POST /api/v1/wallets`
Create a new wallet with assigned roles.

**Request Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C8C8E",
  "label": "Treasury Main",
  "roles": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "currency": "ETH",
  "description": "Primary treasury wallet for holding main funds",
  "tags": ["treasury", "main"],
  "isActive": true
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C8C8E",
  "label": "Treasury Main",
  "roles": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Treasury",
      "description": "Primary treasury wallet for holding main funds",
      "color": "#10B981",
      "icon": "treasury"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Admin",
      "description": "Administrative wallet with full system access",
      "color": "#3B82F6",
      "icon": "admin"
    }
  ],
  "currency": "ETH",
  "isActive": true,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

#### `GET /api/v1/wallets`
Get all active wallets with populated role information.

#### `GET /api/v1/wallets/:id`
Get a specific wallet by ID with populated role information.

#### `GET /api/v1/wallets/address/:address`
Get a wallet by its address.

#### `GET /api/v1/wallets/role/:roleId`
Get all wallets assigned to a specific role.

#### `PUT /api/v1/wallets/:id`
Update wallet information. Supports single field updates for better control and validation.

**Request Body Examples:**

**Update Single Field (Label Only):**
```json
{
  "label": "Updated Treasury Main"
}
```

**Update Multiple Fields:**
```json
{
  "label": "Updated Treasury Main",
  "description": "Updated description for treasury wallet",
  "tags": ["treasury", "main", "updated"]
}
```

**Update Roles (Must be valid MongoDB IDs):**
```json
{
  "roles": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Validation Rules:**
- At least one field must be provided
- `roles` must be a non-empty array of valid MongoDB IDs
- `address` must be unique across all wallets
- `tags` must be an array of strings
- `currency` must be one of: ETH, SOL, USDC, BTC, MATIC
- `isActive` must be a boolean

**Error Responses:**
```json
{
  "statusCode": 400,
  "message": "No fields provided for update",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "Roles must be a non-empty array",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "Each role must be a valid MongoDB ID",
  "error": "Bad Request"
}
```

#### `POST /api/v1/wallets/:id/roles/:roleId`
Add a role to a wallet.

#### `DELETE /api/v1/wallets/:id/roles/:roleId`
Remove a role from a wallet.

#### `DELETE /api/v1/wallets/:id`
Soft delete a wallet (sets isActive to false) and returns success confirmation.

**Response:**
```json
{
  "message": "Wallet deleted successfully",
  "walletId": "507f1f77bcf86cd799439011"
}
```

**HTTP Status:** 200 OK

#### `GET /api/v1/wallets/stats`
Get wallet statistics.

**Response:**
```json
{
  "totalWallets": 3,
  "activeWallets": 3,
  "walletsByCurrency": {
    "ETH": 3
  }
}
```

### Wallet Role Management

#### `POST /api/v1/wallet-roles`
Create a new wallet role.

**Request Body:**
```json
{
  "name": "Treasury",
  "description": "Primary treasury wallet for holding main funds",
  "isActive": true,
  "color": "#10B981",
  "icon": "treasury"
}
```

#### `POST /api/v1/wallet-roles/seed`
Seed default wallet roles (Treasury, Admin, Operator, Auditor).

#### `GET /api/v1/wallet-roles`
Get all wallet roles.

#### `GET /api/v1/wallet-roles/active`
Get only active wallet roles.

#### `GET /api/v1/wallet-roles/:id`
Get a specific wallet role by ID.

#### `GET /api/v1/wallet-roles/name/:name`
Get a wallet role by name.

#### `PATCH /api/v1/wallet-roles/:id`
Update wallet role information.

#### `PATCH /api/v1/wallet-roles/:id/toggle-active`
Toggle the active status of a wallet role.

#### `DELETE /api/v1/wallet-roles/:id`
Soft delete a wallet role.

#### `GET /api/v1/wallet-roles/stats`
Get wallet role statistics.

**Response:**
```json
{
  "totalRoles": 4,
  "activeRoles": 4,
  "inactiveRoles": 0
}
```

## Default Wallet Roles

The system comes with four pre-configured wallet roles:

1. **Treasury** - Primary treasury wallet for holding main funds
   - Color: Green (#10B981)
   - Icon: treasury

2. **Admin** - Administrative wallet with full system access
   - Color: Blue (#3B82F6)
   - Icon: admin

3. **Operator** - Operational wallet for daily transactions
   - Color: Amber (#F59E0B)
   - Icon: operator

4. **Auditor** - Audit wallet for monitoring and verification
   - Color: Purple (#8B5CF6)
   - Icon: auditor

## Usage Examples

### Creating a New Wallet
```bash
curl -X POST http://localhost:3000/api/v1/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x8ba1f109551bD432803012645Hac136c772c0000",
    "label": "Operations Wallet",
    "roles": ["507f1f77bcf86cd799439012"],
    "currency": "ETH",
    "description": "Daily operations wallet"
  }'
```

### Assigning Multiple Roles
```bash
curl -X POST http://localhost:3000/api/v1/wallets/507f1f77bcf86cd799439013/roles/507f1f77bcf86cd799439014
```

### Seeding Default Roles
```bash
curl -X POST http://localhost:3000/api/v1/wallet-roles/seed
```

## Validation Rules

### Wallet Creation/Update
- Address must be unique
- At least one role must be assigned
- Currency must be one of: ETH, SOL, USDC, BTC, MATIC (optional)
- Role IDs must be valid MongoDB ObjectIds

### Wallet Role Creation/Update
- Role name must be unique
- Name and description are required
- Color should be a valid hex color code
- Icon should be a valid icon identifier

## Error Handling

The system provides comprehensive error handling:

- **400 Bad Request**: Validation errors, duplicate addresses/names, invalid IDs
- **404 Not Found**: Wallet or role not found
- **500 Internal Server Error**: Database or system errors

## Logging

All operations are logged with appropriate log levels:
- **Info**: Normal operations (create, read, update, delete)
- **Warning**: Validation warnings
- **Error**: System errors and exceptions

## Security Features

- **Soft Delete**: Data is never permanently deleted
- **Role Validation**: Ensures only valid roles can be assigned
- **Input Validation**: Comprehensive validation of all inputs
- **Audit Trail**: Timestamps for all operations

## Performance Considerations

- **Indexing**: Database indexes on address, roles, and currency fields
- **Population**: Efficient role population using MongoDB references
- **Pagination**: Support for large datasets (can be implemented)
- **Caching**: Redis caching can be added for frequently accessed data

## Redis Caching

The wallet module implements Redis caching to improve API response times and reduce database load.

### How It Works

1. **Cache Interceptor**: Uses NestJS `CacheInterceptor` to automatically handle caching logic
2. **Cache Keys**: Custom cache keys for different query types
3. **TTL Management**: Configurable time-to-live for cache entries
4. **Cache Invalidation**: Automatic cache clearing on data modifications

### Cached Endpoints

| Endpoint | Cache Key | TTL | Description |
|----------|-----------|-----|-------------|
| `GET /api/v1/wallets` | `wallets:all` | 5 min | All active wallets |
| `GET /api/v1/wallets/stats` | `wallets:stats` | 5 min | Wallet statistics |
| `GET /api/v1/wallets/:id` | `wallets:id:{id}` | 5 min | Wallet by ID (dynamic key) |
| `GET /api/v1/wallets/address/:address` | `wallets:by-address:{address}` | 5 min | Wallet by address (dynamic key) |
| `GET /api/v1/wallets/role/:roleId` | `wallets:by-role:{roleId}` | 5 min | Wallets by role (dynamic key) |

### Cache Invalidation

Cache is automatically cleared when:
- Creating a new wallet
- Updating wallet information
- Adding/removing roles from wallets
- Deleting wallets (soft delete)

### Cache Key Structure

```
wallets:all                    # All wallets list
wallets:stats                  # Wallet statistics
wallets:id:{id}               # Wallet by ID (dynamic key with actual ID)
wallets:by-address:{address}  # Wallet by address (dynamic key with actual address)
wallets:by-role:{roleId}      # Wallets by role (dynamic key with actual roleId)
```

### Configuration

- **Default TTL**: 5 minutes (300 seconds)
- **Cache Strategy**: Write-through with immediate invalidation
- **Storage**: Redis with fallback to cache manager

### Benefits

- **Performance**: Reduced database queries for read operations
- **Scalability**: Better handling of concurrent requests
- **User Experience**: Faster API responses
- **Resource Efficiency**: Reduced database load

### Monitoring

The system logs cache operations:
- 🚀 **Cache HIT**: Data retrieved from Redis cache
- 💾 **Cache MISS**: Data fetched from database
- ✅ **Cache SET**: Data stored in Redis cache
- 🗑️ **Cache CLEAR**: Cache invalidation events

## Future Enhancements

- **Multi-currency Support**: Enhanced currency management
- **Transaction History**: Track wallet transactions over time
- **Role-based Permissions**: Granular permission system
- **Wallet Groups**: Organize wallets into logical groups
- **Audit Logging**: Comprehensive audit trail for compliance
- **API Rate Limiting**: Protect against abuse
- **Webhook Support**: Real-time notifications for wallet changes
- **Blockchain Integration**: Enhanced blockchain data fetching capabilities

## Postman Collection Examples

### Create Treasury Wallet
```http
POST http://localhost:3000/api/v1/wallets
```
**Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C8C8E",
  "label": "Treasury Main",
  "roles": ["507f1f77bcf86cd799439011"],
  "currency": "ETH",
  "description": "Primary treasury wallet for holding main funds",
  "tags": ["treasury", "main"],
  "isActive": true,
  "metadata": {
    "riskLevel": "low",
    "lastAudit": "2024-01-15"
  }
}
```

### Create Operations Wallet (No Currency)
```http
POST http://localhost:3000/api/v1/wallets
```
**Body:**
```json
{
  "address": "0x8ba1f109551bD432803012645Hac136c772c0000",
  "label": "Operations Wallet",
  "roles": ["507f1f77bcf86cd799439013"],
  "description": "Daily operations wallet for transactions",
  "tags": ["operations", "daily"],
  "isActive": true
}
```

### Update Wallet Information
```http
PUT http://localhost:3000/api/v1/wallets/{walletId}
```
**Body (Single Field Update):**
```json
{
  "label": "Updated Treasury Main"
}
```

**Body (Multiple Fields Update):**
```json
{
  "label": "Updated Treasury Main",
  "description": "Updated description for treasury wallet",
  "tags": ["treasury", "main", "updated"],
  "metadata": {
    "riskLevel": "medium",
    "lastAudit": "2024-01-16",
    "notes": "Updated wallet information"
  }
}
```

### Expected Wallet Response (No Balance)
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C8C8E",
  "label": "Treasury Main",
  "roles": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Treasury",
      "description": "Primary treasury wallet for holding main funds",
      "color": "#10B981",
      "icon": "treasury"
    }
  ],
  "currency": "ETH",
  "isActive": true,
  "description": "Primary treasury wallet for holding main funds",
  "tags": ["treasury", "main"],
  "lastActivity": "2024-01-15T10:00:00.000Z",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

### Updated Wallet Statistics (No Balance)
```json
{
  "totalWallets": 3,
  "activeWallets": 3,
  "walletsByCurrency": {
    "ETH": 2,
    "SOL": 1
  }
}
```

**Note**: Wallet balances are now fetched directly from the blockchain on the frontend for real-time accuracy, eliminating the need to store and sync balance data in the database.

#### Delete Wallet (Soft Delete)
```http
DELETE http://localhost:3000/api/v1/wallets/{walletId}
```

**Response:**
```json
{
  "message": "Wallet deleted successfully",
  "walletId": "507f1f77bcf86cd799439011"
}
```
