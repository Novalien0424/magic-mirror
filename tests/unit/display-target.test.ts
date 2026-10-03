import { describe, expect, it } from 'vitest'
import {
  chooseMirrorDisplay,
  parseMirrorDisplayMatch,
  planInitialPlacement,
  planRehome,
  type DisplayInfo,
  type MirrorPlacement
} from '../../src/main/display-target'

// The field rig: an ASUS operator monitor as macOS main, the portrait mirror on HDMI.
const asus: DisplayInfo = {
  id: 1,
  label: 'MB16NCG',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  primary: true
}
const mirror: DisplayInfo = {
  id: 7,
  label: 'T749-fHD720',
  bounds: { x: 1920, y: 0, width: 1080, height: 1920 },
  primary: false
}

describe('parseMirrorDisplayMatch', () => {
  it('treats unset, empty and whitespace-only values as "no target configured"', () => {
    expect(parseMirrorDisplayMatch(undefined)).toBeUndefined()
    expect(parseMirrorDisplayMatch('')).toBeUndefined()
    expect(parseMirrorDisplayMatch('   ')).toBeUndefined()
  })

  it('trims a configured value', () => {
    expect(parseMirrorDisplayMatch('  T749 ')).toBe('T749')
  })
})

describe('chooseMirrorDisplay', () => {
  it('picks the display whose label contains the match even when it is not primary', () => {
    expect(chooseMirrorDisplay([asus, mirror], 'T749')).toEqual({ display: mirror, reason: 'match' })
  })

  it('matches case-insensitively', () => {
    expect(chooseMirrorDisplay([asus, mirror], 't749-fhd')).toEqual({ display: mirror, reason: 'match' })
  })

  it('returns the primary display when no match is configured', () => {
    expect(chooseMirrorDisplay([mirror, asus], undefined)).toEqual({ display: asus, reason: 'primary_default' })
    expect(chooseMirrorDisplay([mirror, asus], '')).toEqual({ display: asus, reason: 'primary_default' })
  })

  it('falls back to primary with reason no_match when no label matches (never undefined)', () => {
    expect(chooseMirrorDisplay([asus], 'T749')).toEqual({ display: asus, reason: 'no_match' })
  })

  it('returns a null display with a reason when there are no displays at all', () => {
    expect(chooseMirrorDisplay([], 'T749')).toEqual({ display: null, reason: 'no_displays' })
    expect(chooseMirrorDisplay([], undefined)).toEqual({ display: null, reason: 'no_displays' })
  })

  it('picks deterministically (lowest id) when several labels match, regardless of input order', () => {
    const twinA: DisplayInfo = { ...mirror, id: 12, label: 'T749-fHD720 (2)' }
    const twinB: DisplayInfo = { ...mirror, id: 9 }

    expect(chooseMirrorDisplay([asus, twinA, twinB], 'T749')).toEqual({ display: twinB, reason: 'match' })
    expect(chooseMirrorDisplay([twinB, asus, twinA], 'T749')).toEqual({ display: twinB, reason: 'match' })
  })

  it('still returns a display when none is flagged primary (lowest id stands in)', () => {
    const a: DisplayInfo = { ...asus, id: 4, primary: false }
    const b: DisplayInfo = { ...mirror, id: 3, primary: false }

    expect(chooseMirrorDisplay([a, b], undefined)).toEqual({ display: b, reason: 'primary_default' })
    expect(chooseMirrorDisplay([a, b], 'nothing-matches')).toEqual({ display: b, reason: 'no_match' })
  })
})

