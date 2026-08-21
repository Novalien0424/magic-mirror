import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createCredentialStore,
  importCredentialFromOperatorAction,
  type SafeStorageAdapter,
} from '../../src/main/credential-store'
import type { MirrorEvent } from '../../src/shared/types'

const FIRST_IMPORTED_VALUE = 'synthetic-fixture-key-one'
const SECOND_IMPORTED_VALUE = 'synthetic-fixture-key-two'

type MetadataEvent = Omit<MirrorEvent, 'time'>

const ALLOWED_EVENT_NAMES = new Set([
  'credential_missing',
  'credential_get',
  'credential_set',
  'credential_status_changed',
])

const ALLOWED_EVENT_FIELDS = new Set([
  'module',
  'event',
  'status',
  'error_code',
  'reason',
  'source',
])

const temporaryDirectories: string[] = []

function makeCredentialHarness(): {
  store: ReturnType<typeof createCredentialStore>
  safe: SafeStorageAdapter & {
    encryptString: ReturnType<typeof vi.fn>
  }
  events: MetadataEvent[]
  sink: { emit(event: MetadataEvent): void }
} {
  const bytes = new Map<string, Buffer>()
  const plaintextByCiphertext = new Map<string, string>()
  let encryptionCount = 0
  const events: MetadataEvent[] = []
  const sink = {
    emit(event: MetadataEvent) {
      events.push({ ...event })
    },
  }

  const safe = {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((plaintext: string) => {
      encryptionCount += 1
      const encrypted = Buffer.from([0xa0 + encryptionCount])
      plaintextByCiphertext.set(encrypted.toString('hex'), plaintext)
      return encrypted
    }),
    decryptString: vi.fn((encrypted: Buffer) => {
      const plaintext = plaintextByCiphertext.get(Buffer.from(encrypted).toString('hex'))
      if (plaintext === undefined) throw new Error('synthetic-decrypt-miss')
      return plaintext
    }),
    shouldReEncrypt: vi.fn(() => false),
  }

  const store = createCredentialStore({
    credentialPath: 'synthetic-realtime-credential/credential.blob',
    safeStorage: safe,
    files: {
      async ensureDirectory() {},
      async readBytes(filePath) {
        const encrypted = bytes.get(filePath)
        return encrypted === undefined ? null : Buffer.from(encrypted)
      },
      async remove(filePath) {
        bytes.delete(filePath)
      },
    },
    atomicWriter: {
      async write(filePath, encrypted) {
        bytes.set(filePath, Buffer.from(encrypted))
      },
    },
    events: sink,
  })

  return { store, safe, events, sink }
}

async function makeSyntheticFixture(value: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-realtime-import-'))
  temporaryDirectories.push(directory)
  const fixturePath = join(directory, 'synthetic-operator-fixture.env')
  await writeFile(fixturePath, `OPENAI_API_KEY=${value}\n`, 'utf8')
  return fixturePath
}

function assertMetadataOnly(events: readonly MetadataEvent[], forbidden: readonly string[]): void {
  expect(events.length).toBeGreaterThan(0)
  for (const event of events) {
    expect(ALLOWED_EVENT_NAMES.has(event.event)).toBe(true)
    expect(Object.keys(event).every((key) => ALLOWED_EVENT_FIELDS.has(key))).toBe(true)
    expect(event.reason).toEqual(expect.any(String))
    expect(['runtime', 'contract_test']).toContain(event.source)

    const serialized = JSON.stringify(event)
    for (const value of forbidden) {
      expect(serialized).not.toContain(value)
    }
  }
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('P1-U2 explicit synthetic operator credential import RED contract', () => {
  it('does not read the selected fixture until the explicit operator action and imports through safeStorage', async () => {
    const fixturePath = await makeSyntheticFixture(FIRST_IMPORTED_VALUE)
    const harness = makeCredentialHarness()
    const readSelectedFixture = vi.fn(async (selectedPath: string) => readFile(selectedPath, 'utf8'))

    expect(readSelectedFixture).not.toHaveBeenCalled()

    await importCredentialFromOperatorAction({
      credentialStore: harness.store,
      sourcePath: fixturePath,
      replace: false,
      readText: readSelectedFixture,
      events: harness.sink,
    })

    expect(readSelectedFixture).toHaveBeenCalledTimes(1)
    expect(readSelectedFixture).toHaveBeenCalledWith(fixturePath)
    expect(harness.safe.encryptString).toHaveBeenCalledWith(FIRST_IMPORTED_VALUE)
    expect(await harness.store.get()).toBe(FIRST_IMPORTED_VALUE)
    expect(harness.events).toContainEqual(expect.objectContaining({
      event: 'credential_status_changed',
      status: 'success',
      reason: expect.stringContaining('operator_import'),
    }))
    assertMetadataOnly(harness.events, [FIRST_IMPORTED_VALUE, SECOND_IMPORTED_VALUE])
  })

  it('rejects a repeated import without explicit replace and does not reread the fixture', async () => {
    const fixturePath = await makeSyntheticFixture(FIRST_IMPORTED_VALUE)
    const harness = makeCredentialHarness()
    const readSelectedFixture = vi.fn(async (selectedPath: string) => readFile(selectedPath, 'utf8'))
    const input = {
      credentialStore: harness.store,
      sourcePath: fixturePath,
      replace: false,
      readText: readSelectedFixture,
      events: harness.sink,
    }

    await importCredentialFromOperatorAction(input)
    await expect(importCredentialFromOperatorAction(input)).rejects.toMatchObject({
      code: 'credential_import_replace_required',
    })

    expect(readSelectedFixture).toHaveBeenCalledTimes(1)
    expect(harness.safe.encryptString).toHaveBeenCalledTimes(1)
    expect(harness.events).toContainEqual(expect.objectContaining({
      event: 'credential_status_changed',
      status: expect.stringMatching(/^(info|failed)$/),
      reason: expect.stringContaining('replace_required'),
    }))
    expect(await harness.store.get()).toBe(FIRST_IMPORTED_VALUE)
    assertMetadataOnly(harness.events, [FIRST_IMPORTED_VALUE, SECOND_IMPORTED_VALUE])
  })

  it('allows replacement only when replace is explicit and still exposes status, never plaintext', async () => {
    const fixturePath = await makeSyntheticFixture(FIRST_IMPORTED_VALUE)
    const harness = makeCredentialHarness()
    const readSelectedFixture = vi.fn(async (selectedPath: string) => readFile(selectedPath, 'utf8'))
    const input = {
      credentialStore: harness.store,
      sourcePath: fixturePath,
      replace: false,
      readText: readSelectedFixture,
      events: harness.sink,
    }

    await importCredentialFromOperatorAction(input)
    await writeFile(fixturePath, `OPENAI_API_KEY=${SECOND_IMPORTED_VALUE}\n`, 'utf8')

    await importCredentialFromOperatorAction({ ...input, replace: true })

    expect(readSelectedFixture).toHaveBeenCalledTimes(2)
    expect(harness.safe.encryptString).toHaveBeenCalledTimes(2)
    expect(harness.safe.encryptString).toHaveBeenLastCalledWith(SECOND_IMPORTED_VALUE)
    expect(await harness.store.get()).toBe(SECOND_IMPORTED_VALUE)
    expect(harness.events).toContainEqual(expect.objectContaining({
      event: 'credential_status_changed',
      status: 'success',
      reason: expect.stringContaining('replace'),
    }))
    assertMetadataOnly(harness.events, [FIRST_IMPORTED_VALUE, SECOND_IMPORTED_VALUE])
  })
})
