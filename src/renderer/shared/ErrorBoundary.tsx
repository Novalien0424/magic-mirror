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
      createElement('p', { className: 'screen__title' }, this.props.label === 'mirror' ? '魔鏡休息中' : 'This view could not load'),
      createElement('p', { className: 'screen__detail' }, this.props.label === 'mirror' ? '請洽現場人員協助。' : 'Reopen the Console. If this continues, restart Magic Mirror.'),
    )
  }
}
