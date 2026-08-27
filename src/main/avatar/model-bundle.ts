const REQUIRED_MOTION_GROUPS = [
  'Dormant',
  'Waking',
  'Listening',
  'Thinking',
  'Speaking',
  'Scene',
  'Suspending',
] as const

type RequiredMotionGroup = typeof REQUIRED_MOTION_GROUPS[number]

export type AvatarBundleFailureReason =
  | 'avatar_model_manifest_invalid'
  | 'avatar_eye_blink_group_missing'
  | 'avatar_lip_sync_group_missing'
  | 'avatar_motion_group_missing'
  | 'avatar_asset_path_invalid'
  | 'avatar_asset_missing'

export interface CubismModelBundle {
  readonly moc: string
  readonly textures: readonly string[]
  readonly physics: string
  readonly motions: Readonly<Record<RequiredMotionGroup, string>>
  readonly expressions: readonly string[]
  readonly eyeBlinkParameters: readonly string[]
  readonly lipSyncParameters: readonly string[]
}

export type CubismModelBundleResult =
  | { readonly ok: true; readonly value: CubismModelBundle }
  | { readonly ok: false; readonly reason: AvatarBundleFailureReason }

export interface ValidateCubismModelBundleInput {
  readonly model3: unknown
  readonly files: ReadonlySet<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assetPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return null
  if (value.startsWith('/') || /^[a-z]:/iu.test(value)) return null
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return value
}

function parameterGroup(groups: unknown, name: 'EyeBlink' | 'LipSync'): readonly string[] | null {
  if (!Array.isArray(groups)) return null
  for (const value of groups) {
    if (!isRecord(value) || value['Target'] !== 'Parameter' || value['Name'] !== name) continue
    const ids = value['Ids']
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      return null
    }
    return Object.freeze([...ids] as string[])
  }
  return null
}

function motionReferences(value: unknown): Readonly<Record<RequiredMotionGroup, string>> | null {
  if (!isRecord(value)) return null
  const motions = {} as Record<RequiredMotionGroup, string>
  for (const group of REQUIRED_MOTION_GROUPS) {
    const entries = value[group]
    if (!Array.isArray(entries) || entries.length === 0 || !isRecord(entries[0])) return null
    const file = assetPath(entries[0]['File'])
    if (file === null) return null
    motions[group] = file
  }
  return Object.freeze(motions)
}

function expressionReferences(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const expressions: string[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const file = assetPath(entry['File'])
    if (file === null) return null
    expressions.push(file)
  }
  return Object.freeze(expressions)
}

export function validateCubismModelBundle(
  input: ValidateCubismModelBundleInput,
): CubismModelBundleResult {
  if (!isRecord(input.model3) || input.model3['Version'] !== 3) {
    return { ok: false, reason: 'avatar_model_manifest_invalid' }
  }
  const references = input.model3['FileReferences']
  if (!isRecord(references)) return { ok: false, reason: 'avatar_model_manifest_invalid' }

  const eyeBlinkParameters = parameterGroup(input.model3['Groups'], 'EyeBlink')
  if (eyeBlinkParameters === null) return { ok: false, reason: 'avatar_eye_blink_group_missing' }
  const lipSyncParameters = parameterGroup(input.model3['Groups'], 'LipSync')
  if (lipSyncParameters === null) return { ok: false, reason: 'avatar_lip_sync_group_missing' }

  const motions = motionReferences(references['Motions'])
  if (motions === null) return { ok: false, reason: 'avatar_motion_group_missing' }
  const expressions = expressionReferences(references['Expressions'])
  if (expressions === null) return { ok: false, reason: 'avatar_model_manifest_invalid' }

  const moc = assetPath(references['Moc'])
  const physics = assetPath(references['Physics'])
  const textureValues = references['Textures']
  if (moc === null || physics === null || !Array.isArray(textureValues) || textureValues.length === 0) {
    return { ok: false, reason: 'avatar_asset_path_invalid' }
  }
  const textures = textureValues.map(assetPath)
  if (textures.some((texture) => texture === null)) {
    return { ok: false, reason: 'avatar_asset_path_invalid' }
  }

  const artifacts = [
    moc,
    physics,
    ...(textures as string[]),
    ...Object.values(motions),
    ...expressions,
  ]
  if (artifacts.some((file) => !input.files.has(file))) {
    return { ok: false, reason: 'avatar_asset_missing' }
  }

  return {
    ok: true,
    value: Object.freeze({
      moc,
      textures: Object.freeze([...(textures as string[])]),
      physics,
      motions,
      expressions,
      eyeBlinkParameters,
      lipSyncParameters,
    }),
  }
}
