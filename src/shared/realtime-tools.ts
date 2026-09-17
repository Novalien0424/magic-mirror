import source from '../../resources/config/prompts/realtime-tools.v1.json'
import type { fromJSONSchema } from 'zod'

type ParameterSchema = Exclude<Parameters<typeof fromJSONSchema>[0], boolean>

export const REALTIME_TOOL_SOURCE = 'resources/config/prompts/realtime-tools.v1.json'
export type ToolOutcome = 'accepted' | 'ignored' | 'rejected' | 'failed'
export interface ToolResult { readonly status: ToolOutcome; readonly code: string; readonly speech: 'application' | 'none' }
export interface RealtimeToolSpec {
  readonly name: string
  readonly handler: string
  readonly enabled: boolean
  readonly availability: 'conversation'
  readonly routing: 'model_intent'
  readonly description: string
  readonly parameters: ParameterSchema & { type: 'object'; properties: Record<string, ParameterSchema>; required: string[]; additionalProperties: false }
  readonly rules: { useWhen: string; avoidWhen: string; speech: string }
  readonly completion: 'background'
  readonly results: Readonly<Record<ToolOutcome, ToolResult>>
}
export interface RealtimeToolCatalog { readonly version: string; readonly tools: readonly RealtimeToolSpec[] }

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value) }
  return value
}
function validTemplate(value: unknown): value is string {
  return text(value) && [...value.matchAll(/\{\{(\w+)\}\}/g)].every(match => match[1] === 'sleepPhrase')
}

/** Deliberate schema subset: reject unsupported keywords instead of silently losing validation. */
function validSchema(value: unknown): boolean {
  if (!record(value) || !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(value.type as string)) return false
  const allowed = ['type', 'description', ...(value.type === 'object' ? ['properties', 'required', 'additionalProperties'] : value.type === 'array' ? ['items'] : ['enum'])]
  if (Object.keys(value).some(key => !allowed.includes(key)) || ('description' in value && !text(value.description))) return false
  if (value.type === 'object') return record(value.properties) && value.additionalProperties === false
    && Array.isArray(value.required) && value.required.length === Object.keys(value.properties).length
    && new Set(value.required).size === value.required.length
    && value.required.every(key => typeof key === 'string' && Object.hasOwn(value.properties as object, key))
    && Object.values(value.properties).every(validSchema)
  if (value.type === 'array') return validSchema(value.items)
  return !('enum' in value) || (Array.isArray(value.enum) && value.enum.length > 0 && value.enum.every(item =>
    value.type === 'null' ? item === null : value.type === 'integer' ? Number.isInteger(item) : typeof item === value.type))
}

/** Dependency-free: this module also reaches sandboxed preload imports. */
export function parseRealtimeToolCatalog(value: unknown): RealtimeToolCatalog {
  const invalid = (): never => { throw new Error('invalid_realtime_tool_catalog') }
  if (!record(value) || !keys(value, ['version', 'tools']) || !text(value.version) || !Array.isArray(value.tools)) return invalid()
  const names = new Set<string>()
  for (const spec of value.tools) {
    if (!record(spec) || !keys(spec, ['name', 'handler', 'enabled', 'availability', 'routing', 'description', 'parameters', 'rules', 'completion', 'results'])
      || !text(spec.name) || !/^[a-z][a-z0-9_]{0,63}$/.test(spec.name) || names.has(spec.name)
      || !text(spec.handler) || typeof spec.enabled !== 'boolean' || spec.availability !== 'conversation'
      || spec.routing !== 'model_intent' || spec.completion !== 'background' || !validTemplate(spec.description)) return invalid()
    names.add(spec.name)
    const parameters = spec.parameters, rules = spec.rules, results = spec.results
    if (!record(parameters) || parameters.type !== 'object' || !validSchema(parameters)
      || !record(rules) || !keys(rules, ['useWhen', 'avoidWhen', 'speech']) || !Object.values(rules).every(validTemplate)
      || !record(results) || !keys(results, ['accepted', 'ignored', 'rejected', 'failed'])) return invalid()
    for (const [status, result] of Object.entries(results)) {
      if (!record(result) || !keys(result, ['status', 'code', 'speech']) || result.status !== status
        || !text(result.code) || !/^[a-z][a-z0-9_]{0,79}$/.test(result.code)
        || !['application', 'none'].includes(result.speech as string)) return invalid()
    }
  }
  return freeze(structuredClone(value)) as unknown as RealtimeToolCatalog
}

export const REALTIME_TOOLS = parseRealtimeToolCatalog(source)

/** Templates are rendered once; inserted operator values are never reinterpreted. */
export function resolveRealtimeTools(sleepPhrase: string, preview = false, catalog = REALTIME_TOOLS): readonly RealtimeToolSpec[] {
  if (preview) return []
  const render = (value: string) => value.replace(/\{\{sleepPhrase\}\}/g, () => JSON.stringify(sleepPhrase))
  return catalog.tools.filter(spec => spec.enabled).map(spec => freeze({ ...spec, description: render(spec.description),
    rules: { useWhen: render(spec.rules.useWhen), avoidWhen: render(spec.rules.avoidWhen), speech: render(spec.rules.speech) } }))
}

export function realtimeToolDefinition(spec: RealtimeToolSpec) {
  return { type: 'function' as const, name: spec.name, description: spec.description, parameters: spec.parameters }
}

export function realtimeToolInstructions(specs: readonly RealtimeToolSpec[]): string {
  return specs.map(spec => [spec.rules.useWhen, spec.rules.speech, spec.rules.avoidWhen].map(rule => `- ${rule}`).join('\n')).join('\n')
}
