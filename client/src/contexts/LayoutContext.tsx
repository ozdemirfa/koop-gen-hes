import React, { createContext, useContext, useState, useCallback } from 'react'

interface LayoutContextType {
  title: string
  setTitle: (title: string) => void
  headerActions: React.ReactNode | null
  setHeaderActions: (actions: React.ReactNode | null) => void
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('')
  const [headerActions, setHeaderActions] = useState<React.ReactNode | null>(null)

  return (
    <LayoutContext.Provider value={{ title, setTitle, headerActions, setHeaderActions }}>
      {children}
    </LayoutContext.Provider>
  )
}

export const useLayout = () => {
  const context = useContext(LayoutContext)
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}

export const usePageSettings = (settings: { title: string; actions?: React.ReactNode }) => {
  const { setTitle, setHeaderActions } = useLayout()
  const settingsRef = React.useRef(settings)

  // Sadece başlık veya aksiyonlar gerçekten değiştiğinde güncelleme yap
  React.useEffect(() => {
    // Immediate update can cause infinite loops if actions are created inline in components
    const timer = setTimeout(() => {
      setTitle(settings.title)
      setHeaderActions(settings.actions || null)
    }, 0)
    
    return () => {
      clearTimeout(timer)
      // Sayfadan ayrılırken temizle
      //setTitle('')
      //setHeaderActions(null)
    }
  }, [settings.title, settings.actions, setTitle, setHeaderActions])
}
