import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import api from '../lib/api'
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

  const refreshProjects = async () => {
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
  }

  // Session değiştiğinde projeleri tazele
  useEffect(() => {
    if (session) {
      refreshProjects()
    } else {
      setProjects([])
      setActiveProjectState(null)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
