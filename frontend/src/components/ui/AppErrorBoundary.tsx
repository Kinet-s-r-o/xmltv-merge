import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-loader p-4">
        <section className="data-panel w-full max-w-lg">
          <div role="alert" className="resource-state is-error">
            <div className="resource-state-icon" aria-hidden="true">
              <AlertTriangle className="h-[22px] w-[22px]" />
            </div>
            <strong>The EPG console could not render this page</strong>
            <p>An unexpected client error stopped the view. Stored sources, channels and outputs are not affected. Reload the page, or return to the dashboard and open the section again.</p>
            <div className="resource-state-actions">
              <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reload page
              </button>
              <a href="/" className="btn btn-secondary">Go to dashboard</a>
            </div>
          </div>
        </section>
      </main>
    )
  }
}
