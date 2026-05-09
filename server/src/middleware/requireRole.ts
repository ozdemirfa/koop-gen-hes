import { RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError'
import { AppRole, getUserRole } from './roleCache'

export function requireRole(...roles: AppRole[]): RequestHandler {
  const effectiveRoles = new Set<AppRole>(roles)
  if (effectiveRoles.has('staff')) {
    effectiveRoles.add('admin')
  }

  return async (req, _res, next) => {
    if (!req.user?.id) {
      next(ApiError.unauthorized())
      return
    }

    if (req.userRole === undefined) {
      req.userRole = await getUserRole(req.user.id)
    }

    if (!req.userRole || !effectiveRoles.has(req.userRole)) {
      next(ApiError.forbidden())
      return
    }

    next()
  }
}