describe('planInitialPlacement', () => {
  it('reports a matched target as SELECTED with reason match and shows it', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', null)

    expect(plan.action).toBe('show')
    expect(plan.display).toEqual(mirror)
    expect(plan.placement).toEqual({ kind: 'placed', displayId: 7, bounds: mirror.bounds, onTarget: true })
    expect(plan.marker).toEqual({
      name: 'MIRROR_DISPLAY_SELECTED',
      fields: { display_id: 7, label: 'T749-fHD720', reason: 'match' }
    })
  })

  it('reports the unconfigured default as SELECTED with reason primary_default', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([asus, mirror], undefined), undefined, null)

    expect(plan.action).toBe('show')
    expect(plan.display).toEqual(asus)
    expect(plan.marker).toEqual({
      name: 'MIRROR_DISPLAY_SELECTED',
      fields: { display_id: 1, label: 'MB16NCG', reason: 'primary_default' }
    })
  })

  it('at first boot, shows a configured-but-missing target on primary as a FALLBACK with reason no_match', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([asus], 'T749'), 'T749', null)

    expect(plan.action).toBe('show')
    expect(plan.display).toEqual(asus)
    expect(plan.placement).toEqual({ kind: 'placed', displayId: 1, bounds: asus.bounds, onTarget: false })
    expect(plan.marker).toEqual({
      name: 'MIRROR_DISPLAY_FALLBACK',
      fields: { reason: 'no_match', match: 'T749', fallback_display_id: 1 }
    })
  })

  it('keeps the default placement (no display, no placement) and says why when there are no displays', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([], 'T749'), 'T749', null)

    expect(plan.action).toBe('show')
    expect(plan.display).toBeNull()
    expect(plan.placement).toBeNull()
    expect(plan.marker).toEqual({
      name: 'MIRROR_DISPLAY_FALLBACK',
      fields: { reason: 'no_displays', match: 'T749', fallback_display_id: 'none' }
    })
  })

  it('keeps a recreated window hidden when the target was hidden-awaiting and is still missing', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([asus], 'T749'), 'T749', { kind: 'hidden_awaiting_target' })

    expect(plan.action).toBe('hide')
    expect(plan.display).toBeNull()
    expect(plan.placement).toEqual({ kind: 'hidden_awaiting_target' })
    expect(plan.marker).toEqual({
      name: 'MIRROR_DISPLAY_UNCHANGED',
      fields: { reason: 'awaiting_target', trigger: 'window_recreated', match: 'T749' }
    })
  })

  it('keeps a recreated window hidden when it was on the target and the target is now gone (even with no displays)', () => {
    const wasOnTarget: MirrorPlacement = { kind: 'placed', displayId: 7, bounds: mirror.bounds, onTarget: true }

    expect(planInitialPlacement(chooseMirrorDisplay([asus], 'T749'), 'T749', wasOnTarget).action).toBe('hide')
    expect(planInitialPlacement(chooseMirrorDisplay([], 'T749'), 'T749', wasOnTarget).action).toBe('hide')
  })

  it('shows a recreated window on the target when the target is present', () => {
    const plan = planInitialPlacement(chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', {
      kind: 'hidden_awaiting_target'
    })

    expect(plan.action).toBe('show')
    expect(plan.display).toEqual(mirror)
    expect(plan.marker.name).toBe('MIRROR_DISPLAY_SELECTED')
  })

  it('a recreated window that was on the startup no_match fallback stays on the visible fallback', () => {
    const onFallback: MirrorPlacement = { kind: 'placed', displayId: 1, bounds: asus.bounds, onTarget: false }
    const plan = planInitialPlacement(chooseMirrorDisplay([asus], 'T749'), 'T749', onFallback)

    expect(plan.action).toBe('show')
    expect(plan.marker.fields['reason']).toBe('no_match')
  })
})

