import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginationOptions, PaginationQuery, PaginatedResponse } from './paginationHelper';

@Injectable()
export class PaginationMiddleware implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    
    // Extract pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    
    // Calculate skip value for MongoDB
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
    
    // Store pagination options in request for service to use
    req.paginationOptions = {
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)), // Limit between 1 and 100
      sortBy,
      sortOrder: sortOrder === -1 ? 'desc' : 'asc'
    };

    // Store MongoDB query options
    req.paginationQuery = {
      skip,
      limit: req.paginationOptions.limit,
      sort: { [sortBy]: sortOrder }
    };

    return next.handle().pipe(
      map((response: any) => {
        // If response already has pagination structure, return as is
        if (response && response.pagination) {
          return response;
        }
        
        // Return response as-is if it doesn't have pagination structure
        // Services should use PaginationHelper to return proper PaginatedResponse
        return response;
      })
    );
  }
}
