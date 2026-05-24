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

  // Convenience
  hasActiveProject: boolean
}

/**
 * Backend'in döndürebileceği eski rol değerlerini yeni modele normalize eder.
 * server/src/middleware/projectAccessCache.normalizeProjectRole ile aynı mantık.
 */
function normalizeProjectRole(role: ProjectRole): NewProjectRole | null {
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

export function usePermissions(): Permissions {
  const { userRole, isYetkili, isAdmin, session } = useAuth()
  const { activeProject, activeProjectRole } = useProject()

  return useMemo<Permissions>(() => {
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

    // canView: aktif projede herhangi bir rol var mı? (üye değilse false)
    const canView = projectRole !== null
    // canEdit: her üye form girişi yapabilir (POST/PUT). En düşük seviye olan
    // 'user' rolü dahil.
    const canEdit = projectRole !== null
    // canDelete: yıkıcı işlemler — manager+
    const canDelete = isManager
    // canManageUsers: Kullanıcı Yönetimi sayfası erişimi — manager+
    const canManageUsers = isManager

    // Global referans veri (birim/poz/parametre) — sistem genelinde paylaşılan
    // tanımlar. Sil/düzenle yalnız global admin'e ayrılır; ekleme + parametre
    // güncelleme global admin + yetkili global rol + proje manager+'a açık.
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
      hasActiveProject: !!activeProject,
    }
  }, [userRole, isYetkili, isAdmin, session, activeProject, activeProjectRole])
}
