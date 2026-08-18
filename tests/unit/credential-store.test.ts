import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CredentialStoreError,
  createCredentialStore,
  type CredentialAtomicWriter,
  type CredentialEventSink,
  type CredentialFileOperations,
  type SafeStorageAdapter,
} from '../../src/main/credential-store'
import type { MirrorEvent } from '../../src/shared/types'

type CredentialEvent = Omit<MirrorEvent, 'time'>

const FAKE_SECRET = 'mock-secret-value-v1'
const RAW_ADAPTER_DETAIL = 'synthetic-credential-adapter-detail'
const CREDENTIAL_PATH = resolve('mock-task3-data', 'credentials', 'credential.blob')
const OLD_ENCRYPTED = Buffer.from([0x11, 0x22, 0x33])
const NEW_ENCRYPTED = Buffer.from([0x44, 0x55, 0x66])

const CREDENTIAL_EVENT_NAMES = new Set([
  'credential_set',
  'credential_get',
  'credential_missing',
  'credential_cleared',
  'credential_reencrypted',
  'credential_operation_failed',
])

const CREDENTIAL_EVENT_STATUS: Record<string, CredentialEvent['status']> = {
  credential_set: 'success',
  credential_get: 'success',
  credential_missing: 'info',
  credential_cleared: 'success',
  credential_reencrypted: 'success',
  credential_operation_failed: 'failed',
}

const CREDENTIAL_ERROR_CODES = new Set([
  'credential_input_invalid',
  'credential_encryption_unavailable',
  'credential_encrypt_failed',
  'credential_decrypt_failed',
  'credential_io_failed',
  'credential_reencrypt_failed',
  'credential_clear_failed',
])

const observedEvents: CredentialEvent[] = []
const temporaryDirectories: string[] = []

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function makeSink(events: CredentialEvent[]): CredentialEventSink {
  return {
    emit(event) {
      events.push(event)
      observedEvents.push(event)
    },
  }
}

type CredentialHarness = {
  bytes: Map<string, Buffer>
  events: CredentialEvent[]
  files: CredentialFileOperations & {
    readPaths: string[]
    removePaths: string[]
    failRead: boolean
    failRemove: boolean
  }
  writer: CredentialAtomicWriter & {
    writePaths: string[]
    failWrite: boolean
  }
  safe: SafeStorageAdapter & {
    available: boolean
    reencrypt: boolean
    failEncrypt: boolean
    failDecrypt: boolean
    nextEncrypted: Buffer
  }
}

function makeHarness(): CredentialHarness {
  const bytes = new Map<string, Buffer>()

  const events: CredentialEvent[] = []
  const files: CredentialHarness['files'] = {
    readPaths: [],
    removePaths: [],
    failRead: false,
    failRemove: false,
    async ensureDirectory() {},
    async readBytes(filePath) {
      this.readPaths.push(filePath)
      if (this.failRead) throw new Error(RAW_ADAPTER_DETAIL)
      const value = bytes.get(filePath)
      return value === undefined ? null : Buffer.from(value)
    },
    async remove(filePath) {
      this.removePaths.push(filePath)
      if (this.failRemove) throw new Error(RAW_ADAPTER_DETAIL)
      bytes.delete(filePath)
    },
  }
  const writer: CredentialHarness['writer'] = {
    writePaths: [],
    failWrite: false,
    async write(filePath, encrypted) {
      this.writePaths.push(filePath)
      if (this.failWrite) throw new Error(RAW_ADAPTER_DETAIL)
      bytes.set(filePath, Buffer.from(encrypted))
    },
  }
  const safe: CredentialHarness['safe'] = {
    available: true,
    reencrypt: false,
    failEncrypt: false,
    failDecrypt: false,
    nextEncrypted: Buffer.from(OLD_ENCRYPTED),
    isEncryptionAvailable() {
      return this.available
    },
    encryptString() {
      if (this.failEncrypt) throw new Error(RAW_ADAPTER_DETAIL)
      return Buffer.from(this.nextEncrypted)
    },
    decryptString(encrypted) {
      if (this.failDecrypt) throw new Error(RAW_ADAPTER_DETAIL)
      expect(Buffer.from(encrypted)).toEqual(OLD_ENCRYPTED)
      return FAKE_SECRET
    },
    shouldReEncrypt() {
      return this.reencrypt
    },
  }
  return { bytes, events, files, writer, safe }
}

function makeStore(harness: CredentialHarness, credentialPath = CREDENTIAL_PATH) {
  return createCredentialStore({
    credentialPath,
    safeStorage: harness.safe,
    files: harness.files,
    atomicWriter: harness.writer,
    events: makeSink(harness.events),
  })
}

function expectEvent(
  events: CredentialEvent[],
  event: string,
  status: CredentialEvent['status'],
  reason: string,
  errorCode?: string,
): void {
  const expected: CredentialEvent = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) expected.error_code = errorCode
  expect(events).toContainEqual(expected)
}

