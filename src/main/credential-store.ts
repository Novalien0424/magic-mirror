import { mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MirrorEvent } from '../shared/types'

type WriteFileAtomic = (
  fileName: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding },
) => Promise<void>
const writeFileAtomic = require('write-file-atomic') as WriteFileAtomic

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(plaintext: string): Buffer
  decryptString(encrypted: Buffer): string
  shouldReEncrypt(): boolean
}

export interface CredentialFileOperations {
  ensureDirectory(directoryPath: string): Promise<void>
  readBytes(filePath: string): Promise<Buffer | null>
  remove(filePath: string): Promise<void>
}

export interface CredentialAtomicWriter {
  write(filePath: string, encrypted: Buffer): Promise<void>
}

export interface CredentialEventSink {
  emit(event: Omit<MirrorEvent, 'time'>): void
}

export interface CredentialStoreOptions {
  credentialPath: string
  safeStorage: SafeStorageAdapter
  files?: CredentialFileOperations
  atomicWriter?: CredentialAtomicWriter
  events: CredentialEventSink
}

export interface CredentialStore {
  set(plaintext: string): Promise<void>
  get(): Promise<string | null>
  clear(): Promise<void>
}

export type CredentialErrorCode =
  | 'credential_input_invalid'
  | 'credential_encryption_unavailable'
  | 'credential_encrypt_failed'
  | 'credential_decrypt_failed'
  | 'credential_io_failed'
  | 'credential_reencrypt_failed'
  | 'credential_clear_failed'

export type CredentialTelemetryErrorCode = CredentialErrorCode

export class CredentialStoreError extends Error {
  readonly code: CredentialErrorCode

  constructor(code: CredentialErrorCode) {
    super('Credential store operation failed')
    this.name = 'CredentialStoreError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

interface ResolvedCredentialStoreOptions {
  credentialPath: string
  safeStorage: SafeStorageAdapter
  files: CredentialFileOperations
  atomicWriter: CredentialAtomicWriter
  events: CredentialEventSink
}

const diskCredentialFiles: CredentialFileOperations = {
  async ensureDirectory(directoryPath) {
    await mkdir(directoryPath, { recursive: true })
  },
  async readBytes(filePath) {
    try {
      return await readFile(filePath)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  },
  async remove(filePath) {
    try {
      await unlink(filePath)
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  },
}

const diskCredentialAtomicWriter: CredentialAtomicWriter = {
  async write(filePath, encrypted) {
    await writeFileAtomic(filePath, encrypted)
  },
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function emitCredentialEvent(
  events: CredentialEventSink,
  event: string,
  status: 'success' | 'degraded' | 'failed' | 'info',
  reason: string,
  errorCode?: CredentialTelemetryErrorCode,
): void {
  const payload: Omit<MirrorEvent, 'time'> = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) payload.error_code = errorCode
  events.emit(payload)
}

function resolveCredentialOptions(
  options: CredentialStoreOptions,
): ResolvedCredentialStoreOptions {
  return {
    credentialPath: options.credentialPath,
    safeStorage: options.safeStorage,
    files: options.files ?? diskCredentialFiles,
    atomicWriter: options.atomicWriter ?? diskCredentialAtomicWriter,
    events: options.events,
  }
}

function encryptionAvailable(options: ResolvedCredentialStoreOptions): boolean {
  try {
    return options.safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
  const resolved = resolveCredentialOptions(options)

  function fail(
    operation: 'set' | 'get' | 'clear',
    cause: 'empty_input' | 'encryption_unavailable' | 'encrypt_failed' | 'decrypt_failed' | 'io_failure' | 'reencrypt_failed' | 'clear_failed',
    code: CredentialErrorCode,
  ): never {
    emitCredentialEvent(
      resolved.events,
      'credential_operation_failed',
      'failed',
      'operation=' + operation + ';cause=' + cause,
      code,
    )
    throw new CredentialStoreError(code)
  }

  return {
    async set(plaintext: string): Promise<void> {
      if (typeof plaintext !== 'string' || plaintext.length === 0) {
        return fail('set', 'empty_input', 'credential_input_invalid')
      }
      if (!encryptionAvailable(resolved)) {
        return fail(
          'set',
          'encryption_unavailable',
          'credential_encryption_unavailable',
        )
      }

      let encrypted: Buffer
      try {
        encrypted = resolved.safeStorage.encryptString(plaintext)
      } catch {
        return fail('set', 'encrypt_failed', 'credential_encrypt_failed')
      }

      try {
        await resolved.files.ensureDirectory(dirname(resolved.credentialPath))
        await resolved.atomicWriter.write(resolved.credentialPath, encrypted)
      } catch {
        return fail('set', 'io_failure', 'credential_io_failed')
      }
      emitCredentialEvent(
        resolved.events,
        'credential_set',
        'success',
        'operation=set;storage=encrypted_blob',
      )
    },

    async get(): Promise<string | null> {
      if (!encryptionAvailable(resolved)) {
        return fail(
          'get',
          'encryption_unavailable',
          'credential_encryption_unavailable',
        )
      }

      let encrypted: Buffer | null
      try {
        encrypted = await resolved.files.readBytes(resolved.credentialPath)
      } catch {
        return fail('get', 'io_failure', 'credential_io_failed')
      }
      if (encrypted === null) {
        emitCredentialEvent(
          resolved.events,
          'credential_missing',
          'info',
          'operation=get;result=missing;cause=not_found',
        )
        return null
      }

      let plaintext: string
      try {
        plaintext = resolved.safeStorage.decryptString(encrypted)
      } catch {
        return fail('get', 'decrypt_failed', 'credential_decrypt_failed')
      }

      let shouldReEncrypt: boolean
      try {
        shouldReEncrypt = resolved.safeStorage.shouldReEncrypt()
      } catch {
        return fail('get', 'reencrypt_failed', 'credential_reencrypt_failed')
      }
      if (shouldReEncrypt) {
        let renewed: Buffer
        try {
          renewed = resolved.safeStorage.encryptString(plaintext)
          await resolved.files.ensureDirectory(dirname(resolved.credentialPath))
          await resolved.atomicWriter.write(resolved.credentialPath, renewed)
        } catch {
          return fail('get', 'reencrypt_failed', 'credential_reencrypt_failed')
        }
        emitCredentialEvent(
          resolved.events,
          'credential_reencrypted',
          'success',
          'operation=get;cause=should_reencrypt',
        )
      }
      emitCredentialEvent(
        resolved.events,
        'credential_get',
        'success',
        'operation=get;result=present;storage=encrypted_blob',
      )
      return plaintext
    },

    async clear(): Promise<void> {
      let encrypted: Buffer | null
      try {
        encrypted = await resolved.files.readBytes(resolved.credentialPath)
      } catch {
        return fail('clear', 'io_failure', 'credential_io_failed')
      }
      if (encrypted === null) {
        emitCredentialEvent(
          resolved.events,
          'credential_cleared',
          'success',
          'operation=clear;result=already_absent',
        )
        return
      }

      try {
        await resolved.files.remove(resolved.credentialPath)
      } catch {
        return fail('clear', 'clear_failed', 'credential_clear_failed')
      }
      emitCredentialEvent(
        resolved.events,
        'credential_cleared',
        'success',
        'operation=clear;result=removed',
      )
    },
  }
}
