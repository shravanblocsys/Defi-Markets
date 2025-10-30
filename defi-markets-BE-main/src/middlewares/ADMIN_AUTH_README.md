# Admin Authentication System

This document explains how to use the admin authentication system for role-based access control.

## Overview

The admin authentication system provides:
- Separate admin verification endpoint
- Admin middleware for role validation
- Admin guard for route protection
- Decorators for easy admin route marking

## API Endpoints

### Admin Login
```http
POST /api/v1/auth/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "adminpassword"
}
```

### Admin Token Verification
```http
GET /api/v1/auth/admin/verify
Authorization: Bearer <admin_token>
```

## Usage Examples

### 1. Using Admin Middleware

```typescript
import { Controller, UseGuards } from '@nestjs/common';
import { AdminGuard, AdminOnly } from '../middlewares';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  
  @Get('dashboard')
  @AdminOnly()
  async getAdminDashboard() {
    // Only admins can access this endpoint
    return { message: 'Admin dashboard data' };
  }
}
```

### 2. Using Admin Guard with Decorators

```typescript
import { Controller, UseGuards, Get } from '@nestjs/common';
import { AdminGuard, AdminOnly, Public } from '../middlewares';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  
  @Get('public-info')
  @Public()
  async getPublicInfo() {
    // This endpoint is public, no admin validation
    return { message: 'Public information' };
  }
  
  @Get('sensitive-data')
  @AdminOnly()
  async getSensitiveData() {
    // Only admins can access this endpoint
    return { message: 'Sensitive admin data' };
  }
}
```

### 3. Accessing Admin User in Controller

```typescript
import { Controller, UseGuards, Get, Req } from '@nestjs/common';
import { AdminGuard } from '../middlewares';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  
  @Get('profile')
  async getAdminProfile(@Req() req: any) {
    // Access admin user from request
    const admin = req.admin; // or req.user
    return {
      id: admin._id,
      email: admin.email,
      role: 'ADMIN'
    };
  }
}
```

## Middleware vs Guard

### AdminMiddleware
- Applied globally or to specific routes
- Runs before route handlers
- Good for general admin validation

### AdminGuard
- Applied with `@UseGuards()` decorator
- More granular control
- Can be combined with other guards
- Supports decorators like `@AdminOnly()` and `@Public()`

## Role Validation

The system validates admin access by:
1. Verifying JWT token
2. Fetching user profile from database
3. Checking user's role is 'ADMIN'
4. Ensuring role is active

## Error Responses

### Invalid Token
```json
{
  "statusCode": 401,
  "message": "Invalid or expired token"
}
```

### Not Admin
```json
{
  "statusCode": 401,
  "message": "Access denied. Admin privileges required."
}
```

### Missing Authorization Header
```json
{
  "statusCode": 401,
  "message": "Invalid authorization header"
}
```

## Security Notes

- Admin tokens are validated on every request
- Role validation is performed against the database
- Inactive admin roles are rejected
- Only users with 'ADMIN' role can access protected endpoints

## Integration

To use in your modules:

```typescript
import { Module } from '@nestjs/common';
import { AdminGuard } from '../middlewares';

@Module({
  providers: [AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}
```
