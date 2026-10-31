import source from '../../resources/config/prompts/dance-floor.v1.json' with { type: 'json' }
/** The DJ welcome is a fixed line (owner directive 2026-10-31), spoken verbatim before the music. */
export function danceWelcomeLine(language: 'zh-TW' | 'en'): string {
  const line = source.welcomeLine[language]
  if (!line?.trim()) throw new Error('invalid_dance_floor_config')
  return line
}
