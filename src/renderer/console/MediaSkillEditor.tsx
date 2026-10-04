import * as React from 'react'
import { canUseAvatarResource, type AvatarProfile } from '../../shared/avatar-profiles'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import { DEFAULT_MEDIA_SKILL, type AvatarMediaSkill } from '../../shared/media-skill'
import { HelpField } from './HelpField'
import { FIELD_HELP } from './field-help-text'
import { MediaPreview } from './MediaPreview'

export function MediaSkillEditor({ avatar, draft, disabled, onChange }: {
  avatar: AvatarProfile
  draft: Pick<ConsoleConfigDraftInput, 'visualAssets' | 'musicAssets' | 'avatarCatalog'>
  disabled: boolean
  onChange(avatar: AvatarProfile): void
}): React.JSX.Element {
  const skill = avatar.mediaSkill ?? DEFAULT_MEDIA_SKILL
  const edit = (patch: Partial<AvatarMediaSkill>): void => {
    if (!disabled) onChange({ ...avatar, mediaSkill: { ...skill, ...patch } })
  }
  return <fieldset disabled={disabled} aria-label="Media skill">
    <legend>Playback settings</legend>
    <p>Choosing a folder grants access to every supported music and video file in it, including subfolders. No individual file selection is needed.</p>
    <div className="console__form-grid">
      <HelpField help={FIELD_HELP.mediaSkillFade}>Fade duration (ms)<input type="number" aria-label="Media fade duration" min="0" max="10000" step="1"
        value={skill.fadeMs} onChange={e => edit({ fadeMs: Number(e.currentTarget.value) })} /></HelpField>
      <HelpField help={FIELD_HELP.mediaSkillGain}>Media volume · {Math.round(skill.gain * 100)}%<input type="range" aria-label="Media gain" min="0" max="1" step="0.05"
        value={skill.gain} onChange={e => edit({ gain: Number(e.currentTarget.value) })} /></HelpField>
    </div>
    {skill.resources.length > 0 && <details><summary>Previously imported files · {skill.resources.length}</summary>
      <p>These older entries are retained. New media comes from the folders above.</p>
      {!skill.enabled && <p>These older entries are disabled. Linked folders remain available.</p>}
      {skill.resources.map((resource, index) => {
        const asset = (resource.kind === 'video' ? draft.visualAssets.filter(a => a.kind === 'video') : draft.musicAssets).find(a => a.id === resource.assetId)
        const available = asset && (!draft.avatarCatalog || canUseAvatarResource(draft.avatarCatalog, avatar.id, resource.kind === 'video' ? 'visual' : 'music', resource.assetId))
        return <article key={resource.kind + ':' + resource.assetId}>
          <strong>{resource.name}</strong>
          {!available ? <p role="alert">This imported file is unavailable. Remove it or update its library access before saving.</p> : <MediaPreview kind={resource.kind} id={resource.assetId} name={resource.name} gain={skill.gain} />}
          <button type="button" aria-label={'Remove ' + resource.name + ' from media skill'} onClick={() => edit({ resources: skill.resources.filter((_, i) => i !== index) })}>Remove imported entry</button>
        </article>
      })}
    </details>}
  </fieldset>
}
