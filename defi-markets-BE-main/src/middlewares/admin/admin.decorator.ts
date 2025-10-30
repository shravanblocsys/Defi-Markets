import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to mark routes as requiring admin privileges
 * Use with AdminGuard for automatic role validation
 */
export const AdminOnly = () => SetMetadata('adminOnly', true);

/**
 * Decorator to mark routes as public (bypass admin validation)
 */
export const Public = () => SetMetadata('isPublic', true);
