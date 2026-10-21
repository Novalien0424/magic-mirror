import { CHATGPT_KEEPALIVE_INTERVAL_MS } from '../chatgpt-auth/constants'
import { createChatgptTokenFile, type ChatgptCredentialSource } from '../chatgpt-auth/token-file'
import { PORTRAIT_STUDIO } from '../../shared/portrait-studio-config'
import { createCodexImageProvider } from '../studio/image-provider'

/** One Main-owned image service, injected into both conversation and guided Studio. */
export function createAvatarImageService(deps: {
  report(reason: string, status: 'info' | 'degraded'): void
  credentials?: ChatgptCredentialSource
  keepSignedIn?: boolean
  fetchImpl?: typeof fetch
}) {
  const credentials = deps.credentials ?? createChatgptTokenFile({ report: reason =>
    deps.report(reason, /fail|invalid|missing|http_/.test(reason) ? 'degraded' : 'info') })
  const provider = createCodexImageProvider({ credentials, settings: PORTRAIT_STUDIO.image,
    fetchImpl: deps.fetchImpl, report: reason => deps.report(reason, 'info') })
  if (deps.keepSignedIn && credentials.keepAlive) {
    const keepAlive = () => void credentials.keepAlive!().catch(() => deps.report('chatgpt_keepalive_failed', 'degraded'))
    keepAlive()
    setInterval(keepAlive, CHATGPT_KEEPALIVE_INTERVAL_MS).unref()
  }
  return { provider, usable: async () => (await credentials.get().catch(() => null)) !== null,
    status: () => credentials.status() }
}
export type AvatarImageService = ReturnType<typeof createAvatarImageService>
