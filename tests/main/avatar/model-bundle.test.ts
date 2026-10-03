import { describe, expect, it } from 'vitest'

import { validateCubismModelBundle } from '../../../src/main/avatar/model-bundle'

const requiredFiles = new Set([
  'mirror.moc3',
  'textures/texture_00.png',
  'mirror.physics3.json',
  'motions/dormant.motion3.json',
  'motions/waking.motion3.json',
  'motions/listening.motion3.json',
  'motions/thinking.motion3.json',
  'motions/speaking.motion3.json',
  'motions/scene.motion3.json',
  'motions/suspending.motion3.json',
  'expressions/neutral.exp3.json',
])

function model3(): Record<string, unknown> {
  return {
    Version: 3,
    FileReferences: {
      Moc: 'mirror.moc3',
      Textures: ['textures/texture_00.png'],
      Physics: 'mirror.physics3.json',
      Motions: {
        Dormant: [{ File: 'motions/dormant.motion3.json' }],
        Waking: [{ File: 'motions/waking.motion3.json' }],
        Listening: [{ File: 'motions/listening.motion3.json' }],
        Thinking: [{ File: 'motions/thinking.motion3.json' }],
        Speaking: [{ File: 'motions/speaking.motion3.json' }],
        Scene: [{ File: 'motions/scene.motion3.json' }],
        Suspending: [{ File: 'motions/suspending.motion3.json' }],
      },
      Expressions: [{ Name: 'neutral', File: 'expressions/neutral.exp3.json' }],
    },
    Groups: [
      { Target: 'Parameter', Name: 'EyeBlink', Ids: ['ParamEyeLOpen', 'ParamEyeROpen'] },
      { Target: 'Parameter', Name: 'LipSync', Ids: ['ParamMouthOpenY'] },
    ],
  }
}

describe('validateCubismModelBundle', () => {
  it('accepts the complete development-rig contract and returns local references', () => {
    expect(validateCubismModelBundle({ model3: model3(), files: requiredFiles })).toEqual({
      ok: true,
      value: {
        moc: 'mirror.moc3',
        textures: ['textures/texture_00.png'],
        physics: 'mirror.physics3.json',
        motions: {
          Dormant: 'motions/dormant.motion3.json',
          Waking: 'motions/waking.motion3.json',
          Listening: 'motions/listening.motion3.json',
          Thinking: 'motions/thinking.motion3.json',
          Speaking: 'motions/speaking.motion3.json',
          Scene: 'motions/scene.motion3.json',
          Suspending: 'motions/suspending.motion3.json',
        },
        expressions: ['expressions/neutral.exp3.json'],
        eyeBlinkParameters: ['ParamEyeLOpen', 'ParamEyeROpen'],
        lipSyncParameters: ['ParamMouthOpenY'],
      },
    })
  })

  it.each([
    ['EyeBlink', 'avatar_eye_blink_group_missing'],
    ['LipSync', 'avatar_lip_sync_group_missing'],
  ] as const)('rejects a missing %s parameter group', (name, reason) => {
    const input = model3()
    input.Groups = (input.Groups as Record<string, unknown>[]).filter((group) => group.Name !== name)

    expect(validateCubismModelBundle({ model3: input, files: requiredFiles })).toEqual({ ok: false, reason })
  })

  it('rejects a missing required state motion', () => {
    const input = model3()
    delete ((input.FileReferences as Record<string, unknown>).Motions as Record<string, unknown>).Speaking

    expect(validateCubismModelBundle({ model3: input, files: requiredFiles })).toEqual({
      ok: false,
      reason: 'avatar_motion_group_missing',
    })
  })

  it('rejects a missing referenced artifact without exposing its path', () => {
    const files = new Set(requiredFiles)
    files.delete('mirror.moc3')

    expect(validateCubismModelBundle({ model3: model3(), files })).toEqual({
      ok: false,
      reason: 'avatar_asset_missing',
    })
  })

  it('rejects an escaping asset path', () => {
    const input = model3()
    ;(input.FileReferences as Record<string, unknown>).Moc = '../outside.moc3'

    expect(validateCubismModelBundle({ model3: input, files: requiredFiles })).toEqual({
      ok: false,
      reason: 'avatar_asset_path_invalid',
    })
  })

  it('rejects a malformed model document', () => {
    expect(validateCubismModelBundle({ model3: null, files: requiredFiles })).toEqual({
      ok: false,
      reason: 'avatar_model_manifest_invalid',
    })
  })
})
