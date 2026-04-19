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
  const { title: currentTitle, setTitle, setHeaderActions } = useLayout()

  // Update title immediately in layout phase to avoid flickering
  React.useLayoutEffect(() => {
    if (settings.title !== currentTitle) {
      setTitle(settings.title)
    }
  }, [settings.title, setTitle, currentTitle])

  // Defer actions update to avoid infinite loop when actions is a new JSX element
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setHeaderActions(settings.actions || null)
    }, 0)
    
    return () => clearTimeout(timer)
  }, [settings.actions, setHeaderActions])
}
