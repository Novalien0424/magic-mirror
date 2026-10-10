import { describe, it, expect, vi } from 'vitest'
import { prepareMemoryMarkdown, MemoryImporter } from '../../src/main/memory/import'
import type { MemoryRepository } from '../../src/main/memory/contracts'
import type { ExtractionInput } from '../../src/main/memory/extractor'
import type { MemoryEntry } from '../../src/shared/memory'

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
  it('carries source headings, dates and speakers through long lines and resets them for undated conversations', async () => {
    const extract = vi.fn(async (_input: ExtractionInput) => [])
    const repository = { policy: async () => ({ mode: 'explicit', epoch: 3, cleanupRequired: false }), list: async () => [] } as unknown as MemoryRepository
    const importer = new MemoryImporter({ repository, extract, model: async () => 'configured', canRun: () => true, report: vi.fn() })
    const markdown = '# Persona\nSeparate character instructions.\n# Past conversations\n## Conversation 2021-03-08\n### Project planning\n**Assistant:** Perhaps book next Friday.\n**User:** I might book next Friday. ' + 'x'.repeat(25000)
      + '\n## Conversation — date unknown\nUser: Maybe tomorrow.\n## Conversation 2021-02-30\nUser: Still tentative.'
    const plan = prepareMemoryMarkdown(markdown)
    expect(plan.chunks.join('')).not.toContain('Separate character instructions')
    expect(plan.chunks.every(chunk => chunk.length <= 12000)).toBe(true)
    importer.stage('raven', 'Synthetic Person', markdown)
    const before = Date.now()
    importer.start(); await importer.idle()
    expect(importer.status().state).toBe('complete')
    const evidence = extract.mock.calls.flatMap(([input]) => input.evidence)
    const continued = evidence.filter(item => item.text.includes('xxxx'))
    expect(continued.length).toBeGreaterThan(2)
    for (const item of continued) {
      expect(item.historical).toEqual({ headings: ['Past conversations', 'Conversation 2021-03-08', 'Project planning'], sourceAt: '2021-03-08', speaker: 'visitor' })
      expect(Date.parse(item.observedAt)).toBeGreaterThanOrEqual(before)
      expect(item.observedAt).not.toBe(item.historical?.sourceAt)
    }
    expect(evidence.find(item => item.text.includes('Perhaps book'))?.historical?.speaker).toBe('assistant')
    expect(evidence.find(item => item.text.includes('Maybe tomorrow'))?.historical?.sourceAt).toBe('')
    expect(evidence.find(item => item.text.includes('Still tentative'))?.historical?.sourceAt).toBe('')
    expect(new Set(evidence.map(item => item.id)).size).toBe(evidence.length)
    expect(extract.mock.calls.every(([input]) => input.evidence.length <= 24)).toBe(true)
  })
  it('bounds attributed sections and gives later corrections the prior distilled revision for the same owner', async () => {
    const entries: MemoryEntry[] = []
    const commit = vi.fn(async (_avatarId: string, _name: string, change: { records: any[] }) => {
      for (const record of change.records) {
        const prior = entries.findIndex(entry => entry.topic === record.topic)
        const entry = { ...record, id: 'synthetic-entry', updatedAt: '2026-10-05T00:00:00.000Z', revision: (entries[prior]?.revision ?? 0) + 1 }
        if (prior < 0) entries.push(entry); else entries[prior] = entry
      }
      return 'committed' as const
    })
    const repository = { policy: async () => ({ mode: 'explicit', epoch: 3, cleanupRequired: false }), lookupTopics: vi.fn(async (_avatar: string, _name: string, topics: string[]) => entries.filter(entry => topics.includes(entry.topic)).map(entry => ({ ...entry }))), hybridRecall: async () => ({ entries: [], incomplete: false }), commitLearning: commit, setCleanupRequired: async () => {} } as unknown as MemoryRepository
    const extract = vi.fn(async (input: ExtractionInput) => {
      const cancelled = input.evidence.some(item => item.text.includes('cancelled the booking'))
      return [{ topic: 'booking', text: cancelled ? 'The earlier booking commitment was cancelled.' : 'Visitor committed to booking; it is not completed.', kind: 'commitment' as const, state: cancelled ? 'resolved' as const : 'active' as const, eventAt: '', sources: [], expectedRevision: input.existing[0]?.revision ?? null, keepInMind: false }]
    })
    const importer = new MemoryImporter({ repository, extract, model: async () => 'configured', canRun: () => true, report: vi.fn() })
    importer.stage('raven', 'Synthetic Person', '# History\n## 2022-01-03\nUser: I will book the venue.\n'
      + Array.from({ length: 30 }, (_, index) => `${index % 2 ? 'User' : 'Assistant'}: Synthetic filler ${index}.`).join('\n')
      + '\nUser: I cancelled the booking.')
    importer.start(); await importer.idle()
    expect(importer.status().state).toBe('complete')
    expect(extract.mock.calls.length).toBeGreaterThan(1)
    expect(extract.mock.calls.every(([input]) => input.evidence.length <= 24 && input.evidence.reduce((size, item) => size + item.text.length, 0) <= 12000)).toBe(true)
    expect(extract.mock.calls.at(-1)?.[0].existing[0]).toMatchObject({ topic: 'booking', state: 'active', revision: 1 })
    expect(entries[0]).toMatchObject({ state: 'resolved', revision: 2 })
    expect(commit.mock.calls.every(([avatarId, name]) => avatarId === 'raven' && name === 'Synthetic Person')).toBe(true)
    expect(JSON.stringify(commit.mock.calls)).not.toContain('Synthetic filler')
  })
  it('treats export dates, ambiguous source dates and explicitly unknown dates as unknown', () => {
    const plan = prepareMemoryMarkdown('# Archive exported 2026-10-05\n## Conversation\nUser: Maybe next Friday.\n'
      + '## Date unknown (exported 2026-10-05)\nUser: Maybe tomorrow.\n'
      + '## Conversation 2021-03-08 or 2021-03-09\nUser: Still tentative.\n'
      + '## Conversation 2021年3月10日\n### User\nA possible plan.\n### Assistant\nA suggestion.\n'
      + '## Conversation 2021-03-11T22:30:00+08:00\nUser: A dated plan.')
    const contexts = plan.contexts.flat().map(range => range.historical)
    expect(contexts.filter(context => context.headings.some(heading => /Conversation$|Date unknown| or /u.test(heading))).every(context => context.sourceAt === '')).toBe(true)
    expect(contexts.find(context => context.headings.includes('User'))).toMatchObject({ sourceAt: '2021-03-10', speaker: 'visitor' })
    expect(contexts.find(context => context.headings.includes('Assistant'))).toMatchObject({ sourceAt: '2021-03-10', speaker: 'assistant' })
    expect(contexts.at(-1)?.sourceAt).toBe('2021-03-11T22:30:00+08:00')
  })
  it.each(['2024-03-05T00:30:00+08:00', '2024-03-04T16:30:00Z', '2024-03-05'])('preserves source-local calendar anchors near Taiwan midnight %#', sourceAt => {
    const plan = prepareMemoryMarkdown(`# History\n## Conversation ${sourceAt}\nUser: Tomorrow is tentative.`)
    expect(plan.contexts.flat().at(-1)?.historical.sourceAt).toBe(sourceAt)
  })
  it('ignores headings and speaker labels inside fenced examples and reports bounded heading context', () => {
    const report = vi.fn()
    const importer = new MemoryImporter({ repository: {} as MemoryRepository, extract: vi.fn(), model: async () => 'configured', canRun: () => true, report })
    const plan = prepareMemoryMarkdown('# History\n## Conversation 2021-03-08\nUser: Tentative plan.\n```markdown\n# Persona\n## 2030-01-01\nAssistant: Quoted suggestion.\n```\nStill the same speaker.\n')
    expect(plan.persona).toBe('')
    expect(plan.contexts.flat().at(-1)?.historical).toEqual({ headings: ['History', 'Conversation 2021-03-08'], sourceAt: '2021-03-08', speaker: 'visitor' })
    const largeHeading = '# ' + 'Synthetic heading '.repeat(1000)
    const bounded = prepareMemoryMarkdown(largeHeading)
    expect(bounded.chunks.join('') === largeHeading.trim()).toBe(true)
    expect(bounded.contexts.flat().every(range => range.historical.headings.every(heading => heading.length <= 512) && range.historical.headingsTruncated)).toBe(true)
    importer.stage('raven', 'Synthetic Person', largeHeading)
    expect(report).toHaveBeenCalledWith('memory_import_heading_context_truncated')
  })
  it('keeps exact newline and Unicode boundaries within the chunk limit without losing source text', () => {
    for (const markdown of ['x'.repeat(12000) + '\nUser: Final tail.', 'x'.repeat(11999) + '😀\nAssistant: A suggestion.']) {
      const plan = prepareMemoryMarkdown(markdown)
      expect(plan.chunks.every(chunk => chunk.length <= 12000)).toBe(true)
      expect(plan.chunks.join('') === markdown).toBe(true)
      expect(plan.chunks.every(chunk => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk))).toBe(true)
    }
  })
})
