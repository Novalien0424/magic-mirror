import { expect, it, vi } from 'vitest'

it('validates renderer objects without attempting runtime code generation', async () => {
  const evaluate = vi.spyOn(globalThis, 'Function').mockImplementation(function () {
    throw new Error('synthetic_csp_blocks_eval')
  } as never)
  try {
    await import('../../src/renderer/shared/csp-validation')
    const { z } = await import('zod')
    expect(z.object({ enabled: z.boolean() }).parse({ enabled: true })).toEqual({ enabled: true })
    expect(evaluate).not.toHaveBeenCalled()
  } finally { evaluate.mockRestore() }
})
