import { useMemo } from 'react'
import { useAuth, type GlobalRole } from '../contexts/AuthContext'
import {
  useProject,
  type ProjectRole,
  type NewProjectRole,
} from '../contexts/ProjectContext'

// Sprint role-system-modernization (PR-C, 2026-05-20):
//
// 3-rol hiyerarşik modeli (owner > manager > user):
//   - 'owner'    — proje sahibi. Üyelik yönetimi + her şey.
//   - 'manager'  — yıkıcı işlemler (DELETE, undo, closure-iptal, eşleşme-iptal)
//                  + parametre/ayar değişiklikleri + her şey + form girişi.
//   - 'user'     — temel veri girişi (POST/PUT) + okuma. Silme/undo yok.
//
// Bu hook'un türev flag'leri:
//   - isOwner          → sadece owner
//   - isManager        → owner + manager
//   - canEdit          → owner + manager + user (her üye form girişi yapabilir)
//   - canDelete        → owner + manager (yıkıcı işlemler)
//   - canManageUsers   → owner + manager (Kullanıcı Yönetimi sayfası erişimi)
//
// Legacy uyumluluk:
//   - `isGlobalAdmin`     — KALDIRILDI. Global admin artık 'owner' olarak
//                            normalize edilir. Yine de geriye uyumluluk için
//                            geçici bir flag olarak `isLegacyGlobalAdmin`
//                            yayımlanır (sadece menü öğeleri için kullanılır,
//                            PR-D sonrası tamamen kaldırılacak).
//   - `canManageProject`  — `isManager` ile eşit, geriye uyumluluk için kalır.
//   - Backend ProjectRole `'admin'/'staff'/'viewer'` döndürürse normalize edilir:
//       admin  → owner
//       staff  → manager
//       viewer → user
//     (server/projectAccessCache.ts ile aynı mantık)
//
// Üye değilse: tüm flag'ler false.

export interface Permissions {
  // Global rol (legacy — sadece menü filtrelemesi için bekletiliyor)
  globalRole: GlobalRole
  isLegacyGlobalAdmin: boolean
  /** @deprecated PR-D ile kaldırılacak. Kullanım: `canManageUsers` veya `isOwner`. */
  isGlobalAdmin: boolean
  isAuthenticated: boolean

  // PR-B: yetkili global rol sistemi
  /** admin VEYA yetkili → proje oluşturabilir */
  isAdmin: boolean
  /** admin VEYA yetkili global rol — proje oluşturma yetkisi */
  canCreateProjects: boolean

  // Yeni model — projeye özgü roller
  projectRole: NewProjectRole | null
  rawProjectRole: ProjectRole

  // Hiyerarşi flag'leri
  isOwner: boolean
  isManager: boolean

  // Action izinleri
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canManageUsers: boolean
  /** @deprecated `isManager` kullanın. */
  canManageProject: boolean

  // Global referans veri (birim/poz/parametre) izinleri
  /** Birim/poz silme & düzenleme — yalnız sistem admin (global 'admin' rolü). */
  canManageGlobalDefs: boolean
  /** Birim/poz ekleme + sistem parametresi düzenleme — admin, yetkili veya isManager. */
  canCreateGlobalDefs: boolean

  // Sprint desktop-offline-mode (2026-05-26): proje çevrimdışı modda mı +
  // çağıran kullanıcı için kısıtlanmış mı?
  /** Aktif proje offline_mode = true mı? */
  isOfflineMode: boolean
  /** Offline modda ve çağıran non-owner → tüm write işlemleri engellenir. */
  isOfflineRestricted: boolean

  // Convenience
  hasActiveProject: boolean
}

/**
 * Backend'in döndürebileceği eski rol değerlerini yeni modele normalize eder.
 * server/src/middleware/projectAccessCache.normalizeProjectRole ile aynı mantık.
 */
export function normalizeProjectRole(role: ProjectRole): NewProjectRole | null {
  if (!role) return null
  switch (role) {
    case 'owner':
    case 'manager':
    case 'user':
      return role
    case 'admin':
      return 'owner'
    case 'staff':
      return 'manager'
    case 'viewer':
      return 'user'
    default:
      return null
  }
}

export interface PermissionsInput {
  userRole: GlobalRole
  isYetkili: boolean
  isAdmin: boolean
  session: unknown
  activeProject: { offline_mode?: boolean | null } | null | undefined
  activeProjectRole: ProjectRole
}

