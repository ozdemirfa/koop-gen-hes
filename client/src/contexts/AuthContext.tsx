import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import api from '../lib/api'
import { setActiveProjectId } from '../lib/activeProjectStore'
import type { Session, User } from '@supabase/supabase-js'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// Global rol (admin/staff) backend'den çekilir → UI gating + ProtectedRoute requireRole.
// `/api/auth/me` endpoint'i Faz 2 (#58) ile eklendi; her session değişiminde tetiklenir.
//
// PR-B (yetkili global rol sistemi):
// - GlobalRole genişletildi: 'admin' | 'yetkili' | 'staff' | null
// - isYetkili: admin VEYA yetkili → proje oluşturma yetkisi
// - isAdmin: sadece 'admin'

export type GlobalRole = 'admin' | 'yetkili' | 'staff' | null

interface AuthContextType {
  session: Session | null
  user: User | null
  userRole: GlobalRole
  /** Computed: admin VEYA yetkili → proje oluşturabilir */
  isYetkili: boolean
  /** Computed: sadece 'admin' */
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userRole: null,
  isYetkili: false,
  isAdmin: false,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<GlobalRole>(null)
  const [loading, setLoading] = useState(true)

  // Kullanıcı kimliği değişimini (A → B veya X → çıkış) yakalamak için son
  // görülen user id'yi tutarız. `undefined` = henüz hiç session resolve
  // edilmedi (ilk mount). Bu sayede ilk yüklemede gereksiz cache temizliği +
  // refetch storm tetiklenmez; yalnızca gerçek kimlik değişiminde temizleriz.
  const lastUserIdRef = useRef<string | null | undefined>(undefined)

  // Oturum değişiminde başka kullanıcıdan kalan veri sızmasın diye:
  //   - React Query cache tamamen temizlenir (eski kullanıcının ['projeler']
  //     vb. tüm listeleri),
  //   - aktif proje seçimi (localStorage) sıfırlanır.
  // Aksi halde yeni kullanıcı, erişimi olmayan eski projeleri listede görür ve
  // içine girince backend 403 döner (gördüğümüz "yetkiniz yok" senaryosu).
  // TOKEN_REFRESHED gibi aynı kullanıcının olaylarında temizlik YAPILMAZ.
  const resetUserScopedState = useCallback(() => {
    setActiveProjectId(null)
    queryClient.clear()
  }, [queryClient])

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

  // Session'ı state'e uygula + kimlik değiştiyse kullanıcıya özel state'i sıfırla.
  // getSession (ilk mount), onAuthStateChange ve signIn bu tek noktadan geçer.
  const applySession = useCallback(
    (nextSession: Session | null) => {
      const nextUserId = nextSession?.user?.id ?? null
      const identityChanged =
        lastUserIdRef.current !== undefined && lastUserIdRef.current !== nextUserId
      if (identityChanged) {
        resetUserScopedState()
        setUserRole(null)
      }
      lastUserIdRef.current = nextUserId
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
      // Fire-and-forget — role daha sonra gelir, UI engellenmez.
      fetchUserRole(nextSession)
    },
    [fetchUserRole, resetUserScopedState],
  )

  useEffect(() => {
    // Sprint 20260520-perf hotfix: setLoading(false) ASLA `await
    // fetchUserRole(...)` arkasında bloklanmamalı. /api/auth/me yavaş veya hang
    // ederse ProtectedRoute sonsuza dek <Spin /> gösterir → prod sayfa açılmıyor
    // bug'ı. Session resolve olur olmaz loading=false; role fetch fire-and-forget.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session)
      })
      .catch(() => {
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => subscription.unsubscribe()
  }, [applySession])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

        if (data.session) {
          // applySession kimlik değişimini yakalar; başka kullanıcıyla giriş
          // yapıldığında eski cache + aktif proje temizlenir.
          applySession(data.session)
        }
        setLoading(false)
        return { error: null }
      } catch (error) {
        return { error: error as Error }
      }
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    // Çıkışta da kullanıcıya özel state'i hemen temizle (onAuthStateChange
    // SIGNED_OUT da applySession ile aynısını yapar; idempotent).
    resetUserScopedState()
    lastUserIdRef.current = null
    setSession(null)
    setUser(null)
    setUserRole(null)
  }, [resetUserScopedState])

  const isAdmin = userRole === 'admin'
  const isYetkili = userRole === 'admin' || userRole === 'yetkili'

  return (
    <AuthContext.Provider value={{ session, user, userRole, isYetkili, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
