import { describe, expect, it, vi } from 'vitest'
import { runConsoleVisualImport } from '../../../src/renderer/console/visual-import'

const pending = {
  token: '0123456789abcdef01234567', assetId: 'visual-0123456789abcdef01234567',
  name: 'Opening', kind: 'video' as const, mimeType: 'video/webm' as const, byteLength: 1000,
  sha256: 'a'.repeat(64),
}

describe('Console visual import transaction', () => {
  it('probes before finalizing and returns the managed asset', async () => {
    const asset = {
      id: pending.assetId, name: pending.name, kind: pending.kind, mimeType: pending.mimeType,
      byteLength: pending.byteLength, fileName: 'asset.webm', sha256: pending.sha256, width: 1920, height: 1080,
      orientation: 'landscape' as const, durationMs: 5000, audioTrack: 'unknown' as const,
      windowsDecode: 'passed' as const,
    }
    const bridge = {
      uploadVisual: vi.fn(async () => ({ ok: true as const, value: pending })),
      finalizeVisual: vi.fn(async () => ({ ok: true as const, value: asset })),
      cancelVisual: vi.fn(async () => ({ ok: true as const, value: { status: 'cancelled' as const } })),
    }
    const probe = vi.fn(async () => ({ width: 1920, height: 1080, durationMs: 5000, audioTrack: 'unknown' as const }))

    expect(await runConsoleVisualImport(bridge, probe)).toEqual({ ok: true, asset })
    expect(bridge.finalizeVisual).toHaveBeenCalledWith({ token: pending.token, probe: await probe.mock.results[0]!.value })
    expect(bridge.cancelVisual).not.toHaveBeenCalled()
  })

  it('cancels the pending file when decode probing fails', async () => {
    const bridge = {
      uploadVisual: vi.fn(async () => ({ ok: true as const, value: pending })),
      finalizeVisual: vi.fn(),
      cancelVisual: vi.fn(async () => ({ ok: true as const, value: { status: 'cancelled' as const } })),
    }
    const result = await runConsoleVisualImport(bridge, async () => { throw new Error('visual_asset_decode_failed') })
    expect(result).toEqual({ ok: false, reason: 'visual_asset_decode_failed' })
    expect(bridge.cancelVisual).toHaveBeenCalledWith(pending.token)
    expect(bridge.finalizeVisual).not.toHaveBeenCalled()
  })
})
