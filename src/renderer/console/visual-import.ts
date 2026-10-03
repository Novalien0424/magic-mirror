import type { ConsoleBridge } from '../../shared/bridge'
import type { ManagedVisualAsset, PendingVisualAsset, VisualAssetProbe } from '../../shared/types'
import { probePendingVisualAsset } from './visual-asset-probe'

export type VisualImportResult =
  | Readonly<{ ok: true; asset: ManagedVisualAsset | null }>
  | Readonly<{ ok: false; reason: string }>

export async function runConsoleVisualImport(
  bridge: Pick<ConsoleBridge, 'uploadVisual' | 'finalizeVisual' | 'cancelVisual'>,
  probe: (candidate: PendingVisualAsset) => Promise<VisualAssetProbe> = probePendingVisualAsset,
): Promise<VisualImportResult> {
  let uploaded: Awaited<ReturnType<typeof bridge.uploadVisual>>
  try {
    uploaded = await bridge.uploadVisual()
  } catch {
    return { ok: false, reason: 'visual_asset_import_failed' }
  }
  if (!uploaded.ok) return { ok: false, reason: uploaded.reason }
  if (uploaded.value === null) return { ok: true, asset: null }
  const pending = uploaded.value
  try {
    const metadata = await probe(pending)
    const finalized = await bridge.finalizeVisual({ token: pending.token, probe: metadata })
    if (!finalized.ok) {
      await bridge.cancelVisual(pending.token)
      return { ok: false, reason: finalized.reason }
    }
    return { ok: true, asset: finalized.value }
  } catch (error) {
    await bridge.cancelVisual(pending.token).catch(() => undefined)
    const reason = error instanceof Error && ['visual_asset_probe_timeout', 'visual_asset_decode_failed'].includes(error.message)
      ? error.message
      : 'visual_asset_import_failed'
    return { ok: false, reason }
  }
}
