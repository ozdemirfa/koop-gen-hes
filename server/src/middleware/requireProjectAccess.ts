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
import { supabaseAdmin } from '../config/supabase'
import logger from '../utils/logger'
import cache from '../lib/cache'

// Sprint V2 — Redis cache hot-swap (2026-05-26):
//   offline_mode durumu artık in-memory Map yerine cache.ts wrapper üzerinden
//   saklanır. REDIS_URL yoksa davranış birebir aynı (in-memory fallback),
//   REDIS_URL set ise cross-instance tutarlılık sağlanır.
const CACHE_TTL_SECONDS = 30
function offlineKey(projeId: string): string {
  return `offline:${projeId}`
}

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

// Sprint desktop-offline-mode (2026-05-26):
//   Mutation method'larında (POST/PUT/PATCH/DELETE) varsayılan olarak offline
//   guard çalışır. Eğer aktif proje çevrimdışı moddaysa ve çağıran kullanıcı
//   offline_mode_owner_id değilse 403 + Türkçe mesaj döner.
//
//   Bu davranış default açıktır; özel route'lar (örn. /projeler/:id/offline-mode
//   toggle endpoint'i) `{ skipOfflineCheck: true }` ile devre dışı bırakabilir.
//   Toggle endpoint'i kendisi offline_mode'u DEĞİŞTİRDİĞİ için kilitlenmemeli;
//   aksi halde owner online'a dönüş yapamaz (chicken-and-egg).
//
//   V2: cache.ts hot-swap wrapper — REDIS_URL varsa Redis, yoksa in-memory Map.
//   Cross-instance invalidation pub/sub ile sağlanır.
interface OfflineState {
  offline_mode: boolean
  offline_mode_owner_id: string | null
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Toggle endpoint'i çağrıldıktan sonra cache'i invalide eder. */
export function invalidateOfflineGuardCache(projeId: string): void {
  // Fire-and-forget: invalidate async ama void context'te çalışır.
  // Redis hatasında log'a düşer; uygulama flow'unu kesmez.
  cache.invalidate(offlineKey(projeId)).catch((err) => {
    logger.warn('requireProjectAccess: cache invalidate hatası', {
      projeId,
      err: String(err),
    })
  })
}

async function readOfflineState(projeId: string): Promise<OfflineState> {
  // Önce cache'e bak
  const cachedRaw = await cache.get(offlineKey(projeId))
  if (cachedRaw !== undefined) {
    return cachedRaw as OfflineState
  }

  // Cache miss → DB'den oku
  const { data, error } = await supabaseAdmin
    .from('projeler')
    .select('offline_mode, offline_mode_owner_id')
    .eq('id', projeId)
    .maybeSingle()
  if (error) {
    logger.warn('requireProjectAccess offline guard: state okuma hatası', {
      projeId,
      error: error.message,
    })
    // Defansif: state okunamazsa "online" varsayıp normal akışa devam.
    // Yanlış pozitif 403 vermektense gerçek mutation'ı RLS'e bırak.
    return { offline_mode: false, offline_mode_owner_id: null }
  }
  const state: OfflineState = {
    offline_mode: Boolean(data?.offline_mode),
    offline_mode_owner_id: data?.offline_mode_owner_id ?? null,
  }
  await cache.set(offlineKey(projeId), state, CACHE_TTL_SECONDS)
  return state
}

export interface RequireProjectAccessOptions {
  /** true ise offline_mode guard atlanır. Toggle endpoint'i için kullanılır. */
  skipOfflineCheck?: boolean
}

export function requireProjectAccess(
  minRole: RequireProjectAccessRole = 'user',
  options: RequireProjectAccessOptions = {},
): RequestHandler {
  const required = normalizeRequiredRole(minRole)
  const skipOfflineCheck = options.skipOfflineCheck === true

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

      // Header fallback (Sprint firmalar-offline-lock, 2026-05-26):
      //   Global master-data route'ları (firmalar vb.) body/query'de proje_id
      //   taşımıyor; ama offline guard için aktif proje bilinmeli. Frontend
      //   interceptor `X-Active-Project-Id` header'ı her istekte gönderiyor.
      const headerProjeId = req.headers['x-active-project-id']
      const headerProjeIdStr = Array.isArray(headerProjeId) ? headerProjeId[0] : headerProjeId

      const projeIdRaw =
        (req.body && (req.body.proje_id ?? req.body.projeId)) ??
        (req.query && (req.query.proje_id ?? req.query.projeId)) ??
        req.params?.projeId ??
        req.params?.proje_id ??
        (isProjeAnchorMount ? req.params?.id : undefined) ??
        headerProjeIdStr

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
      // Offline guard: global admin'i atlat — incident response erişimi korunsun.
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

      // Sprint desktop-offline-mode (2026-05-26): offline_mode guard.
      // Mutation method ise ve route skipOfflineCheck ile opt-out etmediyse,
      // proje offline'da ve çağıran owner değilse 403.
      const isMutation = MUTATION_METHODS.has((req.method || '').toUpperCase())
      if (!skipOfflineCheck && isMutation) {
        const state = await readOfflineState(projeId)
        if (state.offline_mode && state.offline_mode_owner_id !== req.user.id) {
          return next(
            ApiError.forbidden(
              'Bu proje çevrimdışı modda — proje sahibi tekrar açana kadar değişiklik yapılamaz, yalnızca görüntüleyebilirsiniz.'
            )
          )
        }
      }

      return next()
    } catch (err) {
      return next(err)
    }
  }
}
