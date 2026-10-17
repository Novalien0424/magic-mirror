import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { StudioAuthStatus, StudioConsoleCommand, StudioConsoleResult, StudioConsoleStatus, StudioOutcome, StudioPhase } from '../../shared/portrait-studio'
import { ReasonDetail } from './reason-copy'

export const STUDIO_LOGIN_COMMAND = 'npm run chatgpt:login'
export const STUDIO_USAGE_URL = 'https://chatgpt.com/#settings/Usage'
const LIVE_POLL_MS = 5000

type StudioBridge = Pick<ConsoleBridge, 'studio'> | null
type Tone = 'success' | 'degraded' | 'failed'
const ICONS: Readonly<Record<Tone, string>> = { success: '✓', degraded: '⚠', failed: '✕' }

export interface StudioAuthCopy { readonly label: string; readonly action: string; readonly tone: Tone; readonly needsLogin: boolean }

/** Sign-in state as operator text. Tokens are never requested or shown. */
export function studioAuthText(auth: StudioAuthStatus): StudioAuthCopy {
  const login = `Run ${STUDIO_LOGIN_COMMAND} in Terminal on this Mac, then press Refresh status.`
  switch (auth) {
    case 'signed_in': return { label: 'Using ChatGPT plan', action: '', tone: 'success', needsLogin: false }
    case 'missing': return { label: 'Not signed in', action: `Sign in to paint portraits. ${login}`, tone: 'failed', needsLogin: true }
    case 'invalid': return { label: 'Sign-in file unreadable', action: `Sign in again to replace it. ${login}`, tone: 'failed', needsLogin: true }
    case 'expired': return { label: 'Sign-in needs a refresh', action: `The app refreshes it before the next portrait. If painting still fails, sign in again: ${login}`, tone: 'degraded', needsLogin: false }
    case 'refresh_failed': return { label: 'Sign-in refresh failed', action: `Sign in again. ${login}`, tone: 'failed', needsLogin: true }
    default: return { label: 'Sign-in status unknown', action: `Press Refresh status. If it stays unknown, sign in again: ${login}`, tone: 'degraded', needsLogin: true }
  }
}

const FAILURES: Readonly<Record<string, string>> = {
  studio_auth_required: `ChatGPT sign-in is missing or was rejected. Run ${STUDIO_LOGIN_COMMAND} in Terminal on this Mac, then try again.`,
  studio_quota_exhausted: 'The ChatGPT plan’s image limit is reached. Check Manage usage, or try again after the limit resets.',
  studio_image_refused: 'The image request was refused by the image safety system. Adjust the art style, publish, then try again.',
  studio_model_rejected: 'ChatGPT rejected the configured image model. The model comes from versioned configuration and is never switched automatically.',
  studio_provider_contract: 'The image service returned an unexpected response. It may have changed; check for an app update.',
  studio_image_timeout: 'Painting took too long and was stopped. Try again, or choose a faster quality.',
  studio_image_unavailable: 'The image service could not be reached. Check the internet connection, then try again.',
  studio_cancelled: 'The test portrait was cancelled.',
  studio_config_unavailable: 'Published Portrait Studio settings are unavailable. Reload the Console settings, then try again.',
}

export function studioFailureText(code: string | undefined): string {
  return (code && FAILURES[code]) || `The test portrait failed${code ? ` (${code})` : ''}. Try again; if it repeats, check Events for the reason.`
}

const ACTIONS: Readonly<Record<string, string>> = {
  studio_started: 'Portrait Studio started. The avatar asks the visitor’s name first.',
  studio_start_duplicate: 'Portrait Studio is already running for this conversation.',
  studio_session_replaced: 'The previous studio closed; a new one started.',
  studio_requires_active_session: 'Start a conversation first. Portrait Studio runs inside the current conversation.',
  studio_unavailable: 'Portrait Studio is unavailable. Check ChatGPT sign-in in Avatars → Experiences and that settings are published.',
  studio_not_enabled: 'Portrait Studio is turned off for this avatar.',
  studio_operator_exit: 'Back to conversation. The studio closed and its portrait was cleared.',
  studio_not_active: 'Portrait Studio is not running.',
}

export function studioActionText(code: string): string {
  return ACTIONS[code] ?? `Portrait Studio replied ${code}.`
}

const PHASES: Readonly<Record<StudioPhase, string>> = {
  name: 'Asking the visitor’s name', confirm: 'Confirming the name', question: 'Asking questions', painting: 'Painting',
  reveal: 'Showing the portrait', revising: 'Painting a change', keepsake: 'Showing the final portrait',
}

