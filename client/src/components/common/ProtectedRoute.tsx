import React from 'react'
import { Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useProject } from '../../contexts/ProjectContext'
import { usePermissions } from '../../hooks/usePermissions'

// Sprint role-system-modernization (PR-C, 2026-05-20):
// Route guard — session + opsiyonel rol kontrolü.
//
// `requireRole` (yeni model):
//   - 'user'    → en az 'user' rolü (aslında üyelik) — `canView`
//   - 'manager' → manager+ — `canManageUsers` / `isManager`
//   - 'owner'   → sadece owner
//
// Legacy aliases (geriye uyumluluk — PR-D sonrası kaldırılacak):
//   - 'admin'   → 'manager' olarak normalize edilir
//                 (eski global admin kontrolü → şimdi proje manager+)
//   - 'staff'   → 'user' (eski staff = düzenleyebilen üye)
//
// Davranış:
//   - loading → spinner
//   - session yok → /login
//   - rol yetmiyorsa → /forbidden
//   - else → children

type RequireRole = 'admin' | 'staff' | 'owner' | 'manager' | 'user'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireRole?: RequireRole
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireRole }) => {
  const { session, loading } = useAuth()
  const { initialized: projectInitialized } = useProject()
  const { isOwner, isManager, canView } = usePermissions()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (!requireRole) return <>{children}</>

  // Hydration race fix: rol kontrolü aktif projenin rolüne (ProjectContext) dayanır.
  // Tam sayfa yenilemede (örn. gated route'a direkt URL/bookmark ile giriş) proje
  // listesi async fetch edilirken activeProject/Role henüz null olur. Global admin
  // OLMAYAN kullanıcılar için bu, rol gelmeden isManager/isOwner=false görünüp
  // hatalı /forbidden redirect'ine yol açıyordu (redirect sonrası rol gelse de
  // geri dönülmüyordu). İlk proje fetch'i bitene (initialized) kadar bekle.
  // NOT: `loading` kullanılamaz — oturum gelmeden no-session dalında erkenden
  // false'a düşüyor ve fetch sırasında true'ya dönmüyor.
  if (!projectInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  // Legacy aliasing
  const normalized: 'owner' | 'manager' | 'user' =
    requireRole === 'owner'
      ? 'owner'
      : requireRole === 'admin' || requireRole === 'manager'
        ? 'manager'
        : 'user' // 'staff' | 'user'

  if (normalized === 'owner' && !isOwner) {
    return <Navigate to="/forbidden" replace />
  }

  if (normalized === 'manager' && !isManager) {
    return <Navigate to="/forbidden" replace />
  }

  // 'user' route'u = en az üyelik (görüntüleme). canEdit DEĞİL (Sprint
  // user-role-readonly sonrası canEdit=manager+; salt-okunur user view-level
  // route'lara erişebilmeli), canView (= projectRole !== null) kontrol edilir.
  if (normalized === 'user' && !canView) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}