/**
 * Saf izin hesaplaması — hook'tan ayrı, test edilebilir (TEST-5, 2026-06-02).
 * usePermissions bunu useMemo içinde çağırır; rol matrisi mantığı burada.
 */
export function computePermissions(input: PermissionsInput): Permissions {
  const { userRole, isYetkili, isAdmin, session, activeProject, activeProjectRole } = input
    const isLegacyGlobalAdmin = userRole === 'admin'
    const isAuthenticated = !!session

    // PR-B: canCreateProjects → admin VEYA yetkili global rol
    const canCreateProjects = isYetkili // isYetkili = admin || yetkili

    // Global admin (legacy) — her projede owner. PR-D sonrası kaldırılacak.
    const projectRole: NewProjectRole | null = isLegacyGlobalAdmin
      ? 'owner'
      : normalizeProjectRole(activeProjectRole)

    const isOwner = projectRole === 'owner'
    const isManager = projectRole === 'owner' || projectRole === 'manager'

    // Sprint desktop-offline-mode (2026-05-26): aktif proje çevrimdışı modda mı?
    // Owner (proje sahibi) dışındaki herkes (manager + user) read-only düşer.
    // Backend (requireProjectAccess) + RLS (can_write_offline_project) aynı
    // kuralı dayatır; bu UI gating defansif (early-fail, daha iyi UX). Global
    // admin (legacy) yine geçer çünkü projectRole 'owner' olarak normalize edilmişti.
    //
    // Davranış kullanıcının açık talebiyle eşleşir:
    //   "olması gereken web ekranlarında proje çevrimdışı görünmesi.
    //    sadece görüntüleme yapılabilir. proje sahibi açana kadar kayıt
    //    değişiklik yapılamaz mesajı vermesi ve kayıt değişikliği engel olması."
    const isOfflineMode = activeProject?.offline_mode === true
    const isOfflineRestricted = isOfflineMode && !isOwner

    // canView: aktif projede herhangi bir rol var mı? (üye değilse false)
    const canView = projectRole !== null
    // canEdit: kayıt oluşturma/düzenleme (POST/PUT) — manager+ (owner + manager).
    // Sprint user-role-readonly (2026-05-30): 'user' rolü artık SALT-OKUNUR;
    // yalnız canView'a sahiptir. Yazma yetkisi manager+'a daraltıldı (backend
    // requireProjectAccess('manager') ile birebir). Offline modda non-owner için false.
    const canEdit = isManager && !isOfflineRestricted
    // canDelete: yıkıcı işlemler — manager+. Offline modda non-owner için false.
    const canDelete = isManager && !isOfflineRestricted
    // canManageUsers: Kullanıcı Yönetimi sayfası erişimi — manager+. Offline
    // modda non-owner için false (üye ekleme/silme sync sırası bozar). Bu,
    // kullanıcının açıkça vurguladığı "üye eklemek" senaryosunu da kapsar.
    const canManageUsers = isManager && !isOfflineRestricted

    // Global referans veri (birim/poz/parametre) — sistem genelinde paylaşılan
    // tanımlar. Sil/düzenle yalnız global admin'e ayrılır; ekleme + parametre
    // güncelleme global admin + yetkili global rol + proje manager+'a açık.
    // Offline restriction global tanımlar için uygulanmaz (proje-bazlı değil).
    const canManageGlobalDefs = isLegacyGlobalAdmin
    const canCreateGlobalDefs = isYetkili || isManager

    return {
      globalRole: userRole,
      isLegacyGlobalAdmin,
      isGlobalAdmin: isLegacyGlobalAdmin, // legacy alias
      isAuthenticated,
      isAdmin,
      canCreateProjects,
      projectRole,
      rawProjectRole: activeProjectRole,
      isOwner,
      isManager,
      canView,
      canEdit,
      canDelete,
      canManageUsers,
      canManageProject: isManager, // legacy alias
      canManageGlobalDefs,
      canCreateGlobalDefs,
      isOfflineMode,
      isOfflineRestricted,
      hasActiveProject: !!activeProject,
    }
}

export function usePermissions(): Permissions {
  const { userRole, isYetkili, isAdmin, session } = useAuth()
  const { activeProject, activeProjectRole } = useProject()

  return useMemo<Permissions>(
    () => computePermissions({ userRole, isYetkili, isAdmin, session, activeProject, activeProjectRole }),
    [userRole, isYetkili, isAdmin, session, activeProject, activeProjectRole],
  )
}
