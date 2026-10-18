import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { MirrorMode, StudioAuthStatus, StudioConsoleCommand, StudioConsoleResult, StudioConsoleStatus, StudioOutcome, StudioPhase } from '../../shared/portrait-studio'
import { HelpButton } from './HelpButton'
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
    case 'signed_in': return { label: 'Signed in', action: 'Studio pictures use this Mac’s ChatGPT plan. The app keeps the sign-in refreshed in the background.', tone: 'success', needsLogin: false }
    case 'missing': return { label: 'Not signed in', action: `Sign in so the Interactive Studio can paint pictures. ${login}`, tone: 'failed', needsLogin: true }
    case 'invalid': return { label: 'Not signed in · sign-in file unreadable', action: `Sign in again to replace it. ${login}`, tone: 'failed', needsLogin: true }
    case 'expired': return { label: 'Signed in · refresh due', action: `The app refreshes it in the background and before the next picture. If painting still fails, sign in again: ${login}`, tone: 'degraded', needsLogin: false }
    case 'refresh_failed': return { label: 'Sign-in refresh failed', action: `The app retries every 30 minutes and before each picture. If this stays, sign in again: ${login}`, tone: 'failed', needsLogin: true }
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
  studio_cancelled: 'The test picture was cancelled.',
  studio_config_unavailable: 'Published Interactive Studio settings are unavailable. Reload the Console settings, then try again.',
}

export function studioFailureText(code: string | undefined): string {
  return (code && FAILURES[code]) || `The test picture failed${code ? ` (${code})` : ''}. Try again; if it repeats, check Events for the reason.`
}

const ACTIONS: Readonly<Record<string, string>> = {
  studio_started: 'Interactive Studio started for the visitor.',
  studio_start_duplicate: 'Interactive Studio is already running for this conversation.',
  studio_session_replaced: 'The previous studio closed; a new one started.',
  studio_requires_active_session: 'Start a conversation first. The studio runs inside the current conversation.',
  studio_unavailable: 'Interactive Studio is unavailable. Check ChatGPT sign-in in System → Studio service and that settings are published.',
  studio_not_enabled: 'Interactive Studio is turned off for this avatar.',
  studio_operator_exit: 'Back to conversation. The studio closed and its picture was cleared.',
  studio_not_active: 'Interactive Studio is not running.',
  mirror_mode_studio: 'Mirror mode: Interactive Studio. The mirror now wakes to the studio wake phrase; a visitor already in conversation enters the studio now.',
  mirror_mode_conversation: 'Mirror mode: Conversation. The mirror now wakes to the Persona wake phrase; a running studio closes now.',
  mirror_mode_save_failed: 'The Mirror mode could not be saved and was not changed. Check Events, then try again.',
}

export function studioActionText(code: string): string {
  return ACTIONS[code] ?? `Interactive Studio replied ${code}.`
}

