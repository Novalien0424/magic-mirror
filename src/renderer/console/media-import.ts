import type { ConsoleBridge } from '../../shared/bridge'
import type { ImportedMedia, MediaImportRequest } from '../../shared/media-import'
import { probePendingVisualAsset } from './visual-asset-probe'
import { runConsoleVisualImport } from './visual-import'

export async function importMediaBatch(bridge: Pick<ConsoleBridge, 'importMedia' | 'finalizeVisual' | 'cancelVisual'>,
  request: MediaImportRequest, probe = probePendingVisualAsset) {
  const assets: ImportedMedia[] = []
  const failures: { name: string; reason: string }[] = []
  try {
    if (!bridge.importMedia) throw new Error('unavailable')
    const response = await bridge.importMedia(request)
    if (!response.ok) return { assets, failures: [{ name: 'Selection', reason: response.reason }], cancelled: false }
    for (const entry of response.value) {
      if (entry.kind === 'failed') failures.push({ name: entry.name, reason: entry.reason })
      else if (entry.kind === 'music') assets.push(entry.asset)
      else {
        const result = await runConsoleVisualImport({ ...bridge, uploadVisual: async () => ({ ok: true, value: entry.pending }) }, probe)
        if (result.ok && result.asset) assets.push(result.asset)
        else if (!result.ok) failures.push({ name: entry.pending.name, reason: result.reason })
      }
    }
    return { assets, failures, cancelled: response.value.length === 0 }
  } catch { return { assets, failures: [...failures, { name: 'Selection', reason: 'media_import_failed' }], cancelled: false } }
}
