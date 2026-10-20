import source from '../../resources/config/prompts/memory-helpers.v1.json' with { type: 'json' }

export const MEMORY_PROMPT_SOURCE = 'resources/config/prompts/memory-helpers.v1.json'

/** Versioned instructions for Main's memory helpers (extraction and intent), shown read-only in the Console. */
export interface MemoryPrompts {
  readonly version: string
  readonly extractor: string
  readonly intent: { readonly instructions: string; readonly tasks: Readonly<Record<'confirmation' | 'request' | 'introduction', string>> }
}
function validate(value: typeof source): MemoryPrompts {
  const texts = [value.version, value.extractor, value.intent.instructions, ...Object.values(value.intent.tasks)]
  const tasks = Object.keys(value.intent.tasks).sort().join(',')
  if (texts.some(text => typeof text !== 'string' || !text.trim()) || tasks !== 'confirmation,introduction,request') throw new Error('invalid_memory_prompt_catalog')
  return Object.freeze({ ...value, intent: Object.freeze({ ...value.intent, tasks: Object.freeze({ ...value.intent.tasks }) }) })
}
export const MEMORY_PROMPTS: MemoryPrompts = validate(source)