export function studioPhaseText(status: Pick<StudioConsoleStatus, 'active' | 'phase'> | null): string {
  if (!status) return 'Status unknown'
  if (!status.active) return 'Not running'
  return status.phase ? PHASES[status.phase] ?? 'Running' : 'Running'
}

export function formatRefreshTime(iso: string | undefined, locale?: string): string {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isFinite(time) && time > 0 ? new Date(time).toLocaleString(locale) : 'Not recorded'
}

const outcomeTone = (status: StudioOutcome): Tone => status === 'accepted' ? 'success' : status === 'ignored' ? 'degraded' : 'failed'
/** Only an inline raster data URL is rendered; anything else is ignored. */
export const safePreviewUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null

type Failure = { error: string; reason: string }
async function call(bridge: StudioBridge, command: StudioConsoleCommand): Promise<StudioConsoleResult | Failure> {
  if (!bridge?.studio) return { error: 'studio_console_unavailable', reason: 'cause=bridge_missing' }
  try {
    const response = await bridge.studio(command)
    return response.ok ? response.value : { error: response.error, reason: response.reason }
  } catch { return { error: 'studio_console_unavailable', reason: 'cause=bridge_failed' } }
}
const failed = (value: StudioConsoleResult | Failure): value is Failure => 'error' in value

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }): React.JSX.Element {
  return <span className={`console__status console__status--${tone === 'success' ? 'success' : tone === 'degraded' ? 'degraded' : 'failed'}`}>
    <span aria-hidden="true">{ICONS[tone]}</span>&nbsp;{children}</span>
}

type TestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly startedAt: number }
  | { readonly kind: 'ready'; readonly dataUrl: string; readonly elapsedMs: number }
  | { readonly kind: 'failed'; readonly code?: string; readonly elapsedMs: number }

/** Device-level ChatGPT image status and a Console-only test portrait (never saved). */
export function StudioStatusPanel({ bridge, visible = true, initialStatus = null }: {
  bridge: StudioBridge
  visible?: boolean
  initialStatus?: StudioConsoleStatus | null
}): React.JSX.Element {
  const [status, setStatus] = useState<StudioConsoleStatus | null>(initialStatus)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const available = !!bridge?.studio

  const refresh = useCallback(async (): Promise<void> => {
    if (!bridge?.studio) return
    setLoading(true)
    const result = await call(bridge, { action: 'status' })
    if (!mounted.current) return
    setLoading(false)
    if (failed(result)) setFailure(result)
    else { setFailure(null); setStatus(result.status) }
  }, [bridge])
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])

  const busy = test.kind === 'busy'
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const runTest = async (): Promise<void> => {
    if (!bridge?.studio || busy) return
    const startedAt = Date.now()
    setNow(startedAt); setTest({ kind: 'busy', startedAt })
    const result = await call(bridge, { action: 'test' })
    if (!mounted.current) return
    if (failed(result)) { setFailure(result); setTest({ kind: 'failed', code: undefined, elapsedMs: Date.now() - startedAt }); return }
    setStatus(result.status)
    const outcome = result.test
    const dataUrl = outcome?.ok ? safePreviewUrl(outcome.dataUrl) : null
    setTest(outcome?.ok && dataUrl ? { kind: 'ready', dataUrl, elapsedMs: outcome.elapsedMs }
      : { kind: 'failed', code: outcome?.ok ? 'studio_provider_contract' : outcome?.code, elapsedMs: outcome?.elapsedMs ?? 0 })
  }

  const auth = status ? studioAuthText(status.auth) : null
  const seconds = (ms: number): number => Math.max(0, Math.round(ms / 1000))
  const testMessage = test.kind === 'busy' ? 'Painting test portrait. This can take a couple of minutes; keep this page open.'
    : test.kind === 'ready' ? `Test portrait ready in ${seconds(test.elapsedMs)} s. Shown here only; it is not saved.`
      : test.kind === 'failed' ? studioFailureText(test.code) : ''

  return <section className="studio-status" aria-labelledby="studio-status-heading" aria-busy={loading || busy || undefined}>
    <div className="studio-status__heading">
      <h4 id="studio-status-heading">ChatGPT image service · this Mac</h4>
      <button type="button" disabled={!available || loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh status'}</button>
    </div>
    {!available && <p className="console__fault">Portrait Studio controls are unavailable in this Console. Restart the app to load them.</p>}
    {failure && <div className="console__fault"><ReasonDetail code={`${failure.error}; ${failure.reason}`} /></div>}
    {auth && status && <>
      <p className="studio-status__auth"><Badge tone={auth.tone}>{auth.label}</Badge></p>
      {auth.action && <p className="studio-status__action">{auth.action}</p>}
      {auth.needsLogin && <p>Command: <code className="studio-status__selectable">{STUDIO_LOGIN_COMMAND}</code></p>}
      <dl className="studio-status__facts">
        <dt>Last sign-in refresh</dt><dd>{formatRefreshTime(status.lastRefresh)}</dd>
        <dt>Image model</dt><dd><code className="studio-status__selectable">{status.modelId}</code> · read-only, from versioned configuration</dd>
        <dt>Manage usage</dt><dd><span className="studio-status__selectable">{STUDIO_USAGE_URL}</span> · open this address in a browser signed in to the same ChatGPT account</dd>
      </dl>
    </>}
    {!status && available && !failure && <p className="console__muted">{loading ? 'Checking sign-in…' : 'Sign-in status not loaded yet.'}</p>}
    <div className="studio-status__test">
      <button type="button" disabled={!available || busy} onClick={() => void runTest()}>{busy ? 'Painting…' : 'Generate test portrait'}</button>
      <p className="console__muted">Uses the published Experiences settings of the avatar on the Mirror with sample answers and the name “Raven”. Publish edits before testing.</p>
    </div>
    <p className={`studio-status__result${test.kind === 'failed' ? ' studio-status__result--failed' : ''}`} role="status" aria-live="polite">
      {testMessage && <><span aria-hidden="true">{test.kind === 'busy' ? '◷' : test.kind === 'ready' ? ICONS.success : ICONS.failed}</span> {testMessage}</>}
    </p>
    {test.kind === 'busy' && <p className="console__muted">Elapsed: {seconds(now - test.startedAt)} s</p>}
    {test.kind === 'failed' && test.code && <details><summary>Technical detail</summary><code>{test.code}</code></details>}
    {test.kind === 'ready' && <figure className="studio-status__preview">
      <img src={test.dataUrl} alt="Test portrait generated with sample answers" />
      <figcaption>Console preview only; not saved. <button type="button" onClick={() => setTest({ kind: 'idle' })}>Clear preview</button></figcaption>
    </figure>}
  </section>
}

