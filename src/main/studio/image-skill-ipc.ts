import { nativeImage } from 'electron'
import { IMAGE_SKILL_CHANNEL, parseImageSkillRequest, type ImageSkillReply } from '../../shared/image-skill'
import { isCameraSnapshotDimensions, type CameraSnapshot } from '../../shared/camera-tracking'
import type { AvatarControlCommand } from '../../shared/bridge'
import type { StudioQuality } from '../../shared/portrait-studio'
import type { StudioIpc } from './studio-ipc'
import type { AvatarImageService } from '../avatar/image-service'
import type { StudioIdentity } from './studio-runtime'
import { createImageSkillRuntime } from './image-skill-runtime'
type Snapshot = { lifecycle: string; realtimeSessionId: string | null; sessionGeneration: number }
export function registerImageSkillIpc(deps: {
  ipcMain: { handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void }
  authorize(event: unknown): boolean
  snapshot(): Snapshot
  subscribe?(listener: (value: Snapshot) => void): unknown
  studio: StudioIpc
  images: AvatarImageService
  enabled(identity: StudioIdentity): boolean
  quality(): Promise<StudioQuality>
  capture(): Promise<CameraSnapshot | null>
  dispatch(command: AvatarControlCommand): boolean
  report(reason: string): void
  activity(kind: 'started' | 'finished', id: string): void
}) {
  const identity = (s: Snapshot) => s.lifecycle === 'active' && s.realtimeSessionId ? { realtimeSessionId: s.realtimeSessionId, sessionGeneration: s.sessionGeneration } : null
  const runtime = createImageSkillRuntime({ provider: deps.images.provider, usable: deps.images.usable, enabled: deps.enabled, quality: deps.quality,
    current: () => identity(deps.snapshot()), studioActive: deps.studio.active, studioCanUsePhoto: deps.studio.canUsePhoto, studioUsePhoto: deps.studio.usePhoto, studioClearPhoto: deps.studio.clearPhoto,
    capture: async () => {
      const frame = await deps.capture()
      // Owner temporarily accepts the camera's smallest advertised 96×96 mode.
      // Preserve actual dimensions; never upscale a low-resolution capture to pass.
      if (!frame || !isCameraSnapshotDimensions(frame.width, frame.height) || frame.width < 96 || frame.height < 96 || frame.faceCount !== 1) { deps.report('image_photo_quality_rejected'); return null }
      const decoded = nativeImage.createFromDataURL(frame.dataUrl)
      const size = decoded.getSize()
      if (decoded.isEmpty() || size.width !== frame.width || size.height !== frame.height) { deps.report('image_photo_decode_rejected'); return null }
      return { bytes: Buffer.from(frame.dataUrl.slice('data:image/jpeg;base64,'.length), 'base64'), mimeType: 'image/jpeg' }
    },
    dispatch: view => { if (!deps.dispatch({ type: 'image_view', view })) deps.report('image_view_delivery_failed') },
    event: (event, owner) => { if (!deps.dispatch({ type: 'image_event', event, identity: owner })) deps.report('image_event_delivery_failed') }, report: deps.report, activity: deps.activity })
  deps.subscribe?.(snapshot => runtime.syncIdentity(identity(snapshot)))
  deps.ipcMain.handle(IMAGE_SKILL_CHANNEL, async (event, ...args): Promise<ImageSkillReply> => {
    if (!deps.authorize(event)) { deps.report('image_sender_rejected'); return { status: 'rejected', code: 'image_sender_rejected' } }
    const envelope = args[0] as { request?: unknown; identity?: { realtimeSessionId?: unknown; sessionGeneration?: unknown } } | null
    const request = parseImageSkillRequest(envelope?.request), owner = envelope?.identity
    if (args.length !== 1 || !envelope || Object.keys(envelope).sort().join(',') !== 'identity,request' || !request || !owner
      || Object.keys(owner).sort().join(',') !== 'realtimeSessionId,sessionGeneration' || typeof owner.realtimeSessionId !== 'string'
      || !Number.isSafeInteger(owner.sessionGeneration) || (owner.sessionGeneration as number) <= 0) {
      deps.report('image_request_invalid'); return { status: 'rejected', code: 'image_request_invalid' }
    }
    return runtime.handle(request, { realtimeSessionId: owner.realtimeSessionId, sessionGeneration: owner.sessionGeneration as number })
  })
  return runtime
}
