import React, { createContext, useContext, useState, useEffect } from 'react'
import api from '../lib/api'
import { useAuth } from './AuthContext'

interface Project {
  id: string
  proje_adi: string
  proje_kodu: string
}

interface ProjectContextType {
  projects: Project[]
  activeProject: Project | null
  setActiveProject: (project: Project | null) => void
  loading: boolean
  refreshProjects: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth()
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
  }, [session])

  const setActiveProject = (project: Project | null) => {
    setActiveProjectState(project)
    if (project) {
      localStorage.setItem('activeProjectId', project.id)
    } else {
      localStorage.removeItem('activeProjectId')
    }
  }

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProject, loading, refreshProjects }}>
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
