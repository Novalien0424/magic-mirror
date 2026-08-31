import { describe, expect, it } from 'vitest'
import { sceneCollectionsSchema, type SceneCollections } from '../../../src/main/scenes/scene-config'

function validCollections(): SceneCollections {
  return {
    visualAssets: [
      {
        id: 'visual-portrait',
        name: 'Portrait',
        kind: 'image',
        fileName: 'visual-portrait.png',
        mimeType: 'image/png',
        byteLength: 2048,
        sha256: 'b'.repeat(64),
        width: 1080,
        height: 1920,
        orientation: 'portrait',
        audioTrack: 'absent',
        windowsDecode: 'passed',
      },
      {
        id: 'visual-ceremony',
        name: 'Ceremony',
        kind: 'video',
        fileName: 'visual-ceremony.webm',
        mimeType: 'video/webm',
        byteLength: 4096,
        sha256: 'c'.repeat(64),
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        durationMs: 5000,
        audioTrack: 'unknown',
        windowsDecode: 'passed',
      },
    ],
    musicAssets: [
      {
        id: 'music-bells',
        name: 'Bells',
        fileName: 'music-bells.mp3',
        mimeType: 'audio/mpeg',
        byteLength: 1024,
        sha256: 'a'.repeat(64),
      },
    ],
    sceneActions: [
      {
        id: 'visual-show',
        name: 'Show portrait',
        enabled: true,
        kind: 'visual',
        assetId: 'visual-portrait',
        fit: 'contain',
        playback: 'still',
        audio: 'muted',
        gain: 0,
      },
      {
        id: 'dialogue-begin',
        name: 'Opening words',
        enabled: true,
        kind: 'avatar_dialogue',
        text: 'The spell is awake.',
      },
      {
        id: 'motion-scene',
        name: 'Scene motion',
        enabled: true,
        kind: 'avatar_motion',
        motionGroup: 'Scene',
      },
      {
        id: 'fog-on',
        name: 'Fog on',
        enabled: true,
        kind: 'fog',
        command: 'on',
        presetId: 'fog-soft',
      },
      {
        id: 'music-play',
        name: 'Play bells',
        enabled: true,
        kind: 'music',
        command: 'play',
        assetId: 'music-bells',
        gain: 0.7,
        loop: false,
      },
    ],
    scenes: [
      {
        id: 'scene-awaken',
        name: 'Awaken',
        enabled: true,
        stages: [
          {
            id: 'stage-open',
            name: 'Open',
            endCondition: { kind: 'duration', durationMs: 1200 },
            actionIds: ['visual-show', 'dialogue-begin', 'motion-scene', 'fog-on', 'music-play'],
          },
        ],
      },
    ],
    spells: [
      {
        id: 'spell-awaken',
        name: 'Awaken spell',
        phrase: 'Magic mirror awaken',
        sceneId: 'scene-awaken',
        enabled: true,
        cooldownMs: 5000,
      },
    ],
  }
}

