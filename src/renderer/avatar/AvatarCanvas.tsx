import { useEffect, useRef, useState } from 'react'
import type { AvatarState } from './avatar-state'
import type {
  CubismAvatarEvent,
  CubismAvatarMetrics,
  CubismAvatarRenderer,
} from './cubism-avatar'
import { computePortraitLayout, type PortraitLayout } from './portrait-layout'

export interface AvatarCanvasProps {
  readonly state: AvatarState
  readonly forceFallback?: boolean
  readonly onRenderer: (renderer: CubismAvatarRenderer | null) => void
  readonly onEvent: (event: CubismAvatarEvent) => void
  readonly onMetrics: (metrics: CubismAvatarMetrics) => void
}

function currentLayout(): PortraitLayout {
  return computePortraitLayout(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio || 1,
  )
}

export function AvatarCanvas({
  state,
  forceFallback = false,
  onRenderer,
  onEvent,
  onMetrics,
}: AvatarCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CubismAvatarRenderer | null>(null)
  const [layout, setLayout] = useState<PortraitLayout>(() => currentLayout())
  const [loadFailed, setLoadFailed] = useState(false)
  const fallback = loadFailed || forceFallback

  useEffect(() => {
    const onResize = (): void => {
      try {
        setLayout(currentLayout())
      } catch {
        setLoadFailed(true)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    rendererRef.current?.resize(layout.pixelWidth, layout.pixelHeight)
  }, [layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return

    let mounted = true
    let renderer: CubismAvatarRenderer | null = null
    void import('./cubism-avatar').then(
      ({ createCubismAvatarRenderer }) => {
        if (!mounted) return
        renderer = createCubismAvatarRenderer({
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
        renderer.resize(layout.pixelWidth, layout.pixelHeight)
        return renderer.initialize()
      },
      () => {
        if (mounted) setLoadFailed(true)
      },
    ).then(
      () => {
        if (!mounted || renderer === null) return
        renderer.setState(state)
        onRenderer(renderer)
      },
      () => {
        if (mounted) setLoadFailed(true)
      },
    )

    return () => {
      mounted = false
      onRenderer(null)
      rendererRef.current = null
      renderer?.dispose()
    }
    // Renderer lifetime is tied only to the mounted canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    rendererRef.current?.setState(state)
  }, [state])

  return (
    <div className="avatar-stage" data-avatar-state={state}>
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
