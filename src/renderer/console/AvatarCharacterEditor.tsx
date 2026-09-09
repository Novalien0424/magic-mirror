import type { AvatarProfile } from '../../shared/avatar-profiles'
import { buildAvatarPrompt, SLEEP_TOOL_DESCRIPTION } from '../../shared/avatar-prompt'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'

export function AvatarCharacterEditor({ avatar, onChange, disabled }: {
  avatar: AvatarProfile; onChange(avatar: AvatarProfile): void; disabled: boolean
}) {
  const settings = { name: avatar.name, personality: avatar.personality, speakingStyle: avatar.speakingStyle,
    wakeGreeting: avatar.presentation.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting!,
    sleepFarewell: avatar.presentation.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell! }
  return <fieldset disabled={disabled} className="avatar-character"><legend className="console__sr-only">Persona</legend>
    <div className="console__form-grid">
      <label>Avatar name<input maxLength={80} value={avatar.name} onChange={e => onChange({ ...avatar, name: e.currentTarget.value })} /></label>
      <label>Personality<textarea rows={5} maxLength={12000} value={avatar.personality} onChange={e => onChange({ ...avatar, personality: e.currentTarget.value })} /></label>
      <label>Sleep after inactivity (seconds)<input type="number" min={1} max={86400} value={avatar.idleSeconds} onChange={e => onChange({ ...avatar, idleSeconds: Number(e.currentTarget.value) })} /></label>
    </div>
    <p className="console__muted">Published voice and character changes apply to the next conversation. Both visitor and avatar speech keep the conversation awake.</p>
    <details className="avatar-prompt"><summary>Effective realtime prompt & tool</summary>
      <p>Exact application-controlled instructions for this draft. Provider safety instructions are not editable. No visitor history or private memory is shown here.</p>
      <pre aria-label="Effective realtime prompt">{buildAvatarPrompt(settings)}</pre>
      <h4>return_to_dormant · no arguments</h4><p>{SLEEP_TOOL_DESCRIPTION}</p>
      <p>Wake greeting and scene dialogue use verbatim speech requests. Sleep tool response: “Say exactly {settings.sleepFarewell} now and no other words.” Model IDs, reasoning and turn-detection settings remain in Models / versioned configuration.</p>
    </details>
  </fieldset>
}
