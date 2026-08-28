export interface DisplayCandidate {
  readonly id: number
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

const TARGET_ASPECT = 9 / 16

export function selectPortraitDisplay<T extends DisplayCandidate>(
  displays: readonly T[],
  primaryDisplayId: number,
): T | null {
  if (displays.length === 0) return null

  const portrait = displays
    .filter(({ bounds }) => bounds.height > bounds.width)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.bounds.width / left.bounds.height - TARGET_ASPECT)
      const rightDistance = Math.abs(right.bounds.width / right.bounds.height - TARGET_ASPECT)
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return right.bounds.width * right.bounds.height - left.bounds.width * left.bounds.height
    })

  return portrait[0]
    ?? displays.find(({ id }) => id === primaryDisplayId)
    ?? displays[0]
    ?? null
}
