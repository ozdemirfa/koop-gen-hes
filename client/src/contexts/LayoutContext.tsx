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

  const value = React.useMemo(() => ({
    title,
    setTitle,
    headerActions,
    setHeaderActions
  }), [title, headerActions])

  return (
    <LayoutContext.Provider value={value}>
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

export const usePageSettings = (title: string, actions: React.ReactNode = null) => {
  const { title: currentTitle, setTitle, headerActions: currentActions, setHeaderActions } = useLayout()

  // Update title only if it changed
  React.useLayoutEffect(() => {
    if (title !== currentTitle) {
      setTitle(title)
    }
  }, [title, currentTitle, setTitle])

  // Update actions only if they are different
  // Note: We use a simple reference check for actions since they are usually memoized
  React.useEffect(() => {
    if (actions !== currentActions) {
      const timer = setTimeout(() => {
        setHeaderActions(actions)
      }, 0)
      
      return () => {
        clearTimeout(timer)
      }
    }
  }, [actions, currentActions, setHeaderActions])

  // Clear actions on unmount
  React.useEffect(() => {
    return () => {
      setHeaderActions(null)
    }
  }, [setHeaderActions])
}
