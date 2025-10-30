import { SetMetadata } from '@nestjs/common';

export const PAGINATION_KEY = 'pagination';
export const UsePagination = () => SetMetadata(PAGINATION_KEY, true);
