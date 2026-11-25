import { Request } from 'express';
import type { PaginationDto, ApiListQueryDto } from './dto';

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationDto;
}

/**
 * Columns any list endpoint may sort by. `sort` is used as a Prisma `orderBy`
 * key, so accepting arbitrary input would let a caller order by sensitive
 * columns (e.g. passwordHash) as an oracle or trigger 500s on unknown keys.
 */
export const DEFAULT_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'title',
  'firstName',
  'lastName',
  'email',
  'status',
  'dueDate',
  'score',
] as const;

const MAX_SEARCH_LENGTH = 200;

export function parsePagination(
  req: Request,
  sortableFields: readonly string[] = DEFAULT_SORTABLE_FIELDS,
): Required<Pick<ApiListQueryDto, 'page' | 'limit'>> & { sort: string; order: 'asc' | 'desc'; search: string } {
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit)) || 20));
  const requestedSort = typeof req.query.sort === 'string' ? req.query.sort : '';
  const sort = sortableFields.includes(requestedSort) ? requestedSort : 'createdAt';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, MAX_SEARCH_LENGTH) : '';
  return { page, limit, sort, order, search };
}

export function parseCursorPagination(req: Request): { cursor: string | null; limit: number } {
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length <= 128 ? req.query.cursor : null;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { cursor, limit };
}

export function buildPagination(page: number, limit: number, total: number): PaginationDto {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