/** Live-session buttons beside the conversation controls. Polls status only while shown and a conversation is active. */
export function StudioLiveControls({ bridge, bridgeAvailable, lifecycle, visible }: {
  bridge: StudioBridge
  bridgeAvailable: boolean
  lifecycle?: string
  visible: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<StudioConsoleStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null)
  const mounted = useRef(true)
  const polling = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const available = bridgeAvailable && !!bridge?.studio
  const active = lifecycle === 'active'

  const refresh = useCallback(async (): Promise<void> => {
    if (!bridge?.studio || polling.current) return
    polling.current = true
    const result = await call(bridge, { action: 'status' })
    polling.current = false
    if (mounted.current && !failed(result)) setStatus(result.status)
  }, [bridge])
  useEffect(() => {
    if (!visible || !available) return
    void refresh()
    if (!active) return
    const timer = setInterval(() => void refresh(), LIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [visible, available, active, refresh])

  const run = async (action: 'start' | 'exit'): Promise<void> => {
    if (!bridge?.studio || busy) return
    setBusy(true)
    const result = await call(bridge, { action })
    if (!mounted.current) return
    setBusy(false)
    if (failed(result)) { setMessage({ tone: 'failed', text: `Portrait Studio request failed (${result.error}).` }); return }
    setStatus(result.status)
    if (result.action) setMessage({ tone: outcomeTone(result.action.status), text: studioActionText(result.action.code) })
  }

  const auth = status ? studioAuthText(status.auth) : null
  return <section className="console__panel console__lifecycle studio-live" aria-labelledby="studio-live-heading">
    <div className="console__panel-heading">
      <div><h2 id="studio-live-heading">Portrait Studio</h2></div>
      <span className="console__status">{studioPhaseText(status)}</span>
    </div>
    <div className="console__command-list" aria-label="Portrait Studio controls">
      <button type="button" disabled={!available || busy || !active} aria-describedby="studio-live-hint" onClick={() => void run('start')}>Start Portrait Studio</button>
      <button type="button" disabled={!available || busy || status?.active === false} onClick={() => void run('exit')}>Back to conversation</button>
    </div>
    <p id="studio-live-hint" className="console__muted">{!available ? 'Portrait Studio controls are unavailable in this Console.'
      : !active ? 'Start a conversation first; Portrait Studio runs inside the current conversation.'
        : auth?.needsLogin ? `ChatGPT: ${auth.label}. See Avatars → Experiences.` : 'Starts the studio for the visitor now, whatever the default mode.'}</p>
    <p className="console__result studio-live__result" role="status" aria-live="polite">
      {message && <><span aria-hidden="true">{ICONS[message.tone]}</span> {message.text}</>}
    </p>
  </section>
}
