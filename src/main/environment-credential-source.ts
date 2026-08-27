import { resolve } from 'node:path'
import { loadEnvFile as nodeLoadEnvFile } from 'node:process'

export interface EnvironmentCredentialSourceOptions {
  readonly loadEnvFile?: (path: string) => void
  readonly env?: NodeJS.ProcessEnv
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
  const loadEnvFile = options.loadEnvFile ?? nodeLoadEnvFile
  const env = options.env ?? process.env
  let envFileLoadAttempted = false

  return {
    async get(): Promise<string | null> {
      if (!envFileLoadAttempted) {
        envFileLoadAttempted = true
        try {
          loadEnvFile(resolve(process.cwd(), '.env'))
        } catch (error) {
          if (!isMissingEnvFileError(error)) throw error
        }
      }

      const credential = env.OPENAI_API_KEY?.trim() ?? ''
      return credential.length > 0 ? credential : null
    },
  }
}
