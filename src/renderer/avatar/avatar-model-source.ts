import type { AvatarState } from './avatar-state'

export interface AvatarModelSourceInput {
  readonly assetBaseUrl?: string
  readonly manifestFileName?: string
}

export interface AvatarModelSource {
  readonly assetBaseUrl: string
  readonly manifestUrl: string
}

const REN_EXPRESSIONS: Readonly<Partial<Record<AvatarState, string>>> = Object.freeze({
  Dormant: 'exp_03',
  Waking: 'exp_01',
  Listening: 'exp_01',
  Thinking: 'exp_05',
  Speaking: 'exp_01',
  Scene: 'exp_02',
  Suspending: 'exp_03',
})

export function renExpressionForState(state: AvatarState): string | null {
  return REN_EXPRESSIONS[state] ?? null
}

export function resolveAvatarModelSource(
  input: AvatarModelSourceInput = {},
): AvatarModelSource {
  const assetBaseUrl = input.assetBaseUrl ?? '/avatar/Ren/'
  const normalizedBaseUrl = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`
  const manifestFileName = input.manifestFileName ?? 'Ren.model3.json'
  return Object.freeze({
    assetBaseUrl: normalizedBaseUrl,
    manifestUrl: `${normalizedBaseUrl}${manifestFileName}`,
  })
}
