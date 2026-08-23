import { resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createEnvironmentCredentialSource } from '../../src/main/environment-credential-source'

const envFilePath = resolve(process.cwd(), '.env')

test('loads the env file before reading and trims a non-empty credential', async () => {
  const order: string[] = []
  let envValue: string | undefined
  const env: NodeJS.ProcessEnv = {}
  Object.defineProperty(env, 'OPENAI_API_KEY', {
    configurable: true,
    get() {
      order.push('read')
      return envValue
    },
  })
  const loadEnvFile = vi.fn((path: string): void => {
    order.push('load')
    expect(path).toBe(envFilePath)
    envValue = '  synthetic-credential  '
  })

  const source = createEnvironmentCredentialSource({ loadEnvFile, env })

  await expect(source.get()).resolves.toBe('synthetic-credential')
  await expect(source.get()).resolves.toBe('synthetic-credential')
  expect(order).toEqual(['load', 'read', 'read'])
  expect(loadEnvFile).toHaveBeenCalledOnce()
})

test('returns null when the injected environment has no credential', async () => {
  const loadEnvFile = vi.fn((_path: string): void => undefined)
  const source = createEnvironmentCredentialSource({ loadEnvFile, env: {} })

  await expect(source.get()).resolves.toBeNull()
  expect(loadEnvFile).toHaveBeenCalledOnce()
})

test('returns null when the injected credential is whitespace-only', async () => {
  const loadEnvFile = vi.fn((_path: string): void => undefined)
  const source = createEnvironmentCredentialSource({
    loadEnvFile,
    env: { OPENAI_API_KEY: ' \t\r\n ' },
  })

  await expect(source.get()).resolves.toBeNull()
})

test('ignores an ENOENT env-file error and returns null without a credential', async () => {
  const missingFileError = Object.assign(new Error('synthetic env file missing'), { code: 'ENOENT' })
  const loadEnvFile = vi.fn((_path: string): void => {
    throw missingFileError
  })
  const source = createEnvironmentCredentialSource({ loadEnvFile, env: {} })

  await expect(source.get()).resolves.toBeNull()
})

test('propagates a non-ENOENT env-file error', async () => {
  const loaderError = Object.assign(new Error('synthetic env loader failure'), { code: 'EACCES' })
  const loadEnvFile = vi.fn((_path: string): void => {
    throw loaderError
  })
  const source = createEnvironmentCredentialSource({
    loadEnvFile,
    env: {
      get OPENAI_API_KEY(): string {
        throw new Error('credential read should not occur')
      },
    },
  })

  await expect(source.get()).rejects.toBe(loaderError)
})
