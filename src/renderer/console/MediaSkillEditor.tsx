import * as React from 'react'
import { canUseAvatarResource, type AvatarProfile } from '../../shared/avatar-profiles'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import { DEFAULT_MEDIA_SKILL, type AvatarMediaResource, type AvatarMediaSkill } from '../../shared/media-skill'
import { HelpField } from './HelpField'
import { FIELD_HELP } from './field-help-text'
import { addAvatarMedia } from './media-selection'
import { MediaPreview } from './MediaPreview'

export function MediaSkillEditor({ avatar, draft, disabled, onChange, onImport, published }: {
  avatar: AvatarProfile
  draft: Pick<ConsoleConfigDraftInput, 'visualAssets' | 'musicAssets' | 'avatarCatalog'>
  disabled: boolean
  onChange(avatar: AvatarProfile): void
  onImport?(): void
  published?: AvatarMediaSkill
}): React.JSX.Element {
  const skill = avatar.mediaSkill ?? DEFAULT_MEDIA_SKILL
  const allowed = (kind: AvatarMediaResource['kind'], assetId: string): boolean => !draft.avatarCatalog
    || canUseAvatarResource(draft.avatarCatalog, avatar.id, kind === 'video' ? 'visual' : 'music', assetId)
  const library = {
    video: draft.visualAssets.filter(asset => asset.kind === 'video'),
    music: draft.musicAssets,
  }
  const edit = (patch: Partial<AvatarMediaSkill>): void => {
    if (!disabled) onChange({ ...avatar, mediaSkill: { ...skill, ...patch } })
  }
  const editResource = (index: number, patch: Partial<AvatarMediaResource>): void => edit({
    resources: skill.resources.map((resource, i) => i === index ? { ...resource, ...patch } : resource),
  })
  const add = (kind: AvatarMediaResource['kind'], assetId: string): void => {
    const asset = library[kind].find(item => item.id === assetId)
    if (asset && !disabled) onChange(addAvatarMedia(avatar, [asset], draft.avatarCatalog))
  }

  return <fieldset disabled={disabled} aria-label="Media skill">
    <legend>Choose what {avatar.name || 'this avatar'} can play</legend>
    <p>Video fades the avatar out until it finishes. Music plays while the avatar stays visible.</p>
    <button type="button" className="console__primary" disabled={disabled || !onImport} onClick={onImport}>Upload music or video…</button>
    <p className="console__muted">Uploads are copied locally and selected for this avatar. Or select an existing file below. Images remain in Media library.</p>
    <p role="status">{skill.resources.length} selected · {JSON.stringify(skill) === JSON.stringify(published) ? 'Published · ready for the next conversation' : 'Save & apply all changes below to make these settings available'}</p>
      <HelpField help={FIELD_HELP.mediaSkillEnabled} className="console__check"><input type="checkbox" aria-label="Enable media skill"
        checked={skill.enabled} onChange={e => edit({ enabled: e.currentTarget.checked })} />Enable media skill</HelpField>
    {!skill.enabled ? <p role="status">Media skill is disabled for this avatar. You can still edit its configured resources.</p> : null}
    <div className="media-skill-choices">
      {(['video', 'music'] as const).flatMap(kind => library[kind].filter(asset => allowed(kind, asset.id)).map(asset => {
        const selected = skill.resources.some(r => r.kind === kind && r.assetId === asset.id)
        return <div className="media-skill-choice" key={`${kind}:${asset.id}`}>
          <HelpField help={kind === 'video' ? FIELD_HELP.mediaSkillVideo : FIELD_HELP.mediaSkillMusic} className="console__check">
            <input type="checkbox" aria-label={`Allow ${kind} ${asset.name}`} data-media-kind={kind} data-asset-id={asset.id} checked={selected}
              disabled={disabled || !selected && skill.resources.length >= 512}
              onChange={e => e.currentTarget.checked ? add(kind, asset.id) : edit({ resources: skill.resources.filter(r => r.kind !== kind || r.assetId !== asset.id) })} />
            {asset.name} · {kind === 'video' ? 'Video' : 'Music'}
          </HelpField>
          <MediaPreview kind={kind} id={asset.id} name={asset.name} gain={skill.gain} />
        </div>
      }))}
    </div>
    {!skill.resources.length ? <p className="console__empty">No media selected. Upload music or video above, or check a file in the list.</p> : null}
    <p>Say “play [name] once” to play to the end, “loop [name]” to repeat until stopped, or “stop media” to stop playback.</p>
    <p className="console__muted">Names and aliases must be distinct within this avatar’s list. Manage sharing and avatar locks in Media library. Removing an entry here keeps its imported library resource.</p>
    {skill.resources.map((resource, index) => {
      const asset = library[resource.kind].find(item => item.id === resource.assetId)
      const unavailable = !asset || !allowed(resource.kind, resource.assetId)
      const label = asset?.name ?? resource.assetId
      return <fieldset key={`${resource.kind}:${resource.assetId}`}>
        <legend>{resource.kind === 'video' ? 'Video' : 'Music'} · {asset?.name ?? 'Unavailable library resource'}</legend>
        <p>Try “Play {resource.name}” or “Loop {resource.name}”.</p>
        {unavailable ? <p role="alert" className="console__fault">This resource is missing from Media library or locked to another avatar. Remove it or update its library access before saving.</p> : null}
        <div className="console__form-grid">
          <HelpField help={FIELD_HELP.mediaSkillName}>Spoken name<input aria-label={`Spoken name for ${resource.kind} ${label}`} maxLength={120}
            value={resource.name} onChange={e => editResource(index, { name: e.currentTarget.value })} /></HelpField>
          <HelpField help={FIELD_HELP.mediaSkillAliases}>Aliases (one per line)<textarea aria-label={`Aliases for ${resource.kind} ${label}`}
            value={resource.aliases.join('\n')} onChange={e => editResource(index, { aliases: e.currentTarget.value === '' ? [] : e.currentTarget.value.split(/\r?\n/u) })} /></HelpField>
        </div>
        <button type="button" aria-label={`Remove ${resource.name || resource.kind} from media skill`}
          onClick={() => edit({ resources: skill.resources.filter((_, i) => i !== index) })}>Remove from skill</button>
      </fieldset>
    })}
    <details aria-label="Playback settings"><summary>Playback settings · fade and volume</summary><div className="console__form-grid">
      <HelpField help={FIELD_HELP.mediaSkillFade}>Fade duration (ms)<input type="number" aria-label="Media fade duration" min="0" max="10000" step="1"
        value={skill.fadeMs} onChange={e => edit({ fadeMs: Number(e.currentTarget.value) })} /></HelpField>
      <HelpField help={FIELD_HELP.mediaSkillGain}>Media volume · {Math.round(skill.gain * 100)}%<input type="range" aria-label="Media gain" min="0" max="1" step="0.05"
        value={skill.gain} onChange={e => edit({ gain: Number(e.currentTarget.value) })} /></HelpField>
    </div></details>
  </fieldset>
}
