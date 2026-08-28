import { describe, expect, it } from 'vitest'

import {
  renExpressionForState,
  resolveAvatarModelSource,
} from '../../../src/renderer/avatar/avatar-model-source'

describe('resolveAvatarModelSource', () => {
  it('selects Ren as the development avatar', () => {
    expect(resolveAvatarModelSource()).toEqual({
      assetBaseUrl: '/avatar/Ren/',
      manifestUrl: '/avatar/Ren/Ren.model3.json',
    })
  })

  it('normalizes an explicitly supplied Cubism model URL', () => {
    expect(resolveAvatarModelSource({
      assetBaseUrl: '/avatar/Custom',
      manifestFileName: 'persona.model3.json',
    })).toEqual({
      assetBaseUrl: '/avatar/Custom/',
      manifestUrl: '/avatar/Custom/persona.model3.json',
    })
  })

  it('maps lifecycle states onto Ren expressions and clears the offline loop', () => {
    expect([
      renExpressionForState('Dormant'),
      renExpressionForState('Waking'),
      renExpressionForState('Listening'),
      renExpressionForState('Thinking'),
      renExpressionForState('Speaking'),
      renExpressionForState('Scene'),
      renExpressionForState('Suspending'),
      renExpressionForState('OfflineLoop'),
    ]).toEqual([
      'exp_03',
      'exp_01',
      'exp_01',
      'exp_05',
      'exp_01',
      'exp_02',
      'exp_03',
      null,
    ])
  })
})