function assertCredentialEvents(events: readonly CredentialEvent[]): void {
  for (const event of events) {
    expect(CREDENTIAL_EVENT_NAMES.has(event.event)).toBe(true)
    expect(CREDENTIAL_EVENT_STATUS[event.event]).toBe(event.status)
    expect(event.module).toBe('config')
    expect(event.source).toBe('runtime')
    expect(Object.keys(event).every((key) =>
      ['module', 'event', 'status', 'source', 'reason', 'error_code'].includes(key),
    )).toBe(true)
    expect(Object.keys(event)).not.toContain('time')
    expect(event.reason).toMatch(/^[A-Za-z0-9_=;.-]+$/)
    if (event.event === 'credential_operation_failed') {
      expect(typeof event.error_code).toBe('string')
      expect(CREDENTIAL_ERROR_CODES.has(event.error_code as string)).toBe(true)
    } else {
      expect(event.error_code).toBeUndefined()
    }
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(FAKE_SECRET)

    expect(serialized).not.toContain(RAW_ADAPTER_DETAIL)
    expect(serialized).not.toContain(CREDENTIAL_PATH)
  }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task3-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  assertCredentialEvents(observedEvents)
  observedEvents.length = 0
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('CredentialStore contract', () => {
  it('persists only encrypted bytes at the caller-supplied credential path', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    await store.set(FAKE_SECRET)

    expect(harness.bytes.get(CREDENTIAL_PATH)).toEqual(OLD_ENCRYPTED)
    expect(harness.writer.writePaths).toEqual([CREDENTIAL_PATH])
    expect(harness.files.removePaths).toEqual([])
    expect(harness.files.readPaths).toEqual([])
    expect(JSON.stringify(harness.events)).not.toContain(FAKE_SECRET)
    expect(JSON.stringify(harness.events)).not.toContain(CREDENTIAL_PATH)
    expect(CREDENTIAL_PATH).not.toContain('config')
    expect(CREDENTIAL_PATH).not.toContain('backups')
    expectEvent(
      harness.events,
      'credential_set',
      'success',
      'operation=set;storage=encrypted_blob',
    )

    expect(await store.get()).toBe(FAKE_SECRET)
    expectEvent(
      harness.events,
      'credential_get',
      'success',
      'operation=get;result=present;storage=encrypted_blob',
    )
  })

  it('returns missing without decrypting and clears present and absent blobs idempotently', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    expect(await store.get()).toBe(null)
    expectEvent(
      harness.events,
      'credential_missing',
      'info',
      'operation=get;result=missing;cause=not_found',
    )

    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    await store.clear()
    expect(harness.bytes.has(CREDENTIAL_PATH)).toBe(false)
    expectEvent(
      harness.events,
      'credential_cleared',
      'success',
      'operation=clear;result=removed',
    )

    await store.clear()
    expectEvent(
      harness.events,
      'credential_cleared',
      'success',
      'operation=clear;result=already_absent',
    )
  })

  it('gates set and get on safeStorage availability while clear remains local and usable', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)
    harness.safe.available = false

    await expect(store.set(FAKE_SECRET)).rejects.toMatchObject({
      code: 'credential_encryption_unavailable',
    })
    await expect(store.get()).rejects.toMatchObject({
      code: 'credential_encryption_unavailable',
    })
    expect(harness.writer.writePaths).toEqual([])
    expect(harness.files.readPaths).toEqual([])
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=encryption_unavailable',
      'credential_encryption_unavailable',

    )
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=encryption_unavailable',
      'credential_encryption_unavailable',
    )

    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    await store.clear()
    expect(harness.bytes.has(CREDENTIAL_PATH)).toBe(false)
  })

  it('re-encrypts stale bytes atomically before returning the plaintext', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)
    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    harness.safe.reencrypt = true
    harness.safe.nextEncrypted = Buffer.from(NEW_ENCRYPTED)

    expect(await store.get()).toBe(FAKE_SECRET)

    expect(harness.bytes.get(CREDENTIAL_PATH)).toEqual(NEW_ENCRYPTED)
    expect(harness.writer.writePaths).toEqual([CREDENTIAL_PATH])
    expect(harness.events.slice(-2)).toEqual([
      {
        module: 'config',
        event: 'credential_reencrypted',
        status: 'success',
        source: 'runtime',
        reason: 'operation=get;cause=should_reencrypt',
      },
      {
        module: 'config',
        event: 'credential_get',
        status: 'success',
        source: 'runtime',
        reason: 'operation=get;result=present;storage=encrypted_blob',
      },
    ])
  })

  it('rejects empty input with a redacted stable error', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    let caught: unknown
    try {
      await store.set('')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CredentialStoreError)
    expect((caught as CredentialStoreError).code).toBe('credential_input_invalid')
    expect((caught as Error).message).toBe('Credential store operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expect(String(caught)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=empty_input',
      'credential_input_invalid',
    )
  })

  it('redacts encrypt, decrypt, read, re-encrypt, write, and clear failures', async () => {
    const encryptHarness = makeHarness()
    encryptHarness.safe.failEncrypt = true
    let encryptError: unknown
    try {
      await makeStore(encryptHarness).set(FAKE_SECRET)
    } catch (error) {
      encryptError = error
    }
    expect((encryptError as CredentialStoreError).code).toBe('credential_encrypt_failed')
    expect((encryptError as Error).message).toBe('Credential store operation failed')
    expect(Object.prototype.hasOwnProperty.call(encryptError, 'cause')).toBe(false)
    expect(String(encryptError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      encryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=encrypt_failed',
      'credential_encrypt_failed',
    )

    const decryptHarness = makeHarness()
    decryptHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    decryptHarness.safe.failDecrypt = true
    let decryptError: unknown
    try {
      await makeStore(decryptHarness).get()
    } catch (error) {
      decryptError = error
    }
    expect((decryptError as CredentialStoreError).code).toBe('credential_decrypt_failed')
    expect((decryptError as Error).message).toBe('Credential store operation failed')

    expect(String(decryptError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      decryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=decrypt_failed',
      'credential_decrypt_failed',
    )

    const readHarness = makeHarness()
    readHarness.files.failRead = true
    let readError: unknown
    try {
      await makeStore(readHarness).get()
    } catch (error) {
      readError = error
    }
    expect((readError as CredentialStoreError).code).toBe('credential_io_failed')
    expect(String(readError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      readHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=io_failure',
      'credential_io_failed',
    )

    const reencryptEncryptHarness = makeHarness()
    reencryptEncryptHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    reencryptEncryptHarness.safe.reencrypt = true
    reencryptEncryptHarness.safe.failEncrypt = true
    let reencryptEncryptError: unknown
    try {
      await makeStore(reencryptEncryptHarness).get()
    } catch (error) {
      reencryptEncryptError = error
    }
    expect((reencryptEncryptError as CredentialStoreError).code).toBe('credential_reencrypt_failed')
    expectEvent(
      reencryptEncryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=reencrypt_failed',
      'credential_reencrypt_failed',
    )

    const writeHarness = makeHarness()
    writeHarness.writer.failWrite = true
    let writeError: unknown
    try {
      await makeStore(writeHarness).set(FAKE_SECRET)
    } catch (error) {
      writeError = error
    }
    expect((writeError as CredentialStoreError).code).toBe('credential_io_failed')
    expect(String(writeError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      writeHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=io_failure',
      'credential_io_failed',
    )

    const reencryptWriteHarness = makeHarness()
    reencryptWriteHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    reencryptWriteHarness.safe.reencrypt = true
    reencryptWriteHarness.writer.failWrite = true
    let reencryptWriteError: unknown
    try {
      await makeStore(reencryptWriteHarness).get()
    } catch (error) {
      reencryptWriteError = error
    }
    expect((reencryptWriteError as CredentialStoreError).code).toBe('credential_reencrypt_failed')
    expectEvent(
      reencryptWriteHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=reencrypt_failed',
      'credential_reencrypt_failed',
    )

    const clearHarness = makeHarness()
    clearHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    clearHarness.files.failRemove = true
    let clearError: unknown
    try {
      await makeStore(clearHarness).clear()
    } catch (error) {
      clearError = error
    }
    expect((clearError as CredentialStoreError).code).toBe('credential_clear_failed')
    expect(String(clearError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      clearHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=clear;cause=clear_failed',
      'credential_clear_failed',

    )
  })

  it('resolves files-only and atomic-only mixed optional adapter seams without path leakage', async () => {
    const firstRoot = await makeTemporaryDirectory()
    const firstCredentialPath = join(firstRoot, 'data', 'credentials', 'credential.blob')
    await mkdir(dirname(firstCredentialPath), { recursive: true })
    const firstFiles: CredentialFileOperations = {
      async ensureDirectory(path) {
        await mkdir(path, { recursive: true })
      },
      async readBytes(path) {
        try {
          return await readFile(path)
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      async remove(path) {
        try {
          await unlink(path)
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      },
    }
    const firstHarness = makeHarness()
    await createCredentialStore({
      credentialPath: firstCredentialPath,
      safeStorage: firstHarness.safe,
      files: firstFiles,
      events: makeSink(firstHarness.events),
    }).set(FAKE_SECRET)
    expect(await readFile(firstCredentialPath)).toEqual(OLD_ENCRYPTED)

    const secondRoot = await makeTemporaryDirectory()
    const secondCredentialPath = join(secondRoot, 'data', 'credentials', 'credential.blob')
    await mkdir(dirname(secondCredentialPath), { recursive: true })
    const atomicPaths: string[] = []
    const secondHarness = makeHarness()
    const atomicWriter: CredentialAtomicWriter = {
      async write(path, encrypted) {
        atomicPaths.push(path)
        await writeFile(path, encrypted)
      },
    }
    await createCredentialStore({
      credentialPath: secondCredentialPath,
      safeStorage: secondHarness.safe,
      atomicWriter,
      events: makeSink(secondHarness.events),
    }).set(FAKE_SECRET)
    expect(atomicPaths).toEqual([secondCredentialPath])
    expect(await readFile(secondCredentialPath)).toEqual(OLD_ENCRYPTED)
    expect(atomicPaths.every((path) => path === secondCredentialPath)).toBe(true)
  })
})
