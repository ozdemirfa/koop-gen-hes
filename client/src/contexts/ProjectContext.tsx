import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import api from '../lib/api'
import { useAuth } from './AuthContext'

// Sprint 20260520-frontend-role-awareness (Faz 3a):
// Proje listesi response'unda backend Faz 2 (#58) ile eklenmiş `current_user_role`
// alanı (`admin`/`staff`/`viewer`/null). Bu projeye özgü rol, AuthContext'in global
// rol'ünün yanına eklenir → usePermissions hook'u bu iki kanalı birleştirir.

export type ProjectRole = 'admin' | 'staff' | 'viewer' | null

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

        // Restore from localStorage if possible
        const savedProjectId = localStorage.getItem('activeProjectId')
        if (savedProjectId) {
          const project = response.data.data.find((p: Project) => p.id === savedProjectId)
          if (project) {
            setActiveProjectState(project)
          } else if (response.data.data.length > 0) {
            setActiveProjectState(response.data.data[0])
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

  // Aktif projenin rolü = global admin ise 'admin', aksi halde response'taki
  // `current_user_role`. Backend zaten admin için 'admin' kısayolunu döndürüyor
  // ama kullanıcı global admin'ken aktif proje değiştiğinde de tutarlı kalsın.
  const activeProjectRole: ProjectRole = useMemo(() => {
    if (!activeProject) return null
    if (userRole === 'admin') return 'admin'
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
