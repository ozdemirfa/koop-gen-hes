import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import api from '../lib/api'
import type { Session, User } from '@supabase/supabase-js'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// Global rol (admin/staff) backend'den çekilir → UI gating + ProtectedRoute requireRole.
// `/api/auth/me` endpoint'i Faz 2 (#58) ile eklendi; her session değişiminde tetiklenir.

export type GlobalRole = 'admin' | 'staff' | null

interface AuthContextType {
  session: Session | null
  user: User | null
  userRole: GlobalRole
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userRole: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<GlobalRole>(null)
  const [loading, setLoading] = useState(true)

  // /api/auth/me — session token Authorization header'ına axios interceptor
  // tarafından eklenir; burada sadece çağırıp role'ı state'e yansıt.
  const fetchUserRole = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setUserRole(null)
      return
    }
    try {
      const { data } = await api.get('/auth/me')
      setUserRole((data?.data?.role as GlobalRole) ?? null)
    } catch (err) {
      // Network / 401 → role unknown; defensive null (yetki yok varsay)
      setUserRole(null)
    }
  }, [])

  useEffect(() => {
    // Sprint 20260520-perf hotfix: setLoading(false) ASLA `await
    // fetchUserRole(...)` arkasında bloklanmamalı. /api/auth/me yavaş veya hang
    // ederse ProtectedRoute sonsuza dek <Spin /> gösterir → prod sayfa açılmıyor
    // bug'ı. Session resolve olur olmaz loading=false; role fetch fire-and-forget.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        // Fire-and-forget — role daha sonra gelir, UI engellenmez.
        fetchUserRole(session)
      })
      .catch(() => {
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      fetchUserRole(session)
    })

    return () => subscription.unsubscribe()
  }, [fetchUserRole])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

        if (data.session) {
          setSession(data.session)
          setUser(data.session.user)
          // Login → loading=false hemen, role arkadan gelir.
          fetchUserRole(data.session)
        }
        setLoading(false)
        return { error: null }
      } catch (error) {
        return { error: error as Error }
      }
    },
    [fetchUserRole],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setUserRole(null)
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, userRole, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
