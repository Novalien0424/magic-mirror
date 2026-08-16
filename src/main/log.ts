/**
 * Phase 0 boot markers. Telemetry (Task 4) replaces this as the durable event path;
 * until then these stdout lines are what the smoke contract and demo runner read.
 *
 * Metadata only — never transcripts, audio, prompts, memory values or credentials
 * (invariant #1). Values are normalised so `key=value` stays parseable.
 */

export type MarkerFields = Readonly<Record<string, string | number | boolean>>

const MAX_VALUE_LENGTH = 200

export function sanitizeMarkerValue(value: string | number | boolean): string {
  const text = String(value).replace(/\s+/g, '_')
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
}

export function formatMarker(name: string, fields: MarkerFields = {}): string {
  const pairs = Object.entries(fields).map(([key, value]) => `${key}=${sanitizeMarkerValue(value)}`)
  return pairs.length === 0 ? `${name}\n` : `${name} ${pairs.join(' ')}\n`
}

export function marker(name: string, fields: MarkerFields = {}): void {
  process.stdout.write(formatMarker(name, fields))
}
