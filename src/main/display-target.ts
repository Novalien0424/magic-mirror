/**
 * Which display the Mirror window lives on.
 *
 * The venue mirror is a portrait HDMI panel; during on-site work an operator monitor is
 * also attached and stays the macOS main display. `MIRROR_DISPLAY` (a case-insensitive
 * substring of Electron's `Display.label`) pins the Mirror to the panel without touching
 * the operator's screen. When the panel drops out (its Android board rebooting unplugs
 * HDMI) the Mirror is HIDDEN, not moved: the only other display on site is the operator's
 * monitor, which a fullscreen always-on-top Mirror would cover, and in production there is
 * no other display at all. The guest-facing glass has no signal either way, so this is not
 * a black-screen regression (invariant #10); the renderer keeps running and the window is
 * moved back and shown once the panel returns. At first boot a configured-but-missing
 * target waits hidden, so login never covers the operator's display. Every fallback and
 * no-op carries a reason (invariant #9).
 *
 * Electron-free on purpose: the policy is unit-testable without a running app. Markers
 * carry display ids, labels and reasons only.
 */

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DisplayInfo {
  readonly id: number
  readonly label: string
  readonly bounds: Rect
  readonly primary: boolean
}

export type MirrorDisplayChoice =
  | { readonly display: DisplayInfo; readonly reason: 'match' | 'primary_default' | 'no_match' }
  | { readonly display: null; readonly reason: 'no_displays' }

/** Where the Mirror window was last placed by us, or that we hid it for a missing target. */
export type MirrorPlacement =
  | {
      readonly kind: 'placed'
      readonly displayId: number
      readonly bounds: Rect
      /** True only when it sits on the configured `MIRROR_DISPLAY` target. */
      readonly onTarget: boolean
    }
  | { readonly kind: 'hidden_awaiting_target' }

export interface DisplayMarker {
  readonly name: 'MIRROR_DISPLAY_SELECTED' | 'MIRROR_DISPLAY_FALLBACK' | 'MIRROR_DISPLAY_REHOMED' | 'MIRROR_DISPLAY_UNCHANGED'
  readonly fields: Readonly<Record<string, string | number>>
}

export interface InitialPlacementPlan {
  /** 'hide' = the configured target is missing: wait without showing the window. */
  readonly action: 'show' | 'hide'
  /** Null = leave the window at its default placement. */
  readonly display: DisplayInfo | null
  readonly placement: MirrorPlacement | null
  readonly marker: DisplayMarker
}

export type RehomeDecision =
  | { readonly action: 'none'; readonly marker: DisplayMarker }
  | { readonly action: 'hide'; readonly placement: MirrorPlacement; readonly marker: DisplayMarker }
  | {
      /** 'move_and_show' = it was hidden by us for a missing target and must be shown again. */
      readonly action: 'move' | 'move_and_show'
      readonly display: DisplayInfo
      readonly placement: MirrorPlacement
      readonly marker: DisplayMarker
    }

export type DisplayTrigger = 'display-added' | 'display-removed' | 'display-metrics-changed'

