import { parseMediaSkill, type AvatarMediaResource } from './media-skill'

export interface MediaDiscoveryRequest { query: string; kind: 'all' | 'music' | 'video' }
export interface MediaDiscoveryReply {
  status: 'accepted' | 'rejected' | 'failed'
  code: string
  resources: AvatarMediaResource[]
  total: number
}

const MAX_RESULTS = 20
const MAX_RESOURCES = 512 // The current public media catalog's bound.
const CONTROLS = /[\p{Cc}\p{Cf}]/u

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

/** Dependency-free validation for IPC and sandboxed preload imports. Empty queries list public resources. */
export function parseMediaDiscoveryRequest(value: unknown): MediaDiscoveryRequest | null {
  if (!record(value) || !keys(value, ['query', 'kind']) || typeof value.query !== 'string'
    || value.query.length > 200 || CONTROLS.test(value.query)
    || (value.kind !== 'all' && value.kind !== 'music' && value.kind !== 'video')) return null
  return { query: value.query, kind: value.kind }
}

function parseResources(value: unknown, max: number): AvatarMediaResource[] | null {
  if (!Array.isArray(value) || value.length > max
    || !value.every(resource => record(resource) && keys(resource, ['kind', 'assetId', 'name', 'aliases']))) return null
  const resources = value.map(resource => ({ kind: resource.kind, assetId: resource.assetId, name: resource.name,
    aliases: Array.isArray(resource.aliases) ? [...resource.aliases] : resource.aliases }))
  const skill = parseMediaSkill({ enabled: true, fadeMs: 0, gain: 0, resources })
  if (!skill || skill.resources.some(resource => CONTROLS.test(resource.name)
    || resource.aliases.some(alias => CONTROLS.test(alias)))) return null
  return skill.resources.map(resource => ({ kind: resource.kind, assetId: resource.assetId,
    name: resource.name, aliases: [...resource.aliases] }))
}

/** Replies carry bounded public metadata and reason codes, never queries, paths or profile identifiers. */
export function parseMediaDiscoveryReply(value: unknown): MediaDiscoveryReply | null {
  if (!record(value) || !keys(value, ['status', 'code', 'resources', 'total'])
    || (value.status !== 'accepted' && value.status !== 'rejected' && value.status !== 'failed')
    || typeof value.code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/u.test(value.code)
    || typeof value.total !== 'number' || !Number.isInteger(value.total) || value.total < 0
    || value.total > MAX_RESOURCES) return null
  const resources = parseResources(value.resources, MAX_RESULTS)
  if (!resources || resources.length > value.total
    || (value.status !== 'accepted' && (value.total !== 0 || resources.length !== 0))) return null
  return { status: value.status, code: value.code, resources, total: value.total }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim()
}
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }

/** Match literal public clues only; punctuation/spacing differences also work for unsegmented CJK titles. */
function labelScore(label: string, query: string, compactQuery: string, clues: string[]): number {
  const normalized = normalize(label), compact = normalized.replace(/ /g, '')
  if (normalized === query || compact === compactQuery) return 4
  if (normalized.includes(query) || compact.includes(compactQuery)) return 3
  return clues.every(clue => normalized.includes(clue) || compact.includes(clue)) ? 2 : 0
}

/** Pure discovery: retain ambiguous candidates and never select a resource or dispatch playback. */
export function rankMediaResources(resources: readonly AvatarMediaResource[], request: MediaDiscoveryRequest): MediaDiscoveryReply {
  const parsedRequest = parseMediaDiscoveryRequest(request)
  if (!parsedRequest) return { status: 'rejected', code: 'media_discovery_invalid_request', resources: [], total: 0 }
  if (!Array.isArray(resources) || resources.length > MAX_RESOURCES) {
    return { status: 'failed', code: 'media_discovery_invalid_resources', resources: [], total: 0 }
  }
  // Project enriched local entries before validating, so only the public DTO can leave this helper.
  const publicResources = parseResources(resources.map(resource => record(resource)
    ? { kind: resource.kind, assetId: resource.assetId, name: resource.name,
      aliases: Array.isArray(resource.aliases) ? [...resource.aliases] : resource.aliases } : null), MAX_RESOURCES)
  if (!publicResources) return { status: 'failed', code: 'media_discovery_invalid_resources', resources: [], total: 0 }

  const listing = !parsedRequest.query.trim()
  const query = normalize(parsedRequest.query), compactQuery = query.replace(/ /g, ''), clues = query.split(' ')
  const ranked = publicResources.filter(resource => parsedRequest.kind === 'all' || resource.kind === parsedRequest.kind)
    .map(resource => {
      let score = 0
      if (!listing && query) {
        const nameScore = labelScore(resource.name, query, compactQuery, clues)
        score = nameScore ? nameScore * 2 + 1 : 0
        for (const alias of resource.aliases) score = Math.max(score, labelScore(alias, query, compactQuery, clues) * 2)
      }
      return { resource, score, name: normalize(resource.name) }
    })
    .filter(candidate => listing || candidate.score > 0)
    .sort((a, b) => b.score - a.score || compare(a.name, b.name)
      || compare(a.resource.kind, b.resource.kind) || compare(a.resource.assetId, b.resource.assetId))
  const total = ranked.length
  return { status: 'accepted', code: total > MAX_RESULTS ? 'media_discovery_truncated'
    : listing ? 'media_discovery_listed' : total ? 'media_discovery_matches' : 'media_discovery_no_match',
  resources: ranked.slice(0, MAX_RESULTS).map(candidate => candidate.resource), total }
}
