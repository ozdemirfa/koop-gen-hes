import { RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError'
import { AppRole, ROLE_RANK, getUserRole } from './roleCache'

/**
 * Sprint yetkili-role-system (PR-A, 2026-05-22):
 *   Role hiyerarşisi: admin > yetkili > staff (rank 3 > 2 > 1).
 *   requireRole(R) → kullanıcının rolü R'nin rank'inden büyük veya eşit olmalı.
 *   Birden fazla rol verilirse en düşük rank'i baz alınır (en izinli giriş kapısı).
 */
export function requireRole(...roles: AppRole[]): RequestHandler {
  if (roles.length === 0) {
    throw new Error('requireRole en az bir rol parametresi ister')
  }
  // En düşük rank'i bul — kullanıcı rolü bu rank'in üzerinde olmalı.
  const minRequiredRank = Math.min(...roles.map((r) => ROLE_RANK[r]))

  return async (req, _res, next) => {
    if (!req.user?.id) {
      next(ApiError.unauthorized())
      return
    }

    if (req.userRole === undefined) {
      req.userRole = await getUserRole(req.user.id)
    }

    if (!req.userRole || ROLE_RANK[req.userRole] < minRequiredRank) {
      next(ApiError.forbidden())
      return
    }

    next()
  }
}

/**
 * Sprint yetkili-role-system (PR-A): proje oluşturma akışı için kısa-yol.
 * admin VEYA yetkili global rolüne sahip kullanıcıyı geçirir; aksi 403.
 *
 * Tipik kullanım:
 *   router.post('/projeler', requireYetkili, projelerController.createProje)
 */
export const requireYetkili: RequestHandler = requireRole('yetkili')
