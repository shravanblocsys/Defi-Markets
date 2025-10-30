# Pagination Middleware

This middleware provides pagination functionality for your API endpoints. It can be applied to specific services and works seamlessly with MongoDB queries.

## Features

- **Query Parameters**: Supports `page`, `limit`, `sortBy`, and `sortOrder`
- **MongoDB Integration**: Works with Mongoose models and provides proper skip/limit/sort
- **Flexible**: Can be applied to specific endpoints or globally
- **Type Safe**: Includes TypeScript interfaces for better development experience

## Usage

### 1. Basic Setup

Import the pagination helper in your service:

```typescript
import { PaginationHelper, PaginationQuery, PaginatedResponse } from '../../middlewares/paginationHelper';

@Injectable()
export class YourService {
  constructor(
    private readonly paginationHelper: PaginationHelper,
    // ... other dependencies
  ) {}

  async findAllPaginated(paginationQuery: PaginationQuery): Promise<PaginatedResponse<YourEntity>> {
    return this.paginationHelper.paginate(
      this.yourModel,
      {}, // filter
      paginationQuery,
      { path: 'relation', select: 'name' } // populate options
    );
  }
}
```

### 2. Controller Implementation

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { UsePagination } from '../../middlewares/pagination.decorator';

@Controller('api/v1/your-entity')
export class YourController {
  constructor(private readonly yourService: YourService) {}

  @Get('paginated')
  @UsePagination()
  async findAllPaginated(@Req() req: any) {
    const paginationQuery = this.yourService['paginationHelper'].createPaginationQuery(req);
    return this.yourService.findAllPaginated(paginationQuery);
  }
}
```

### 3. Module Configuration

```typescript
import { Module } from '@nestjs/common';
import { PaginationHelper } from '../../middlewares/paginationHelper';

@Module({
  providers: [
    YourService,
    PaginationHelper, // Add this
    // ... other providers
  ],
  // ... rest of module config
})
export class YourModule {}
```

## API Endpoints

### Paginated Endpoint
```
GET /api/v1/vault-factory/paginated?page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (1-based) |
| `limit` | number | 10 | Items per page (max 100) |
| `sortBy` | string | 'createdAt' | Field to sort by |
| `sortOrder` | 'asc' \| 'desc' | 'desc' | Sort order |

### Response Format

```json
{
  "status": "success",
  "message": "OK",
  "data": {
    "data": [
      // Your entities here
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## Examples

### Vault Factory Service

```typescript
// In vault-factory.service.ts
async findAllPaginated(
  paginationQuery: PaginationQuery,
  filter: any = {}
): Promise<PaginatedResponse<VaultFactoryDocument>> {
  const populateOptions = {
    path: 'creator',
    select: 'name email walletAddress',
  };

  return this.paginationHelper.paginate(
    this.vaultFactoryModel,
    filter,
    paginationQuery,
    populateOptions
  );
}
```

### Controller with Pagination

```typescript
// In vault-factory.controller.ts
@Get('paginated')
async findAllPaginated(@Req() req: any): Promise<any> {
  this.logger.log('Fetching paginated vaults');
  const paginationQuery = this.vaultFactoryService['paginationHelper'].createPaginationQuery(req);
  return this.vaultFactoryService.findAllPaginated(paginationQuery);
}
```

## Advanced Usage

### Custom Filters

```typescript
async findAllPaginated(
  paginationQuery: PaginationQuery,
  filter: any = {}
): Promise<PaginatedResponse<VaultFactoryDocument>> {
  // Add custom filters
  const customFilter = {
    ...filter,
    status: { $in: ['active', 'pending'] },
    'feeConfig.managementFeeBps': { $lte: 500 }
  };

  return this.paginationHelper.paginate(
    this.vaultFactoryModel,
    customFilter,
    paginationQuery,
    populateOptions
  );
}
```

### Multiple Populate Options

```typescript
const populateOptions = [
  { path: 'creator', select: 'name email walletAddress' },
  { path: 'underlyingAssets.mint', select: 'symbol name decimals' }
];
```

## Notes

- The middleware automatically limits the `limit` parameter to a maximum of 100
- Page numbers start from 1 (not 0)
- The `sortBy` field must exist in your MongoDB collection
- The middleware works with your existing response middleware for consistent API responses
