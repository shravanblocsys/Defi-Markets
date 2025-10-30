import { ExecutionContext, CanActivate, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '../../modules/config/config.service';
import { ProfileService } from '../../modules/profile/profile.service';
import { RolesService } from '../../modules/roles/roles.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly rolesService: RolesService,
    private readonly reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    try {
      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Invalid authorization header');
      }

      const token = authHeader.substring(7); // Remove "Bearer " prefix

      // Verify and decode the JWT token
      const payload: any = this.jwtService.verify(token);

      if (!payload || !payload._id) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Get user profile
      const user = await this.profileService.get(payload._id);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Verify admin role
      try {
        const role = await this.rolesService.get(user.roleId.toString());

        if (!role || role.name !== 'ADMIN' || !role.isActive) {
          throw new UnauthorizedException(
            'Access denied. Admin privileges required.',
          );
        }
      } catch (error) {
        throw new UnauthorizedException(
          'Access denied. Admin privileges required.',
        );
      }

      // Add user to request object
      request.user = user;
      request.admin = user;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
