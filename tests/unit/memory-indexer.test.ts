import { expect, it, vi } from 'vitest'
import { MemoryIndexer } from '../../src/main/memory/indexer'
import type { MemoryRepository, MemoryEmbedder, IndexRecord } from '../../src/main/memory/contracts'

it('honors a write scheduled while the previous empty index scan is resolving', async () => {
  let resolve!: (rows: IndexRecord[]) => void
  const pendingIndex = vi.fn().mockImplementationOnce(() => new Promise<IndexRecord[]>(r => { resolve = r })).mockResolvedValue([])
  const indexer = new MemoryIndexer({ pendingIndex } as unknown as MemoryRepository, { version: 'fixture' } as MemoryEmbedder, vi.fn())
  indexer.schedule()
  indexer.schedule()
  resolve([])
  await vi.waitFor(() => expect(pendingIndex).toHaveBeenCalledTimes(2))
  await indexer.close()
})
