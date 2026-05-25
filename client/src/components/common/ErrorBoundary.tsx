import React from 'react'
import { ErrorState } from './ErrorState'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

// Stale chunk tespiti — Vite route lazy splitting'le birlikte deploy
// sonrası tarayıcı eski HTML cache'lediği için yeni hash'li chunk
// fetch'i 404'e düşer. Mesaj şablonu Vite/Chrome/Firefox/Safari'de
// tutarlı: "Failed to fetch dynamically imported module" veya
// "Importing a module script failed".
function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message || ''
  return (
    err.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}

const RELOAD_FLAG = 'koopgenhes:chunk-reload-attempted'

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)

    // Stale chunk → tek seferlik reload. Aynı session'da ikinci kez
    // patlamasın diye sessionStorage flag (kullanıcı tarayıcı kapatınca temizlenir).
    if (isChunkLoadError(error)) {
      try {
        const already = sessionStorage.getItem(RELOAD_FLAG)
        if (!already) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          return
        }
      } catch {
        // sessionStorage erişilemez (private mode) → reload riskini almayalım
      }
    }
  }

  handleRetry = () => {
    // Stale chunk fallback: kullanıcı Retry'a basarsa flag'i temizle + reload
    if (isChunkLoadError(this.state.error)) {
      try {
        sessionStorage.removeItem(RELOAD_FLAG)
      } catch {
        /* noop */
      }
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      const isStale = isChunkLoadError(this.state.error)
      return (
        <ErrorState
          error={this.state.error}
          onRetry={this.handleRetry}
          title={
            isStale
              ? 'Uygulama güncellendi — sayfayı yenileyin'
              : 'Uygulamada bir hata oluştu'
          }
        />
      )
    }
    return this.props.children
  }
}
