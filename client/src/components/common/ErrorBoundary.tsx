import React from 'react'
import { ErrorState } from './ErrorState'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          error={this.state.error}
          onRetry={this.handleRetry}
          title="Uygulamada bir hata oluştu"
        />
      )
    }
    return this.props.children
  }
}
