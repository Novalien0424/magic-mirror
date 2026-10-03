import { Component, createElement, type ErrorInfo, type ReactNode } from 'react'

export interface RendererBoundaryFailure {
  readonly code: 'renderer_boundary_failed'
  readonly reason: 'render_exception'
}

interface Props {
  readonly label: string
  readonly children: ReactNode
  readonly onFailure?: (failure: RendererBoundaryFailure) => void
}

interface State {
  readonly failure: RendererBoundaryFailure | null
}

const STABLE_FAILURE: RendererBoundaryFailure = Object.freeze({
  code: 'renderer_boundary_failed',
  reason: 'render_exception',
})

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failure: null }

  static getDerivedStateFromError(_error: unknown): State {
    return { failure: STABLE_FAILURE }
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onFailure?.(STABLE_FAILURE)
  }

  override render(): ReactNode {
    if (this.state.failure === null) return this.props.children

    return createElement(
      'div',
      { className: 'screen screen--fault' },
      createElement('p', { className: 'screen__title' }, this.state.failure.code),
      createElement('p', { className: 'screen__detail' }, this.state.failure.reason),
    )
  }
}
