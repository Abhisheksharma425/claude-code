import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence: a bug should show a clear message and a way out, never a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>The analyser hit an unexpected problem. Your game isn't saved, but reloading usually fixes it.</p>
        <pre>{this.state.error.message}</pre>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    )
  }
}
