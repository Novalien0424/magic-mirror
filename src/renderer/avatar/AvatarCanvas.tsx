import { useEffect, useRef, useState } from 'react'
import type { AvatarState } from './avatar-state'
import type {
  CubismAvatarEvent,
  CubismAvatarMetrics,
  CubismAvatarRenderer,
} from './cubism-avatar'
import { computePortraitLayout, type PortraitLayout } from './portrait-layout'

export interface AvatarCanvasProps {
  readonly model?: import('../../shared/avatar-profiles').AvatarModelReference
  readonly embedded?: boolean
  readonly state: AvatarState
  readonly forceFallback?: boolean
  readonly onRenderer: (renderer: CubismAvatarRenderer | null) => void
  readonly onEvent: (event: CubismAvatarEvent) => void
  readonly onMetrics: (metrics: CubismAvatarMetrics) => void
}

function currentLayout(host?: HTMLElement | null): PortraitLayout {
  return computePortraitLayout(
    host?.clientWidth || window.innerWidth,
    host?.clientHeight || window.innerHeight,
    window.devicePixelRatio || 1,
  )
}

export function AvatarCanvas({
  model,
  embedded = false,
  state,
  forceFallback = false,
  onRenderer,
  onEvent,
  onMetrics,
}: AvatarCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CubismAvatarRenderer | null>(null)
  const initializationRef = useRef<Promise<void>>(Promise.resolve())
  const [layout, setLayout] = useState<PortraitLayout>(() => currentLayout())
  const layoutRef = useRef(layout); layoutRef.current = layout
  const stateRef = useRef(state); stateRef.current = state
  const [loadFailed, setLoadFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const fallback = loadFailed || forceFallback

  useEffect(() => {
    const onResize = (): void => {
      try {
        setLayout(currentLayout(embedded ? canvasRef.current?.parentElement : null))
      } catch {
        setLoadFailed(true)
      }
    }
    window.addEventListener('resize', onResize)
    const observer = embedded ? new ResizeObserver(onResize) : null
    if (canvasRef.current?.parentElement) observer?.observe(canvasRef.current.parentElement)
    onResize()
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect() }
  }, [embedded])

  useEffect(() => {
    rendererRef.current?.resize(layout.pixelWidth, layout.pixelHeight)
  }, [layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return

    let mounted = true
    setLoadFailed(false)
    setReady(false)
    let renderer: CubismAvatarRenderer | null = null
    const initialization = initializationRef.current.then(() => import('./cubism-avatar')).then(
      ({ createCubismAvatarRenderer }) => {
        if (!mounted) return
        renderer = createCubismAvatarRenderer({
          ...(model ? { assetBaseUrl: `magic-mirror-media://avatar/${model.id}/`, manifestFileName: model.manifestFileName } : {}),
          canvas,
          eventSink: (event) => {
            if (!mounted) return
            onEvent(event)
            if (event.status === 'failed') setLoadFailed(true)
          },
          metricsSink: (metrics) => {
            if (mounted) onMetrics(metrics)
          },
        })
        rendererRef.current = renderer
        // Loading the Cubism module is asynchronous. The embedded host may
        // already have resized while it loaded; do not restore viewport size.
        renderer.resize(layoutRef.current.pixelWidth, layoutRef.current.pixelHeight)
        return renderer.initialize()
      },
      () => {
        if (mounted) setLoadFailed(true)
      },
    ).then(
      () => {
        if (!mounted || renderer === null) return
        renderer.setState(stateRef.current)
        setReady(true)
        onRenderer(renderer)
      },
      () => {
        if (mounted) setLoadFailed(true)
      },
    )
    initializationRef.current = initialization

    return () => {
      mounted = false
      onRenderer(null)
      rendererRef.current = null
      // Cubism loads native model data asynchronously. Release only after that
      // load settles, and before the next rig touches this canvas/context.
      initializationRef.current = initialization.then(() => { renderer?.dispose() })
    }
    // Changing a model disposes the old rig and its WebGL resources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, model?.manifestFileName])

  useEffect(() => {
    rendererRef.current?.setState(state)
  }, [state])

  return (
    <div className="avatar-stage" data-avatar-state={state} data-renderer-state={fallback ? 'failed' : ready ? 'ready' : 'loading'}>
      <canvas
        ref={canvasRef}
        className="avatar-stage__canvas"
        width={layout.pixelWidth}
        height={layout.pixelHeight}
        style={{
          width: `${layout.cssWidth}px`,
          height: `${layout.cssHeight}px`,
          left: `${layout.offsetX}px`,
          top: `${layout.offsetY}px`,
        }}
        aria-label="Live2D avatar"
        aria-hidden={fallback}
      />
      {fallback && (
        <div className="avatar-stage__fallback" role="status">
          <span className="avatar-stage__fallback-mark" aria-hidden="true">◇</span>
          <span>avatar_static_fallback</span>
        </div>
      )}
    </div>
  )
}
