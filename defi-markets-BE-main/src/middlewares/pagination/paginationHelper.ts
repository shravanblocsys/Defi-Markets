import { Injectable } from '@nestjs/common';
import { Model, Document, PopulateOptions } from 'mongoose';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationQuery {
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class PaginationHelper {
  /**
   * Apply pagination to a MongoDB query
   * @param model - Mongoose model
   * @param filter - Query filter
   * @param paginationQuery - Pagination options from middleware
   * @param populateOptions - Optional populate options
   * @returns Paginated response
   */
  async paginate<T extends Document>(
    model: Model<T>,
    filter: any = {},
    paginationQuery: PaginationQuery,
    populateOptions?: PopulateOptions | PopulateOptions[]
  ): Promise<PaginatedResponse<T>> {
    const { skip, limit, sort } = paginationQuery;
    
    // Get total count
    const total = await model.countDocuments(filter);
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const page = Math.floor(skip / limit) + 1;
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    
    // Build and execute query with populate
    let data: T[];
    if (populateOptions) {
      data = await model.find(filter).skip(skip).limit(limit).sort(sort).populate(populateOptions).exec();
    } else {
      data = await model.find(filter).skip(skip).limit(limit).sort(sort).exec();
    }
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev
      }
    };
  }

  /**
   * Create pagination query from request
   * @param req - Express request object
   * @returns Pagination query object
   */
  createPaginationQuery(req: any): PaginationQuery {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    return { skip, limit: limitNum, sort };
  }
}
