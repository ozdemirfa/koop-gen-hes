import React, { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef } from 'react'
import api from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Sprint role-system-modernization (PR-C):
// Backend 3-rol modeli (owner > manager > user) frontend'e taşındı.
// Legacy değerler ('admin'/'staff'/'viewer') tip union'da geriye uyumluluk için
// kalır ve `usePermissions` içinde normalize edilir. Eski cache + henüz upgrade
// edilmemiş response'lar (örn. browser memory'deki eski state) için defensive
// programming.
//
// `current_user_role` alanı backend Faz 2 (#58) ile eklendi; PR-A migration
// sonrası DB'de yalnızca yeni roller (owner/manager/user) saklanıyor — ancak
// PR-B'deki getProjectRole cache normalize layer'ı eski değerleri tolere ediyor.
//
// Sprint desktop-offline-mode (2026-05-26): web tarafına offline gating
// eklendi. Owner desktop'tan offline'a aldığında flag Supabase'e düşer; web
// kullanıcılarının ProjectContext'i bunu fark edip UI'ı read-only moda çekmeli.
// Yansıma stratejisi (3 katman):
//   1. refreshProjects() — manuel veya yeni proje seçiminde fresh state
//   2. Supabase Realtime subscription — offline_mode değişimini ≤2sn yakala
//   3. window 'focus' event — tab geri geldiğinde fresh state için lightweight
//      refresh (Realtime düşerse fallback)

export type NewProjectRole = 'owner' | 'manager' | 'user'
export type LegacyProjectRole = 'admin' | 'staff' | 'viewer'
export type ProjectRole = NewProjectRole | LegacyProjectRole | null

interface Project {
  id: string
  proje_adi: string
  proje_kodu: string
  durum: string
  baslangic_tarihi?: string
  bitis_tarihi?: string
  current_user_role?: ProjectRole
  // Sprint desktop-offline-mode (2026-05-26): proje çevrimdışı modda mı?
  // true ise yalnız offline_mode_owner_id güncelleyebilir (RLS + middleware +
  // UI gating üç kat savunma).
  offline_mode?: boolean
  offline_mode_owner_id?: string | null
  offline_mode_set_at?: string | null
}

interface ProjectContextType {
  projects: Project[]
  activeProject: Project | null
  activeProjectRole: ProjectRole
  setActiveProject: (project: Project | null) => void
  loading: boolean
  refreshProjects: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, userRole } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  // refreshProjects'i useCallback ile sarıyoruz — useEffect/listener'ların
  // bağımlılıklarında stable referans gerekir (yoksa Realtime cleanup loop'a girer).
  const refreshProjects = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }

    try {
      const response = await api.get('/projeler')
      if (response.data.success) {
        setProjects(response.data.data)

        // Restore from localStorage if possible. Sprint proje-silme-akisi
        // (2026-05-24): aktif proje arşivlenmiş/silinmişse listeden gelmez —
        // başka projeye fallback yap; hiç proje yoksa aktif proje + localStorage
        // temizle (aksi halde detay sayfaları kayıp ID ile 403/404 üretir).
        const savedProjectId = localStorage.getItem('activeProjectId')
        if (savedProjectId) {
          const project = response.data.data.find((p: Project) => p.id === savedProjectId)
          if (project) {
            setActiveProjectState(project)
          } else if (response.data.data.length > 0) {
            setActiveProjectState(response.data.data[0])
            localStorage.setItem('activeProjectId', response.data.data[0].id)
          } else {
            setActiveProjectState(null)
            localStorage.removeItem('activeProjectId')
          }
        } else if (response.data.data.length > 0) {
          setActiveProjectState(response.data.data[0])
        }
      }
    } catch (error) {
      console.error('Projeler yüklenirken hata:', error)
    } finally {
      setLoading(false)
    }
  }, [session])

  // Session değiştiğinde projeleri tazele
  useEffect(() => {
    if (session) {
      refreshProjects()
    } else {
      setProjects([])
      setActiveProjectState(null)
      setLoading(false)
    }
  }, [session, refreshProjects])

  // Sprint desktop-offline-mode (2026-05-26): Realtime subscription
  // —————————————————————————————————————————————————————————————————
  // Owner desktop'tan offline'a alırsa Supabase'e PATCH gider; web tarafındaki
  // diğer kullanıcılar bu değişikliği fark etmeli (UI gating). Stratejiler:
  //
  //   (A) Realtime — Supabase'in `postgres_changes` event'ini dinler. Offline
  //       toggle ortalama <2sn yansır. Gerektirir: Supabase projesinde
  //       Realtime aktif + `projeler` tablosunda REPLICA IDENTITY FULL veya
  //       publication ayarı. Çoğu yeni Supabase projesinde varsayılan açık.
  //   (B) window focus event — tab geri öne geldiğinde refreshProjects'i
  //       çağırır. (A) düşse bile UX'i kurtarır.
  //
  // İki katman birlikte: Realtime canlı yansıma + focus refresh düşük-kalite
  // garanti. Tek bir kullanıcının makinesinde "offline projeye yazmaya
  // çalışan" senaryosu zaten zaman dilimi içinde 403 alır; bu listener'lar
  // kullanıcıya banner göstermek + butonları disable etmek içindir.
  const refreshRef = useRef(refreshProjects)
  refreshRef.current = refreshProjects

  useEffect(() => {
    if (!session) return

    // (A) Realtime
    const channel = supabase
      .channel('projeler-offline-mode-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projeler',
        },
        (payload) => {
          // Bütün proje güncellemelerinde patlamamak için sadece offline_mode
          // gerçekten değiştiyse refresh tetikle. (Aksi halde her PUT
          // /projeler/:id yarış halinde tüm tab'larda refresh'i tetikleyebilir.)
          const newRow = payload.new as Record<string, unknown> | undefined
          const oldRow = payload.old as Record<string, unknown> | undefined
          if (!newRow) return
          if (oldRow && newRow.offline_mode === oldRow.offline_mode) return
          refreshRef.current?.()
        },
      )
      .subscribe()

    // (B) Focus refresh — Realtime kanalı kapanırsa bile UX kurtarılır.
    // Throttle: tab focus rapid-fire olabilir; 5sn cooldown.
    let lastFocusRefresh = 0
    const onFocus = () => {
      const now = Date.now()
      if (now - lastFocusRefresh < 5000) return
      lastFocusRefresh = now
      refreshRef.current?.()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
    }
  }, [session])

  const setActiveProject = (project: Project | null) => {
    setActiveProjectState(project)
    if (project) {
      localStorage.setItem('activeProjectId', project.id)
    } else {
      localStorage.removeItem('activeProjectId')
    }
  }

  // Aktif projenin rolü:
  //   - Global admin (legacy) → 'owner' (her projede owner gibi davranır;
  //     PR-D sonrası global admin tamamen kaldırılacak)
  //   - Aksi halde backend response'taki `current_user_role`
  // `userRole === 'admin'` legacy bir durumdur; PR-B sonrası user_roles tablosu
  // ileride boşalacak. Bu dönüşüm geçici köprü.
  const activeProjectRole: ProjectRole = useMemo(() => {
    if (!activeProject) return null
    if (userRole === 'admin') return 'owner'
    return (activeProject.current_user_role ?? null) as ProjectRole
  }, [activeProject, userRole])

  return (
    <ProjectContext.Provider
      value={{ projects, activeProject, activeProjectRole, setActiveProject, loading, refreshProjects }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
