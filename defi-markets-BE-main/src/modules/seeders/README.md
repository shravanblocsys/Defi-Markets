# Seeders Module

This module provides functionality to seed the database with initial data including roles and user profiles.

## Features

- **Role Seeding**: Creates ADMIN and USER roles
- **Profile Seeding**: Creates an admin user profile
- **Duplicate Prevention**: Skips existing data to prevent duplicates
- **Password Hashing**: Automatically hashes passwords using bcrypt
- **Avatar Generation**: Generates Gravatar URLs for user avatars
- **Status Checking**: Provides endpoints to check seeding status
- **Data Clearing**: Allows clearing seeded data for development/testing

## API Endpoints

### POST `/seeders/seed`
Seeds the database with initial data from `seeders-data.json`.

**Response:**
```json
{
  "message": "Seeding completed successfully",
  "data": {
    "roles": 2,
    "profiles": 1
  }
}
```

### GET `/seeders/status`
Returns the current count of roles and profiles in the database.

**Response:**
```json
{
  "roles": 2,
  "profiles": 1
}
```

### DELETE `/seeders/clear`
Clears all seeded data from the database (use with caution).

**Response:**
```json
{
  "message": "All seeded data cleared successfully"
}
```

## Data Structure

The seeders use the `seeders-data.json` file which contains:

### Roles
- **ADMIN**: Administrator role with full system access
- **USER**: Standard user role with basic permissions

### Profiles
- **Admin User**: 
  - Username: `admin`
  - Email: `admin@defimarkets.com`
  - Password: `Admin123!@#` (automatically hashed)
  - Role: ADMIN
  - Wallet Address: Sample Solana wallet address
  - Social Links: Twitter profile

## Usage

1. **Initial Setup**: Call `POST /seeders/seed` to create initial roles and admin user
2. **Check Status**: Use `GET /seeders/status` to verify seeding was successful
3. **Development**: Use `DELETE /seeders/clear` to reset data during development

## Security Notes

- Passwords are automatically hashed using bcrypt with salt rounds of 10
- The seeder checks for existing data to prevent duplicates
- Admin credentials should be changed after initial setup in production

## Dependencies

- `bcrypt`: Password hashing
- `gravatar`: Avatar generation
- `mongoose`: Database operations
- `@nestjs/common`: NestJS framework
- `@nestjs/mongoose`: MongoDB integration