const PHASES: Readonly<Record<StudioPhase, string>> = {
  name: 'Asking the visitor’s name', confirm: 'Confirming the name', question: 'Asking questions', painting: 'Painting',
  reveal: 'Showing the picture', revising: 'Painting a change', keepsake: 'Showing the final picture',
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

/** Device-level ChatGPT image status and a Console-only test picture (never saved). */
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
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyUsage = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(STUDIO_USAGE_URL); setCopied('copied') } catch { setCopied('failed') }
  }
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
  const testMessage = test.kind === 'busy' ? 'Painting test picture. This can take a couple of minutes; keep this page open.'
    : test.kind === 'ready' ? `Test picture ready in ${seconds(test.elapsedMs)} s. Shown here only; it is not saved.`
      : test.kind === 'failed' ? studioFailureText(test.code) : ''

  return <section className="studio-status" aria-labelledby="studio-status-heading" aria-busy={loading || busy || undefined}>
    <div className="studio-status__heading">
      <h2 id="studio-status-heading">Studio service · ChatGPT image service on this Mac</h2>
      <button type="button" disabled={!available || loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh status'}</button>
    </div>
    {!available && <p className="console__fault">Interactive Studio controls are unavailable in this Console. Restart the app to load them.</p>}
    {failure && <div className="console__fault"><ReasonDetail code={`${failure.error}; ${failure.reason}`} /></div>}
    {auth && status && <>
      <p className="studio-status__auth"><Badge tone={auth.tone}>{auth.label}</Badge></p>
      {auth.action && <p className="studio-status__action">{auth.action}</p>}
      {auth.needsLogin && <p>Command: <code className="studio-status__selectable">{STUDIO_LOGIN_COMMAND}</code></p>}
      <dl className="studio-status__facts">
        <dt>Last sign-in refresh</dt><dd>{formatRefreshTime(status.lastRefresh)}</dd>
        <dt>Image model</dt><dd><code className="studio-status__selectable" title="Read-only; comes from versioned configuration.">{status.modelId}</code></dd>
        <dt>Manage usage</dt><dd className="studio-status__usage"><span className="studio-status__selectable">{STUDIO_USAGE_URL}</span>
          <HelpButton help="Copies the address. Open it in a browser signed in to the same ChatGPT account." onClick={() => void copyUsage()}>
            {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed · select the text' : 'Copy address'}</HelpButton></dd>
      </dl>
    </>}
    {!status && available && !failure && <p className="console__muted">{loading ? 'Checking sign-in…' : 'Sign-in status not loaded yet.'}</p>}
    <div className="studio-status__test">
      <HelpButton help="Paints one picture here with the published Interactive Studio settings of the avatar on the Mirror, sample answers and the name “Raven”. Publish edits before testing. Nothing is shown on the Mirror or saved."
        disabled={!available || busy} onClick={() => void runTest()}>{busy ? 'Painting…' : 'Generate test picture'}</HelpButton>
    </div>
    <p className={`studio-status__result${test.kind === 'failed' ? ' studio-status__result--failed' : ''}`} role="status" aria-live="polite">
      {testMessage && <><span aria-hidden="true">{test.kind === 'busy' ? '◷' : test.kind === 'ready' ? ICONS.success : ICONS.failed}</span> {testMessage}</>}
    </p>
    {test.kind === 'busy' && <p className="console__muted">Elapsed: {seconds(now - test.startedAt)} s</p>}
    {test.kind === 'failed' && test.code && <details><summary>Technical detail</summary><code>{test.code}</code></details>}
    {test.kind === 'ready' && <figure className="studio-status__preview">
      <img src={test.dataUrl} alt="Test picture generated with sample answers" />
      <figcaption>Console preview only; not saved. <button type="button" onClick={() => setTest({ kind: 'idle' })}>Clear preview</button></figcaption>
    </figure>}
  </section>
}

export interface LiveMessage { readonly tone: Tone; readonly text: string }

/** Sign-in chip for Mirror and Avatars › Interactive Studio; sign-in and the test picture live in System › Studio service. */
export function StudioServiceSummary({ bridge, visible, onOpen }: { bridge: StudioBridge; visible: boolean; onOpen(): void }): React.JSX.Element {
  const [status, setStatus] = useState<StudioConsoleStatus | null>(null)
  useEffect(() => {
    if (!visible || !bridge?.studio) return
    let current = true
    void call(bridge, { action: 'status' }).then(result => { if (current && !failed(result)) setStatus(result.status) })
    return () => { current = false }
  }, [bridge, visible])
  const auth = status ? studioAuthText(status.auth) : null
  return <p className="studio-service-summary">
    <span>Interactive Studio · ChatGPT</span>
    {auth ? <Badge tone={auth.tone}>{auth.label}</Badge> : <span className="console__status">{bridge?.studio ? 'Checking…' : 'Unavailable'}</span>}
    <HelpButton className="console__link" help="Sign-in status, image model, usage and a test picture for this Mac. Shared by every avatar."
      onClick={onOpen}>Sign-in and test picture</HelpButton>
    <span className="studio-service-summary__hint">To start: set Mirror mode to Interactive Studio in the control bar, or press INTERACTIVE STUDIO on the Stream Deck; then visitors say{' '}
      <span lang="zh-Hant">「{status?.wakePhrase ?? 'the studio wake phrase'}」</span>.{status?.mirrorMode === 'studio' ? ' Interactive Studio mode is on.' : ''}</span>
  </p>
}

/** Mirror mode switch and studio status in the Console control bar. */
export function StudioLiveControls({ bridge, bridgeAvailable, lifecycle, visible, onMessage, onStatus }: {
  bridge: StudioBridge
  bridgeAvailable: boolean
  lifecycle?: string
  visible: boolean
  /** Shared result line; without it the group shows its own. */
  onMessage?(message: LiveMessage): void
  /** Latest status, for the header (mode label). */
  onStatus?(status: StudioConsoleStatus): void
}): React.JSX.Element {
  const [status, setStatus] = useState<StudioConsoleStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [ownMessage, setOwnMessage] = useState<LiveMessage | null>(null)
  const message = onMessage ? null : ownMessage
  const setMessage = (next: LiveMessage): void => { if (onMessage) onMessage(next); else setOwnMessage(next) }
  const mounted = useRef(true)
  const polling = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const available = bridgeAvailable && !!bridge?.studio
  const active = lifecycle === 'active'
  const show = (next: StudioConsoleStatus): void => { setStatus(next); onStatus?.(next) }

  const refresh = useCallback(async (): Promise<void> => {
    if (!bridge?.studio || polling.current) return
    polling.current = true
    const result = await call(bridge, { action: 'status' })
    polling.current = false
    if (mounted.current && !failed(result)) show(result.status)
  }, [bridge])
  // Lifecycle changes refresh too: a Stream Deck switch happens while the Console is hidden.
  useEffect(() => {
    if (!visible || !available) return
    void refresh()
    if (!active) return
    const timer = setInterval(() => void refresh(), LIVE_POLL_MS)
    return () => clearInterval(timer)
  }, [visible, available, active, lifecycle, refresh])

  const run = async (command: StudioConsoleCommand): Promise<void> => {
    if (!bridge?.studio || busy) return
    setBusy(true)
    const result = await call(bridge, command)
    if (!mounted.current) return
    setBusy(false)
    if (failed(result)) { setMessage({ tone: 'failed', text: `Interactive Studio request failed (${result.error}).` }); return }
    show(result.status)
    if (result.action) setMessage({ tone: outcomeTone(result.action.status), text: studioActionText(result.action.code) })
  }

  const mode: MirrorMode | undefined = status?.mirrorMode
  const auth = status ? studioAuthText(status.auth) : null
  const studioHelp = !available ? 'Interactive Studio controls are unavailable in this Console. Restart the app to load them.'
    : auth?.needsLogin ? `ChatGPT: ${auth.label}. Sign in from System → Studio service first; a wake then falls back to conversation.`
      : active ? 'Switches the Mirror to Interactive Studio: the visitor in front of the mirror enters it now; afterwards the mirror wakes to the studio wake phrase.'
        : `Switches the Mirror to Interactive Studio: the mirror wakes to 「${status?.wakePhrase ?? 'the studio wake phrase'}」 and runs the studio, then says farewell and sleeps.`
  const conversationHelp = active && status?.active ? 'Switches the Mirror to Conversation: the running studio closes now and the conversation continues.'
    : 'Switches the Mirror to Conversation: the mirror wakes to the Persona wake phrase and starts a normal conversation.'
  // A visitor may still open the studio from a conversation; only that run has a separate exit.
  const visitorRun = mode === 'conversation' && status?.active
  return <div className="live-bar__group studio-live" role="group" aria-labelledby="studio-live-heading">
    <h2 id="studio-live-heading" className="live-bar__label">Mirror mode</h2>
    <div className="studio-live__switch" role="group" aria-label="Mirror mode">
      <HelpButton placement="below" aria-pressed={mode === 'conversation'}
        help={conversationHelp} disabled={!available || busy || !mode} onClick={() => { if (mode !== 'conversation') void run({ action: 'mode', mode: 'conversation' }) }}>Conversation</HelpButton>
      <HelpButton placement="below" aria-pressed={mode === 'studio'}
        help={studioHelp} disabled={!available || busy || !mode} onClick={() => { if (mode !== 'studio') void run({ action: 'mode', mode: 'studio' }) }}>Interactive Studio</HelpButton>
    </div>
    {status?.active && <span className="console__status console__status--success" role="status">{studioPhaseText(status)}</span>}
    {visitorRun && <HelpButton placement="below" help="Ends the studio the visitor asked for, clears its picture from the Mirror and returns to conversation."
      disabled={!available || busy} onClick={() => void run({ action: 'exit' })}>Back to conversation</HelpButton>}
    {!onMessage && <p className="console__result studio-live__result" role="status" aria-live="polite">
      {message && <><span aria-hidden="true">{ICONS[message.tone]}</span> {message.text}</>}
    </p>}
  </div>
}
