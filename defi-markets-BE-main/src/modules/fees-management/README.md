# Fees Management System

## Overview
The Fees Management System provides comprehensive CRUD operations for managing management fee rates with historical tracking. Each fee change is recorded with an effective date, creator information, and detailed notes. The system includes Redis caching for improved performance and maintains a foreign key relationship with the Profile schema.

## Features
- **Fee Rate Management**: Create, read, update, and delete management fee rates
- **Historical Tracking**: Maintain complete history of fee rate changes
- **Effective Date Management**: Prevent conflicts with overlapping effective dates
- **Profile Integration**: Foreign key relationship with Profile schema for creator tracking
- **Redis Caching**: Improved API response times with automatic cache invalidation
- **Soft Delete**: Safe deletion with data preservation
- **RESTful API**: Clean and intuitive API endpoints

## Database Schema

### Fees Management Entity
```typescript
{
  feeRate: number,           // Fee rate in percentage (e.g., 2.00%)
  effectiveDate: Date,       // When the fee rate becomes active
  createdBy: ObjectId,       // Foreign key to Profile schema
  createdAt: Date,           // When the fee change entry was created
  isActive: boolean,         // Whether this fee rate is currently active
  description?: string,      // Optional description of the fee change
  notes?: string,            // Additional notes about the fee change
  createdAt: Date,           // Creation timestamp
  updatedAt: Date            // Last update timestamp
}
```

## API Endpoints

### Fee Management

#### `POST /api/v1/fees-management`
Create a new fee management entry.

**Request Body:**
```json
{
  "feeRate": 2.0,
  "effectiveDate": "2024-01-01",
  "createdBy": "507f1f77bcf86cd799439012",
  "description": "Updated management fee rate",
  "notes": "Increased from 1.5% to 2.0%"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "feeRate": 2.0,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "createdBy": {
    "_id": "507f1f77bcf86cd799439012",
    "username": "admin",
    "email": "admin@defimarkets.com",
    "name": "Admin User"
  },
  "createdAt": "2023-12-28T21:00:00.000Z",
  "isActive": true,
  "description": "Updated management fee rate",
  "notes": "Increased from 1.5% to 2.0%"
}
```

#### `GET /api/v1/fees-management`
Get all active fee management entries with populated creator information.

#### `GET /api/v1/fees-management/:id`
Get a specific fee management entry by ID with populated creator information.

#### `PUT /api/v1/fees-management/:id`
Update fee management information. Supports single field updates for better control and validation.

**Request Body Examples:**

**Update Single Field (Fee Rate Only):**
```json
{
  "feeRate": 2.5
}
```

**Update Multiple Fields:**
```json
{
  "feeRate": 2.5,
  "description": "Further increased management fee rate",
  "notes": "Additional notes about the increase"
}
```

**Validation Rules:**
- At least one field must be provided
- `feeRate` must be between 0 and 100
- `effectiveDate` must not conflict with existing active fees
- `createdBy` must be a valid MongoDB ID referencing an existing profile

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
  "message": "An active fee rate already exists for this effective date",
  "error": "Bad Request"
}
```

#### `DELETE /api/v1/fees-management/:id`
Soft delete a fee management entry (sets isActive to false) and returns success confirmation.

**Response:**
```json
{
  "feeId": "507f1f77bcf86cd799439011"
}
```

**HTTP Status:** 200 OK

## Redis Caching

The fees management module implements Redis caching to improve API response times and reduce database load.

### How It Works

1. **Cache Interceptor**: Uses NestJS `CacheInterceptor` to automatically handle caching logic
2. **Cache Keys**: Custom cache keys for different query types
3. **TTL Management**: Configurable time-to-live for cache entries
4. **Cache Invalidation**: Automatic cache clearing on data modifications

### Cached Endpoints

| Endpoint | Cache Key | TTL | Description |
|----------|-----------|-----|-------------|
| `GET /api/v1/fees-management` | `fees:all` | 5 min | All active fee entries |
| `GET /api/v1/fees-management/:id` | `fees:id:{id}` | 5 min | Fee entry by ID (dynamic key) |

### Cache Invalidation

Cache is automatically cleared when:
- Creating a new fee entry
- Updating fee information
- Deleting fees (soft delete)

### Cache Key Structure

```
fees:all                    # All fees list
fees:id:{id}               # Fee by ID (dynamic key with actual ID)
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

## Usage Examples

### Creating a New Fee Entry
```bash
curl -X POST http://localhost:3000/api/v1/fees-management \
  -H "Content-Type: application/json" \
  -d '{
    "feeRate": 2.0,
    "effectiveDate": "2024-01-01",
    "createdBy": "507f1f77bcf86cd799439012",
    "description": "Updated management fee rate",
    "notes": "Increased from 1.5% to 2.0%"
  }'
```

### Updating Fee Information
```bash
curl -X PUT http://localhost:3000/api/v1/fees-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "feeRate": 2.5,
    "description": "Further increased management fee rate"
  }'
```

### Deleting a Fee Entry
```bash
curl -X DELETE http://localhost:3000/api/v1/fees-management/507f1f77bcf86cd799439011
```

## Validation Rules

### Fee Creation/Update
- Fee rate must be between 0% and 100%
- Effective date must be a valid date string
- Created by must be a valid MongoDB ID referencing an existing profile
- No active fee rate can exist for the same effective date
- At least one field must be provided for updates

### Profile Validation
- Profile ID must be a valid MongoDB ObjectId
- Referenced profile must exist in the database

## Error Handling

The system provides comprehensive error handling:

- **400 Bad Request**: Validation errors, duplicate effective dates, invalid IDs
- **404 Not Found**: Fee entry or profile not found
- **500 Internal Server Error**: Database or system errors

## Logging

All operations are logged with appropriate log levels:
- **Info**: Normal operations (create, read, update, delete)
- **Warning**: Validation warnings
- **Error**: System errors and exceptions

## Security Features

- **Soft Delete**: Data is never permanently deleted
- **Profile Validation**: Ensures only valid profiles can be referenced
- **Input Validation**: Comprehensive validation of all inputs
- **Audit Trail**: Timestamps for all operations

## Performance Considerations

- **Indexing**: Database indexes on effectiveDate, createdBy, and isActive fields
- **Population**: Efficient profile population using MongoDB references
- **Caching**: Redis caching for frequently accessed data
- **Sorting**: Optimized sorting by effective date and creation time

## Future Enhancements

- **Fee Schedule Management**: Support for recurring fee changes
- **Approval Workflow**: Multi-level approval for fee changes
- **Notification System**: Real-time notifications for fee changes
- **Analytics**: Fee change impact analysis and reporting
- **API Rate Limiting**: Protect against abuse
- **Webhook Support**: Real-time notifications for fee changes
