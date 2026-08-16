import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Shown in the fallback so an operator can tell which window failed. */
  readonly label: string
  readonly children: ReactNode
}

interface State {
  readonly message: string | null
}

/**
 * A render crash must never leave the glass blank (invariants #9/#10). The boundary
 * replaces the subtree with a readable failure panel and logs the cause.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`RENDER_ERROR window=${this.props.label} reason=${error.message}`, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <div className="screen screen--fault">
        <p className="screen__title">Display fault</p>
        <p className="screen__detail">
          {this.props.label}: {this.state.message}
        </p>
      </div>
    )
  }
}
