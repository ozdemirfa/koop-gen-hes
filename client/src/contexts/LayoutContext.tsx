import React, { createContext, useContext, useState, useCallback } from 'react'

interface LayoutContextType {
  title: string
  setTitle: (title: string) => void
  headerActions: React.ReactNode | null
  setHeaderActions: (actions: React.ReactNode | null) => void
  headerRightActions: React.ReactNode | null
  setHeaderRightActions: (actions: React.ReactNode | null) => void
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('')
  const [headerActions, setHeaderActions] = useState<React.ReactNode | null>(null)
  const [headerRightActions, setHeaderRightActions] = useState<React.ReactNode | null>(null)

  const value = React.useMemo(() => ({
    title,
    setTitle,
    headerActions,
    setHeaderActions,
    headerRightActions,
    setHeaderRightActions
  }), [title, headerActions, headerRightActions])

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

export const usePageSettings = (title: string, actions: React.ReactNode = null, rightActions: React.ReactNode = null) => {
  const { 
    title: currentTitle, 
    setTitle, 
    headerActions: currentActions, 
    setHeaderActions,
    headerRightActions: currentRightActions,
    setHeaderRightActions
  } = useLayout()

  // Update title only if it changed
  React.useLayoutEffect(() => {
    if (title !== currentTitle) {
      setTitle(title)
    }
  }, [title, currentTitle, setTitle])

  // Update actions
  React.useEffect(() => {
    if (actions !== currentActions) {
      const timer = setTimeout(() => {
        setHeaderActions(actions)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [actions, currentActions, setHeaderActions])

  // Update right actions
  React.useEffect(() => {
    if (rightActions !== currentRightActions) {
      const timer = setTimeout(() => {
        setHeaderRightActions(rightActions)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [rightActions, currentRightActions, setHeaderRightActions])

  // Clear actions on unmount
  React.useEffect(() => {
    return () => {
      setHeaderActions(null)
      setHeaderRightActions(null)
    }
  }, [setHeaderActions, setHeaderRightActions])
}