/** Unset, empty or whitespace-only means "no target configured". */
export function parseMirrorDisplayMatch(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

function byId(a: DisplayInfo, b: DisplayInfo): number {
  return a.id - b.id
}

/** Never throws, never returns undefined; a null display only when there is no display. */
export function chooseMirrorDisplay(displays: readonly DisplayInfo[], match: string | undefined): MirrorDisplayChoice {
  const sorted = [...displays].sort(byId)
  // No display flagged primary should not happen, but the lowest id keeps it deterministic.
  const primary = sorted.find((d) => d.primary) ?? sorted[0]
  if (primary === undefined) return { display: null, reason: 'no_displays' }

  const needle = match?.trim().toLowerCase() ?? ''
  if (needle === '') return { display: primary, reason: 'primary_default' }

  const hit = sorted.find((d) => d.label.toLowerCase().includes(needle))
  if (hit !== undefined) return { display: hit, reason: 'match' }
  return { display: primary, reason: 'no_match' }
}

const HIDDEN: MirrorPlacement = { kind: 'hidden_awaiting_target' }

function placementFor(display: DisplayInfo, onTarget: boolean): MirrorPlacement {
  return { kind: 'placed', displayId: display.id, bounds: display.bounds, onTarget }
}

function awaitingMarker(trigger: string, match: string | undefined): DisplayMarker {
  return { name: 'MIRROR_DISPLAY_UNCHANGED', fields: { reason: 'awaiting_target', trigger, match: match ?? 'none' } }
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function fallbackMarker(reason: string, match: string | undefined, fallbackId: number | 'none'): DisplayMarker {
  return {
    name: 'MIRROR_DISPLAY_FALLBACK',
    fields: { reason, match: match ?? 'none', fallback_display_id: fallbackId }
  }
}

/**
 * Placement when a Mirror window is about to be shown: first boot (`previous` null) or a
 * window recreated after a renderer crash (`previous` = the last placement).
 */
export function planInitialPlacement(
  choice: MirrorDisplayChoice,
  match: string | undefined,
  previous: MirrorPlacement | null
): InitialPlacementPlan {
  // A missing configured target stays hidden at startup and on window recreation.
  if (match !== undefined && choice.reason !== 'match') {
    return {
      action: 'hide',
      display: null,
      placement: HIDDEN,
      marker: awaitingMarker(previous === null ? 'startup' : 'window_recreated', match)
    }
  }

  if (choice.display === null) {
    return { action: 'show', display: null, placement: null, marker: fallbackMarker(choice.reason, match, 'none') }
  }

  const { display, reason } = choice
  if (reason === 'no_match') {
    return {
      action: 'show',
      display,
      placement: placementFor(display, false),
      marker: fallbackMarker('no_match', match, display.id)
    }
  }

  return {
    action: 'show',
    display,
    placement: placementFor(display, reason === 'match'),
    marker: { name: 'MIRROR_DISPLAY_SELECTED', fields: { display_id: display.id, label: display.label, reason } }
  }
}

/** Re-placement after a display topology change. */
export function planRehome(
  previous: MirrorPlacement | null,
  choice: MirrorDisplayChoice,
  match: string | undefined,
  trigger: DisplayTrigger
): RehomeDecision {
  const onTarget = choice.reason === 'match'

  if (previous?.kind === 'hidden_awaiting_target') {
    if (!onTarget || choice.display === null) return { action: 'none', marker: awaitingMarker(trigger, match) }
    return {
      action: 'move_and_show',
      display: choice.display,
      placement: placementFor(choice.display, true),
      marker: rehomedMarker(choice.display, 'target_returned')
    }
  }

  // The panel went away under us: hide rather than cover the operator's display.
  if (!onTarget && previous?.onTarget === true) {
    return {
      action: 'hide',
      placement: HIDDEN,
      marker: {
        name: 'MIRROR_DISPLAY_FALLBACK',
        fields: { reason: 'target_removed', match: match ?? 'none', action: 'hidden_until_return' }
      }
    }
  }

  // Nothing to move onto: keep the window wherever macOS left it.
  if (choice.display === null) return { action: 'none', marker: fallbackMarker(choice.reason, match, 'none') }

  const { display } = choice
  if (
    previous !== null &&
    previous.displayId === display.id &&
    previous.onTarget === onTarget &&
    sameRect(previous.bounds, display.bounds)
  ) {
    return {
      action: 'none',
      marker: { name: 'MIRROR_DISPLAY_UNCHANGED', fields: { reason: 'already_placed', trigger, display_id: display.id } }
    }
  }

  const next = placementFor(display, onTarget)
  if (onTarget) {
    const reason = previous?.onTarget === true && previous.displayId === display.id ? 'target_metrics_changed' : 'target_returned'
    return { action: 'move', display, placement: next, marker: rehomedMarker(display, reason) }
  }

  // Fallback placements follow the primary display.
  return { action: 'move', display, placement: next, marker: fallbackMarker(choice.reason, match, display.id) }
}

function rehomedMarker(display: DisplayInfo, reason: 'target_returned' | 'target_metrics_changed'): DisplayMarker {
  return { name: 'MIRROR_DISPLAY_REHOMED', fields: { display_id: display.id, label: display.label, reason } }
}
