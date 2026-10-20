import { resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { createEnvironmentCredentialSource } from '../../src/main/environment-credential-source'

afterEach(() => vi.unstubAllEnvs())

test('never falls back to an inherited environment credential when the file is absent', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-inherited-value')
  const source = createEnvironmentCredentialSource({
    async readFile() { throw Object.assign(new Error('synthetic missing'), { code: 'ENOENT' }) },
  })
  expect(await source.get() === null).toBe(true)
})

test('reads only the root file without copying its credential into process.env', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-inherited-value')
  const readFile = vi.fn(async () => 'OPENAI_API_KEY=" synthetic-file-value "\n')
  const source = createEnvironmentCredentialSource({ readFile })
  expect(await source.get() === 'synthetic-file-value').toBe(true)
  expect(process.env.OPENAI_API_KEY === 'synthetic-inherited-value').toBe(true)
  expect(readFile).toHaveBeenCalledWith(resolve(process.cwd(), '.env'))
})

test.each(['', 'OTHER=value\n', 'OPENAI_API_KEY="  "\n'])(
  'does not use an inherited key when file content is empty or missing the field (%#)', async text => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-inherited-value')
    const source = createEnvironmentCredentialSource({ readFile: async () => text })
    expect(await source.get() === null).toBe(true)
  },
)

test('keeps read errors content-free and can recover after the operator repairs the file', async () => {
  const readFile = vi.fn().mockRejectedValueOnce(Object.assign(new Error('private native detail'), { code: 'EACCES' }))
    .mockResolvedValueOnce('OPENAI_API_KEY=synthetic-file-value\n')
  const source = createEnvironmentCredentialSource({ readFile })
  await expect(source.get()).rejects.toThrow('credential_file_unreadable')
  expect(await source.get() === 'synthetic-file-value').toBe(true)
})