describe('sceneCollectionsSchema', () => {
  it('accepts the closed Phase 4 spell, action, stage, and scene model', () => {
    expect(sceneCollectionsSchema.safeParse(validCollections()).success).toBe(true)
  })

  it.each([
    {
      label: 'missing action link',
      mutate(value: ReturnType<typeof validCollections>) {
        value.scenes[0].stages[0].actionIds = ['missing-action']
      },
      path: 'scenes.0.stages.0.actionIds.0',
    },
    {
      label: 'missing scene link',
      mutate(value: ReturnType<typeof validCollections>) {
        value.spells[0].sceneId = 'missing-scene'
      },
      path: 'spells.0.sceneId',
    },
    {
      label: 'missing music asset',
      mutate(value: ReturnType<typeof validCollections>) {
        const action = value.sceneActions[4]
        if (action.kind === 'music' && action.command === 'play') action.assetId = 'missing-music'
      },
      path: 'sceneActions.4.assetId',
    },
    {
      label: 'zero stage duration',
      mutate(value: ReturnType<typeof validCollections>) {
        value.scenes[0].stages[0].endCondition = { kind: 'duration', durationMs: 0 }
      },
      path: 'scenes.0.stages.0.endCondition.durationMs',
    },
  ])('rejects $label with a field-addressable issue', ({ mutate, path }) => {
    const value = validCollections()
    mutate(value)

    const parsed = sceneCollectionsSchema.safeParse(value)

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toContain(path)
    }
  })

  it('rejects normalized phrase collisions', () => {
    const value = validCollections()
    value.spells.push({
      ...value.spells[0],
      id: 'spell-collision',
      name: 'Collision',
      phrase: 'Ｍａｇｉｃ　ｍｉｒｒｏｒ　ａｗａｋｅｎ！',
    })

    const parsed = sceneCollectionsSchema.safeParse(value)

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain('normalized_spell_collision')
    }
  })

  it('rejects unsupported device parameters instead of accepting passthrough data', () => {
    const value = validCollections()
    value.sceneActions[3] = {
      ...value.sceneActions[3],
      // Deliberately prove arbitrary transport fields do not cross the approved preset boundary.
      dmxChannel: 512,
    } as never

    expect(sceneCollectionsSchema.safeParse(value).success).toBe(false)
  })

  it('rejects motion and expression names absent from the active Ren Cubism manifest', () => {
    const motion = validCollections()
    motion.sceneActions[2] = { ...motion.sceneActions[2], motionGroup: 'Unknown' } as never
    expect(sceneCollectionsSchema.safeParse(motion).success).toBe(false)

    const expression = validCollections()
    expression.sceneActions.push({
      id: 'bad-expression', name: 'Bad expression', enabled: true,
      kind: 'avatar_expression', expression: 'exp_99',
    } as never)
    expect(sceneCollectionsSchema.safeParse(expression).success).toBe(false)
  })

  it.each([
    ['image duration', 'image', 'still', { kind: 'duration', durationMs: 1000 }, true],
    ['image until stopped', 'image', 'still', { kind: 'until_stopped', maxRuntimeMs: 5000 }, true],
    ['image video completion', 'image', 'still', { kind: 'video_complete', visualActionId: 'visual-show' }, false],
    ['once video duration', 'video', 'once', { kind: 'duration', durationMs: 1000 }, true],
    ['once video completion', 'video', 'once', { kind: 'video_complete', visualActionId: 'visual-show' }, true],
    ['once video until stopped', 'video', 'once', { kind: 'until_stopped', maxRuntimeMs: 5000 }, false],
    ['loop video duration', 'video', 'loop', { kind: 'duration', durationMs: 1000 }, true],
    ['loop video completion', 'video', 'loop', { kind: 'video_complete', visualActionId: 'visual-show' }, false],
    ['loop video until stopped', 'video', 'loop', { kind: 'until_stopped', maxRuntimeMs: 5000 }, true],
  ] as const)('enforces the end-condition matrix for %s', (_label, assetKind, playback, endCondition, success) => {
    const value = validCollections()
    const action = value.sceneActions[0]
    if (action.kind !== 'visual') throw new Error('visual fixture missing')
    action.assetId = assetKind === 'image' ? 'visual-portrait' : 'visual-ceremony'
    action.playback = playback
    action.audio = 'muted'
    action.gain = 0
    value.scenes[0].stages[0].endCondition = endCondition

    expect(sceneCollectionsSchema.safeParse(value).success).toBe(success)
  })

  it('allows uncertain embedded audio but rejects a definitively absent track', () => {
    const uncertain = validCollections()
    if (uncertain.sceneActions[0].kind !== 'visual') throw new Error('visual fixture missing')
    uncertain.sceneActions[0] = {
      ...uncertain.sceneActions[0],
      assetId: 'visual-ceremony',
      playback: 'once',
      audio: 'embedded',
      gain: 0.8,
    }
    expect(sceneCollectionsSchema.safeParse(uncertain).success).toBe(true)

    const absent = validCollections()
    if (absent.sceneActions[0].kind !== 'visual') throw new Error('visual fixture missing')
    absent.sceneActions[0] = {
      ...absent.sceneActions[0],
      audio: 'embedded',
      gain: 0.8,
    }
    expect(sceneCollectionsSchema.safeParse(absent).success).toBe(false)
  })

  it('rejects ambiguous visual ownership and unbounded stage placement', () => {
    const duplicateAction = validCollections()
    duplicateAction.scenes[0].stages[0].actionIds.push('visual-show')
    expect(sceneCollectionsSchema.safeParse(duplicateAction).success).toBe(false)

    const twoVisuals = validCollections()
    twoVisuals.sceneActions.push({
      ...twoVisuals.sceneActions[0],
      id: 'visual-show-two',
      name: 'Second visual',
    })
    twoVisuals.scenes[0].stages[0].actionIds.push('visual-show-two')
    expect(sceneCollectionsSchema.safeParse(twoVisuals).success).toBe(false)

    const nonFinalUntilStopped = validCollections()
    nonFinalUntilStopped.scenes[0].stages[0].endCondition = {
      kind: 'until_stopped',
      maxRuntimeMs: 5000,
    }
    nonFinalUntilStopped.scenes[0].stages.push({
      id: 'stage-after',
      name: 'After',
      endCondition: { kind: 'duration', durationMs: 1000 },
      actionIds: ['dialogue-begin'],
    })
    expect(sceneCollectionsSchema.safeParse(nonFinalUntilStopped).success).toBe(false)
  })
})
