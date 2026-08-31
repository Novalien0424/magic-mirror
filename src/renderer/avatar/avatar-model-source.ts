import type { AvatarState } from './avatar-state'

export interface AvatarModelSourceInput {
  readonly assetBaseUrl?: string
  readonly manifestFileName?: string
  readonly documentBaseUrl?: string
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
  const documentBaseUrl = input.documentBaseUrl
    ?? (typeof document === 'undefined' ? undefined : document.baseURI)
  const assetBaseUrl = input.assetBaseUrl
    ?? (documentBaseUrl === undefined
      ? '/avatar/Ren/'
      : new URL('../avatar/Ren/', documentBaseUrl).toString())
  const normalizedBaseUrl = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`
  const manifestFileName = input.manifestFileName ?? 'Ren.model3.json'
  return Object.freeze({
    assetBaseUrl: normalizedBaseUrl,
    manifestUrl: `${normalizedBaseUrl}${manifestFileName}`,
  })
}

export function resolveCubismShaderBaseUrl(documentBaseUrl?: string): string {
  const baseUrl = documentBaseUrl
    ?? (typeof document === 'undefined' ? undefined : document.baseURI)
  return baseUrl === undefined
    ? '/live2d/Framework/Shaders/WebGL/'
    : new URL('../live2d/Framework/Shaders/WebGL/', baseUrl).toString()
}
