import { createContext } from 'react'
import type { ConsoleConfigDraftInput, ConsoleFieldError } from '../../shared/console-types'
import type { ProfileSection } from './profile-workspace'

export interface FieldErrorTarget extends ConsoleFieldError {
  readonly avatarId?: string
  readonly sceneId?: string
  readonly stepId?: string
  readonly actionId?: string
  readonly section?: ProfileSection
}

export const FieldErrorsContext = createContext<{
  readonly errors: readonly ConsoleFieldError[]
  readonly focus: FieldErrorTarget | null
}>({ errors: [], focus: null })

export const normalizeFieldPath = (path: string): string => path.replace(/\[(\d+)\]/g, '.$1').replace(/^persona\.name$/, 'personaName')

/** Resolve indices against the submitted draft, before filtered editor lists or a partial save can reorder them. */
export function resolveFieldErrors(fields: readonly ConsoleFieldError[], draft: ConsoleConfigDraftInput,
  preferredAvatarId: string): FieldErrorTarget[] {
  return fields.map(field => {
    const parts = normalizeFieldPath(field.path).split('.')
    let avatar = draft.avatarCatalog?.avatars.find(a => a.id === draft.avatarCatalog?.activeAvatarId)
    if (parts[0] === 'avatarCatalog' && parts[1] === 'avatars') {
      avatar = draft.avatarCatalog?.avatars[Number(parts[2])]
      parts.splice(0, 3)
    }
    const root = parts[0]
    if (root === 'sceneActions') {
      const action = draft.sceneActions[Number(parts[1])]
      if (!action) return field
      const avatars = draft.avatarCatalog?.avatars ?? []
      avatar = avatars.find(a => a.id === preferredAvatarId && a.scenes.some(s => s.stages.some(st => st.actionIds.includes(action.id))))
        ?? avatars.find(a => a.scenes.some(s => s.stages.some(st => st.actionIds.includes(action.id))))
      const scene = (avatar?.scenes ?? draft.scenes).find(s => s.stages.some(st => st.actionIds.includes(action.id)))
      const step = scene?.stages.find(st => st.actionIds.includes(action.id))
      return { ...field, path: `sceneActions.${action.id}.${parts.slice(2).join('.') || 'kind'}`,
        avatarId: avatar?.id, sceneId: scene?.id, stepId: step?.id, actionId: action.id,
        section: scene ? 'Spells & scenes' : 'Action library' }
    }
    const prefix = avatar ? `avatar.${avatar.id}.` : ''
    if (root === 'scenes' || root === 'spells') {
      const item = (root === 'scenes' ? avatar?.scenes ?? draft.scenes : avatar?.spells ?? draft.spells)[Number(parts[1])]
      if (!item) return field
      const scene = root === 'scenes' ? (avatar?.scenes ?? draft.scenes).find(s => s.id === item.id)
        : (avatar?.scenes ?? draft.scenes).find(s => s.id === ('sceneId' in item ? item.sceneId : ''))
      parts[1] = item.id
      const step = parts[2] === 'stages' ? scene?.stages[Number(parts[3])] : undefined
      if (step) parts[3] = step.id
      // These collection/refinement errors belong to the editor's existing controls.
      const suffix = parts.join('.').replace(/\.actionIds(?:\.\d+)?$/, '.actionIds')
        .replace(/\.endCondition$/, '.endCondition.kind')
        .replace(/\.stages$/, '.name').replace(/\.sceneId$/, '.phrase')
      return { ...field, path: prefix + suffix + (parts.length === 2 ? root === 'scenes' ? '.name' : '.phrase' : ''),
        avatarId: avatar?.id, sceneId: scene?.id, stepId: step?.id, section: 'Spells & scenes' }
    }
    if (root === 'presentation' && parts.length === 1) {
      const presentation = avatar?.presentation ?? draft.presentation
      const invalidTiming = (key: 'entranceMs' | 'exitMs') => !Number.isSafeInteger(presentation?.[key])
        || presentation![key] < 200 || presentation![key] > 10000
      parts.push(presentation?.sleepFarewell !== undefined && (typeof presentation.sleepFarewell !== 'string'
        || !presentation.sleepFarewell.trim() || presentation.sleepFarewell.length > 500) ? 'sleepFarewell'
        : invalidTiming('entranceMs') ? 'entranceMs' : invalidTiming('exitMs') ? 'exitMs'
          : presentation?.mode === 'reflective' && (presentation.blackHoldMs ?? 400) > (presentation.revealStartMs ?? 1500) ? 'blackHoldMs'
            : presentation?.mode === 'reflective' && (presentation.revealStartMs ?? 1500) >= presentation.entranceMs ? 'revealStartMs' : 'mode')
    }
    if (root === 'presentation') return { ...field, path: prefix + parts.join('.'),
      avatarId: avatar?.id, section: parts[1] === 'wakeGreeting' || parts[1] === 'sleepFarewell' ? 'Persona' : 'Appearance' }
    if (root === 'personaName') parts[0] = 'name'
    if (root === 'wake' && parts[1] === 'phrase') parts.splice(0, 2, 'wakePhrase')
    if (avatar && ['name', 'personality', 'speakingStyle', 'idleSeconds', 'wakePhrase', 'sleepPhrase', 'wakeTuning', 'modelId', 'voice', 'voiceSpeed', 'voiceEffects'].includes(parts[0]!)) {
      if (parts.join('.') === 'wakeTuning.phrase') parts.splice(0, 2, 'wakePhrase')
      return { ...field, path: prefix + parts.join('.'), avatarId: avatar.id,
        section: root === 'modelId' ? 'Appearance' : root?.startsWith('voice') ? 'Voice' : 'Persona' }
    }
    return { ...field, path: normalizeFieldPath(field.path) }
  })
}

export function fieldErrorText(message: string): string {
  const copy: Record<string, string> = {
    too_small: 'Enter a value within the allowed range; required text cannot be empty.',
    too_big: 'Shorten this text or reduce the value to the allowed range.',
    invalid_type: 'Enter a valid value.', invalid_format: 'Use the required format.',
    invalid_value: 'Choose an available value.', invalid_enum_value: 'Choose an available value.',
    invalid_union: 'Check the fields for this action.', custom: 'Check this field and its related settings.',
    missing_music_asset: 'Select an available music asset.', missing_visual_asset: 'Select an available image or video.',
    normalized_spell_collision: 'Use a trigger phrase that is different from the other triggers.',
    missing_enabled_scene: 'Enable this trigger’s scene, or disable this trigger.',
    stage_end_condition_invalid: 'Choose an ending that matches this step’s video and playback.',
    until_stopped_must_be_final: 'Only the final step can run until stopped.',
    missing_scene_action: 'Link an available action to this step.', multiple_stage_visuals: 'Keep only one image or video action in this step.',
  }
  return copy[message] ?? 'Check this field and its related settings.'
}

export function focusInvalidField(root: ParentNode, path?: string): boolean {
  const control = Array.from(root.querySelectorAll<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], [data-field-path][role="group"][aria-invalid="true"]'))
    .find(field => !field.matches(':disabled') && !field.closest('fieldset[disabled]')
      && (path === undefined || field.dataset.fieldPath === path))
  if (!control) return false
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true
  }
  control.focus()
  control.scrollIntoView({ block: 'center' })
  return true
}
