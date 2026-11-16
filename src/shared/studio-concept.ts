/** A visual brief, not a psychological assessment. Main retains it in RAM only. */
export interface StudioConcept { readonly subject: string; readonly interpretation: string; readonly composition: string; readonly mood: string }
export const STUDIO_CONCEPT_KEYS = ['subject', 'interpretation', 'composition', 'mood'] as const
export function parseStudioConcept(value: unknown): StudioConcept | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== STUDIO_CONCEPT_KEYS.length || !STUDIO_CONCEPT_KEYS.every(key => typeof record[key] === 'string' && record[key].trim().length > 0 && record[key].length <= 600 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(record[key]))) return null
  return Object.fromEntries(STUDIO_CONCEPT_KEYS.map(key => [key, (record[key] as string).trim()])) as unknown as StudioConcept
}
/** Synthetic example for previews/tests; never a default production fallback. */
export const SAMPLE_STUDIO_CONCEPT: StudioConcept = Object.freeze({ subject: 'A migratory heron with a sheltering wing silhouette', interpretation: 'The natural tension between movement and shelter becomes one poised fantasy bird.', composition: 'One complete elegant figure, wings partly unfurled, isolated with breathing room.', mood: 'Quiet resolve with a sense of possibility.' })
