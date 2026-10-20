import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

export interface EnvironmentCredentialSourceOptions {
  readonly readFile?: (path: string) => Promise<string>
}

export interface EnvironmentCredentialSource {
  get(): Promise<string | null>
}

function isMissingEnvFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
  )
}

export function createEnvironmentCredentialSource(
  options: EnvironmentCredentialSourceOptions = {},
): EnvironmentCredentialSource {
  const read = options.readFile ?? ((path: string) => readFile(path, 'utf8'))

  return {
    async get(): Promise<string | null> {
      let text: string
      try {
        text = await read(resolve(process.cwd(), '.env'))
      } catch (error) {
        if (isMissingEnvFileError(error)) return null
        throw new Error('credential_file_unreadable')
      }
      // Main-only RAM value: never populate process.env or accept an inherited key.
      try {
        const credential = parseEnv(text).OPENAI_API_KEY?.trim() ?? ''
        return credential || null
      } catch {
        throw new Error('credential_file_invalid')
      }
    },
  }
}
