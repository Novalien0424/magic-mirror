import { describe, it, expect, vi } from 'vitest'
import { prepareMemoryMarkdown, MemoryImporter } from '../../src/main/memory/import'
import type { MemoryRepository } from '../../src/main/memory/contracts'

describe('large Markdown memory import', () => {
  it('separates persona from history and bounds chunks without losing the final tail', () => {
    const input = '# Persona\nYou are Raven.\n# Past conversations\n' + 'Synthetic past conversation.\n'.repeat(9000) + 'FINAL SUMMARY'
    const plan = prepareMemoryMarkdown(input)
    expect(plan.persona).toContain('You are Raven')
    expect(plan.chunks.length).toBeGreaterThan(20)
    expect(plan.chunks.every(c => c.length <= 12000)).toBe(true)
    expect(plan.chunks.join('')).not.toContain('You are Raven')
    expect(plan.chunks.at(-1)).toContain('FINAL SUMMARY')
  })
  it('persists summaries only, isolates the chosen owner and cancels remaining chunks', async () => {
    const commit = vi.fn(async () => 'committed' as const)
    const repository = { policy: vi.fn(async () => ({ mode: 'explicit', epoch: 3, cleanupRequired: false })), list: vi.fn(async () => []), commitLearning: commit } as unknown as MemoryRepository
    let finish!: (value: any[]) => void
    const extract = vi.fn(() => new Promise<any[]>(resolve => { finish = resolve }))
    const importer = new MemoryImporter({ repository, extract, model: async () => 'configured', canRun: () => true, report: vi.fn() })
    importer.stage('raven', 'Synthetic Person', 'RAW SYNTHETIC HISTORY '.repeat(1500))
    importer.start()
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce())
    importer.cancel()
    finish([{ topic: 'trip', text: 'DISTILLED', kind: 'episode', state: 'active', eventAt: '', sources: [], expectedRevision: null, keepInMind: false }])
    await importer.idle()
    expect(commit).not.toHaveBeenCalled()
    expect(importer.status().state).toBe('cancelled')
  })
  it('rejects oversized input and never treats an unrecognized file as a persona edit', () => {
    expect(() => prepareMemoryMarkdown('x'.repeat(20 * 1024 * 1024 + 1))).toThrow('memory_import_too_large')
    expect(prepareMemoryMarkdown('## Summary\nSynthetic outcome').persona).toBe('')
  })
})
