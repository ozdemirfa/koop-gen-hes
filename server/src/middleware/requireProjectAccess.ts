import { RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError'
import { getUserRole } from './roleCache'
import {
  getProjectRole,
  normalizeProjectRole,
  roleSatisfies,
  NewProjectRole,
  ProjectRole,
} from './projectAccessCache'

/**
 * Proje-kapsamlı bir endpoint için kullanıcı erişim kontrolü.
 *
 * Sprint role-system-modernization (PR-B):
 *   Yeni 3-rol modeli — owner > manager > user (hiyerarşik).
 *   - 'user'    — GET + POST/PUT (form girişi, edit) — varsayılan
 *   - 'manager' — yukarısı + DELETE + undo/closure-iptal + parametre/ayar
 *   - 'owner'   — yukarısı + üyelik yönetimi + şifre reset
 *
 * Legacy `'viewer'` ve `'staff'` parametreleri geriye uyumluluk için
 * tanınır ve şu şekilde map edilir:
 *   'viewer' → 'user'   (eski okuma seviyesi)
 *   'staff'  → 'user'   (eski yazma seviyesi; PR-A'dan sonra default form girişi
 *                         user'a da açık olduğundan en sık bu eşleşme)
 *
 * NOT: PR-B sonrasında route'ları tek tek doğru rolle güncelliyoruz; aliasing
 * geçiş dönemi içindir — faz 3'te (PR-D sonrası) kaldırılacak.
 *
 * Davranış:
 *  - `proje_id` `req.body`, `req.query` veya `req.params.projeId`/
 *    `req.params.proje_id`'den çekilir. `req.params.id` fallback'i YALNIZCA
 *    `req.baseUrl` `/projeler` mount path'iyle bitiyorsa devreye girer
 *    (proje-anchor rotalar). Alt-kaynak rotalarında (`/uyeler/:id` vb.)
 *    `:id` üye UUID'sidir; proje_id sanılmamalı — yoksa kafa karıştırıcı
 *    403 yerine net 400 alınır.
 *  - Eksikse `400 proje_id zorunludur`.
 *  - Global admin (`user_roles.role='admin'`) hâlâ tüm projelere `owner`
 *    seviyesinde erişebilir → req.projectRole = 'owner'. Bu legacy davranıştır
 *    ve faz 3'te kaldırılacak; ancak PR-B esnasında admin paneli çalışmaya
 *    devam etsin diye korunuyor.
 *  - Aksi halde `proje_uyelikleri` kontrol edilir; üye değilse `403`.
 *  - `minRole` rolü hiyerarşik karşılaştırılır.
 */
export type RequireProjectAccessRole = NewProjectRole | 'viewer' | 'staff'

/**
 * Verilen minRole parametresini yeni model rolüne normalize eder.
 *   'viewer' → 'user'
 *   'staff'  → 'user'   (PR-A spec: form girişi user'a açıldı; yıkıcı işlemler
 *                         endpoint düzeyinde 'manager'a yükseltilmeli)
 */
function normalizeRequiredRole(role: RequireProjectAccessRole): NewProjectRole {
  switch (role) {
    case 'owner':
    case 'manager':
    case 'user':
      return role
    case 'viewer':
      return 'user'
    case 'staff':
      return 'user'
    default:
      return 'user'
  }
}

export function requireProjectAccess(
  minRole: RequireProjectAccessRole = 'user',
): RequestHandler {
  const required = normalizeRequiredRole(minRole)

  return async (req, _res, next) => {
    try {
      if (!req.user?.id) {
        return next(ApiError.unauthorized())
      }

      // `req.params.id` fallback'i yalnızca proje-anchor mount path'i altında
      // güvenlidir. `/api/uyeler/:id`, `/api/aidatlar/:id` gibi alt-kaynak
      // rotalarında `:id` üye/aidat UUID'sidir; proje_id sanılırsa middleware
      // `proje_uyelikleri` tablosunda eşleşme bulamaz ve kafa karıştırıcı bir
      // 403 "Bu projeye erişiminiz yok" üretir (asıl problem 400 olmalıydı:
      // proje_id eksik). Bu yüzden fallback'i yalnızca `req.baseUrl` proje
      // mount path'iyle bitiyorsa devreye alıyoruz.
      const isProjeAnchorMount = req.baseUrl?.endsWith('/projeler') ?? false

      const projeIdRaw =
        (req.body && (req.body.proje_id ?? req.body.projeId)) ??
        (req.query && (req.query.proje_id ?? req.query.projeId)) ??
        req.params?.projeId ??
        req.params?.proje_id ??
        (isProjeAnchorMount ? req.params?.id : undefined)

      const projeId = typeof projeIdRaw === 'string' ? projeIdRaw.trim() : ''
      if (!projeId || projeId === 'null' || projeId === 'undefined') {
        return next(ApiError.badRequest('proje_id zorunludur'))
      }

      // Global rol cache'den okunur (auth middleware zaten yazmış olabilir).
      if (req.userRole === undefined) {
        req.userRole = await getUserRole(req.user.id)
      }

      // Legacy: Global admin → projeye 'owner' seviyesinde erişim. Faz 3'te
      // kaldırılacak (proje-bazlı owner üyeliği zaten her projede mevcut olacak).
      if (req.userRole === 'admin') {
        req.projectRole = 'owner' as ProjectRole
        return next()
      }

      const rawRole = await getProjectRole(req.user.id, projeId)
      const normalizedActual = normalizeProjectRole(rawRole)
      if (!normalizedActual) {
        return next(ApiError.forbidden('Bu projeye erişiminiz yok'))
      }

      if (!roleSatisfies(normalizedActual, required)) {
        const msg =
          required === 'owner'
            ? 'Bu işlem için proje sahibi (owner) yetkisi gerekir'
            : required === 'manager'
              ? 'Bu işlem için yönetici (manager) yetkisi gerekir'
              : 'Bu işlem için proje üyeliği gerekir'
        return next(ApiError.forbidden(msg))
      }

      req.projectRole = normalizedActual as ProjectRole
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
