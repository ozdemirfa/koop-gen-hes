import React from 'react'
import { Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// Route guard — session + opsiyonel rol kontrolü. `requireRole='admin'` (global admin)
// veya `requireRole='staff'` (proje staff+) ile sayfa erişimi kısıtlanır.
//
// Davranış:
//   - loading → spinner
//   - session yok → /login redirect
//   - requireRole='admin' + global admin değil → /forbidden
//   - requireRole='staff' + canEdit=false → /forbidden
//   - else → children render

type RequireRole = 'admin' | 'staff'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireRole?: RequireRole
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireRole }) => {
  const { session, loading } = useAuth()
  const { isGlobalAdmin, canEdit } = usePermissions()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (requireRole === 'admin' && !isGlobalAdmin) {
    return <Navigate to="/forbidden" replace />
  }

  if (requireRole === 'staff' && !canEdit) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}
