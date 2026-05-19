import { useMemo } from 'react'
import { useAuth, type GlobalRole } from '../contexts/AuthContext'
import { useProject, type ProjectRole } from '../contexts/ProjectContext'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// UI gating için tek-noktadan rol bilgisi. Global rol (auth.users + user_roles)
// + aktif projedeki rol (proje_uyelikleri) birleştirilir.
//
// Hiyerarşi:
//   - Global admin → her şeye yetkili (canEdit=true, canManageProject=true, isGlobalAdmin=true)
//   - Proje admin → o projede her şeye yetkili (canEdit=true, canManageProject=true)
//   - Proje staff → görüntüle + düzenle (canEdit=true, canManageProject=false)
//   - Proje viewer → sadece görüntüle (canEdit=false, canView=true)
//   - Üye değil → canView=false (genelde rota seviyesinde redirect olur)

export interface Permissions {
  // Global rol
  globalRole: GlobalRole
  isGlobalAdmin: boolean
  isAuthenticated: boolean

  // Aktif proje rolü
  projectRole: ProjectRole
  canView: boolean
  canEdit: boolean
  canManageProject: boolean

  // Convenience flag — aktif proje var mı?
  hasActiveProject: boolean
}

export function usePermissions(): Permissions {
  const { userRole, session } = useAuth()
  const { activeProject, activeProjectRole } = useProject()

  return useMemo<Permissions>(() => {
    const isGlobalAdmin = userRole === 'admin'
    const isAuthenticated = !!session

    const projectRole: ProjectRole = isGlobalAdmin ? 'admin' : activeProjectRole
    const canView = isGlobalAdmin || projectRole === 'admin' || projectRole === 'staff' || projectRole === 'viewer'
    const canEdit = isGlobalAdmin || projectRole === 'admin' || projectRole === 'staff'
    const canManageProject = isGlobalAdmin || projectRole === 'admin'

    return {
      globalRole: userRole,
      isGlobalAdmin,
      isAuthenticated,
      projectRole,
      canView,
      canEdit,
      canManageProject,
      hasActiveProject: !!activeProject,
    }
  }, [userRole, session, activeProject, activeProjectRole])
}
