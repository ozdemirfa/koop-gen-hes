import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react'

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

  // Use stable setters that only update if the value is truly different
  // For strings it's easy. For React nodes, we do a basic comparison.
  const setTitleStable = useCallback((newTitle: string) => {
    setTitle(prev => prev === newTitle ? prev : newTitle)
  }, [])

  // Reference equality yeterli; usePageSettings hook'u zaten lastActions ref'i ile
  // gereksiz çağrıları filtreliyor. type+key tabanlı sığ karşılaştırma children
  // değişimini göremediği için sayfa data'sı async geldiğinde header güncel
  // kalmıyordu (örn. Hakediş Detay → veri yüklenince beliren Kaydet/Onayla butonları).
  const setHeaderActionsStable = useCallback((actions: React.ReactNode | null) => {
    setHeaderActions(prev => prev === actions ? prev : actions)
  }, [])

  const setHeaderRightActionsStable = useCallback((actions: React.ReactNode | null) => {
    setHeaderRightActions(prev => prev === actions ? prev : actions)
  }, [])

  const value = useMemo(() => ({
    title,
    setTitle: setTitleStable,
    headerActions,
    setHeaderActions: setHeaderActionsStable,
    headerRightActions,
    setHeaderRightActions: setHeaderRightActionsStable
  }), [title, headerActions, headerRightActions, setTitleStable, setHeaderActionsStable, setHeaderRightActionsStable])

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

/**
 * Hook to set page title and header actions.
 * Switched to useEffect to break synchronous update loops and avoid layout thrashing.
 */
export const usePageSettings = (title: string, actions: React.ReactNode = null, rightActions: React.ReactNode = null) => {
  const { 
    setTitle, 
    setHeaderActions,
    setHeaderRightActions
  } = useLayout()

  // We use refs to track what we've actually sent to the context
  // to avoid re-triggering the context update if the component re-renders
  // with the same logical values but different references.
  const lastTitle = useRef<string>('')
  const lastActions = useRef<React.ReactNode>(null)
  const lastRightActions = useRef<React.ReactNode>(null)

  // Update title
  useEffect(() => {
    if (title !== lastTitle.current) {
      lastTitle.current = title
      setTitle(title)
    }
  }, [title, setTitle])

  // Update actions
  useEffect(() => {
    // If actions is a new object but logically the same, this might still trigger
    // but the stable setter in LayoutProvider will catch the simple cases.
    if (actions !== lastActions.current) {
      lastActions.current = actions
      setHeaderActions(actions)
    }
  }, [actions, setHeaderActions])

  // Update right actions
  useEffect(() => {
    if (rightActions !== lastRightActions.current) {
      lastRightActions.current = rightActions
      setHeaderRightActions(rightActions)
    }
  }, [rightActions, setHeaderRightActions])

  // Cleanup on unmount only.
  // Using an empty dependency array for the cleanup logic ensures it only clears
  // when the component that "owns" these settings unmounts.
  useEffect(() => {
    return () => {
      setTitle('')
      setHeaderActions(null)
      setHeaderRightActions(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) 
}
