export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginationRange {
  from: number
  to: number
}

export function parsePagination(query: { page?: string; limit?: string }): PaginationParams {
  const page = Math.max(1, parseInt(query.page || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)))
  return { page, limit }
}

export function toSupabaseRange(params: PaginationParams): PaginationRange {
  const from = (params.page - 1) * params.limit
  const to = from + params.limit - 1
  return { from, to }
}

export function paginationMeta(params: PaginationParams, totalCount: number) {
  return {
    page: params.page,
    limit: params.limit,
    totalCount,
    totalPages: Math.ceil(totalCount / params.limit)
  }
}