describe('planRehome', () => {
  const onMirror: MirrorPlacement = { kind: 'placed', displayId: 7, bounds: mirror.bounds, onTarget: true }
  const onAsusFallback: MirrorPlacement = { kind: 'placed', displayId: 1, bounds: asus.bounds, onTarget: false }
  const hidden: MirrorPlacement = { kind: 'hidden_awaiting_target' }

  it('is a no-op when the window is already on the target with unchanged bounds', () => {
    const decision = planRehome(onMirror, chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', 'display-metrics-changed')

    expect(decision.action).toBe('none')
    expect(decision.marker).toEqual({
      name: 'MIRROR_DISPLAY_UNCHANGED',
      fields: { reason: 'already_placed', trigger: 'display-metrics-changed', display_id: 7 }
    })
  })

  it('hides (never moves onto the operator display) with reason target_removed when the target disappears', () => {
    const decision = planRehome(onMirror, chooseMirrorDisplay([asus], 'T749'), 'T749', 'display-removed')

    expect(decision).toEqual({
      action: 'hide',
      placement: hidden,
      marker: {
        name: 'MIRROR_DISPLAY_FALLBACK',
        fields: { reason: 'target_removed', match: 'T749', action: 'hidden_until_return' }
      }
    })
  })

  it('hides with reason target_removed when every display is gone while on the target', () => {
    const decision = planRehome(onMirror, chooseMirrorDisplay([], 'T749'), 'T749', 'display-removed')

    expect(decision.action).toBe('hide')
    expect(decision.marker.fields['reason']).toBe('target_removed')
  })

  it('is a no-op (awaiting_target) while hidden and the target is still absent — no repeated hide', () => {
    const decision = planRehome(hidden, chooseMirrorDisplay([asus], 'T749'), 'T749', 'display-metrics-changed')

    expect(decision).toEqual({
      action: 'none',
      marker: {
        name: 'MIRROR_DISPLAY_UNCHANGED',
        fields: { reason: 'awaiting_target', trigger: 'display-metrics-changed', match: 'T749' }
      }
    })
    expect(planRehome(hidden, chooseMirrorDisplay([], 'T749'), 'T749', 'display-removed').action).toBe('none')
  })

  it('moves back and shows with reason target_returned when the target reappears while hidden', () => {
    const decision = planRehome(hidden, chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', 'display-added')

    expect(decision).toEqual({
      action: 'move_and_show',
      display: mirror,
      placement: onMirror,
      marker: { name: 'MIRROR_DISPLAY_REHOMED', fields: { display_id: 7, label: 'T749-fHD720', reason: 'target_returned' } }
    })
  })

  it('moves onto the target with reason target_returned when it appears after a startup no_match fallback', () => {
    const decision = planRehome(onAsusFallback, chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', 'display-added')

    expect(decision).toEqual({
      action: 'move',
      display: mirror,
      placement: onMirror,
      marker: { name: 'MIRROR_DISPLAY_REHOMED', fields: { display_id: 7, label: 'T749-fHD720', reason: 'target_returned' } }
    })
  })

  it('re-fits when the target is still present but its bounds changed (rotation applied after replug)', () => {
    const landscapeFirst: MirrorPlacement = {
      kind: 'placed',
      displayId: 7,
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      onTarget: true
    }
    const decision = planRehome(landscapeFirst, chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', 'display-metrics-changed')

    expect(decision.action).toBe('move')
    expect(decision.marker).toEqual({
      name: 'MIRROR_DISPLAY_REHOMED',
      fields: { display_id: 7, label: 'T749-fHD720', reason: 'target_metrics_changed' }
    })
  })

  it('is a no-op while still on the same startup fallback and the target is still absent', () => {
    const decision = planRehome(onAsusFallback, chooseMirrorDisplay([asus], 'T749'), 'T749', 'display-metrics-changed')

    expect(decision.action).toBe('none')
    expect(decision.marker.name).toBe('MIRROR_DISPLAY_UNCHANGED')
  })

  it('places the window when it never had a placement (booted with no displays)', () => {
    const decision = planRehome(null, chooseMirrorDisplay([asus, mirror], 'T749'), 'T749', 'display-added')

    expect(decision.action).toBe('move')
    expect(decision.marker).toEqual({
      name: 'MIRROR_DISPLAY_REHOMED',
      fields: { display_id: 7, label: 'T749-fHD720', reason: 'target_returned' }
    })
  })

  it('keeps a never-on-target window where it is and says why when every display is gone', () => {
    const decision = planRehome(onAsusFallback, chooseMirrorDisplay([], 'T749'), 'T749', 'display-removed')

    expect(decision).toEqual({
      action: 'none',
      marker: {
        name: 'MIRROR_DISPLAY_FALLBACK',
        fields: { reason: 'no_displays', match: 'T749', fallback_display_id: 'none' }
      }
    })
  })
})
