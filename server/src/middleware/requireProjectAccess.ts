import { RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError'
import { getUserRole } from './roleCache'
import { getProjectRole, ProjectRole } from './projectAccessCache'

/**
 * Proje-kapsamlı bir endpoint için kullanıcı erişim kontrolü.
 *
 * Davranış:
 *  - `proje_id` `req.body`, `req.query` veya `req.params.projeId`/`req.params.id`'den çekilir.
 *  - Eksikse `400 proje_id zorunludur`.
 *  - Global admin (`user_roles.role='admin'`) tüm projeleri yönetir → `req.projectRole = 'admin'`.
 *  - Aksi halde `proje_uyelikleri` kontrol edilir; üye değilse `403`.
 *  - `minRole='staff'` parametresiyle çağrılırsa `viewer` rolü 403 alır.
 *
 * Mutate eden endpoint'lerde `requireProjectAccess('staff')`, okuma için
 * `requireProjectAccess()` (default 'viewer') yeterlidir.
 */
export function requireProjectAccess(minRole: 'viewer' | 'staff' = 'viewer'): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user?.id) {
        return next(ApiError.unauthorized())
      }

      const projeIdRaw =
        (req.body && (req.body.proje_id ?? req.body.projeId)) ??
        (req.query && (req.query.proje_id ?? req.query.projeId)) ??
        req.params?.projeId ??
        req.params?.id

      const projeId = typeof projeIdRaw === 'string' ? projeIdRaw.trim() : ''
      if (!projeId || projeId === 'null' || projeId === 'undefined') {
        return next(ApiError.badRequest('proje_id zorunludur'))
      }

      // Global rol cache'den okunur (auth middleware zaten yazmış olabilir).
      if (req.userRole === undefined) {
        req.userRole = await getUserRole(req.user.id)
      }

      // Global admin → projeye erişim her zaman vardır.
      if (req.userRole === 'admin') {
        req.projectRole = 'admin'
        return next()
      }

      const projectRole = await getProjectRole(req.user.id, projeId)
      if (!projectRole) {
        return next(ApiError.forbidden('Bu projeye erişiminiz yok'))
      }

      if (minRole === 'staff' && projectRole === 'viewer') {
        return next(ApiError.forbidden('Bu işlem için düzenleyici yetkisi gerekir'))
      }

      req.projectRole = projectRole as ProjectRole
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
