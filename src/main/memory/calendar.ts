const VENUE_OFFSET_MS = 8 * 60 * 60 * 1000
export interface MemoryEventDate { day: string; instant?: number }

/** A calendar date has no fabricated midnight instant; timestamps require an explicit offset. */
export function memoryEventDate(value: string): MemoryEventDate | undefined {
  const day = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  const midnight = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return undefined
  if (value === day) return { day }
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return undefined
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? { day, instant } : undefined
}

/** Current venue observation time (Asia/Taipei), independent of the host's timezone. */
export function venueObservedAt(instant = new Date()): string {
  return new Date(instant.getTime() + VENUE_OFFSET_MS).toISOString().replace(/Z$/, '+08:00')
}

/** Preserve an event's stated local day; UTC instants are observed in the venue zone. */
export function eventCalendarDay(value: string, date: MemoryEventDate): string {
  return date.instant !== undefined && /(?:Z|[+-]00:00)$/.test(value) ? venueObservedAt(new Date(date.instant)).slice(0, 10) : date.day
}

/** Order known instants chronologically, calendar-only days by day, without assigning them a time. */
export function compareEventDatesDescending(left: string, right: string): number {
  const a = memoryEventDate(left), b = memoryEventDate(right)
  const day = (date?: MemoryEventDate) => date?.instant === undefined ? date?.day ?? '' : venueObservedAt(new Date(date.instant)).slice(0, 10)
  return day(b).localeCompare(day(a)) || (b?.instant ?? -Infinity) - (a?.instant ?? -Infinity) || 0
}
