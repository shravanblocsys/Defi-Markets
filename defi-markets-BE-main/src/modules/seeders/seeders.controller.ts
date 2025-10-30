import { Controller, Post, Get, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SeedersService } from './seeders.service';

@ApiTags('Seeders')
@Controller('api/v1/seeders')
export class SeedersController {
  constructor(private readonly seedersService: SeedersService) {}

  /**
   * Seed all data (roles and profiles)
   */
  @Post('')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Seed all data',
    description: 'Creates initial roles (ADMIN, USER) and admin profile from seeders-data.json'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Seeding completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            roles: { type: 'number' },
            profiles: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async seedAll() {
    return await this.seedersService.seedAll();
  }

  /**
   * Get seeding status
   */
  @Get('status')
  @ApiOperation({ 
    summary: 'Get seeding status',
    description: 'Returns the count of existing roles and profiles'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        roles: { type: 'number' },
        profiles: { type: 'number' }
      }
    }
  })
  async getStatus() {
    return await this.seedersService.getStatus();
  }

  /**
   * Clear all seeded data (for development/testing)
   */
  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Clear all seeded data',
    description: 'Removes all roles and profiles from the database (use with caution)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Data cleared successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async clearAll() {
    return await this.seedersService.clearAll();
  }
}
