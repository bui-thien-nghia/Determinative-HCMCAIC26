import type { CollectionSchema, FilterValues, SearchResult } from '../store'

export interface BackendRangeFilter {
  from?: number
  to?: number
}

export interface BackendSearchFilters {
  frame_id?: BackendRangeFilter
  frame_order?: BackendRangeFilter
  time_order?: BackendRangeFilter
  video_id?: string
  transcript?: string
}

export interface SearchFilterRequest {
  filters: BackendSearchFilters
  activeFilterCount: number
  backendFilterCount: number
  errors: string[]
  label: string
  hasBackendFilters: boolean
}

const integerPattern = /^\d+$/
const rangeFilterBaseFields = new Set(['frame_id', 'frame_order', 'time_order', 'timestamp'])
const rangeFilterKeys = new Set([
  'frame_id_from',
  'frame_id_to',
  'frame_order_from',
  'frame_order_to',
  'time_order_from',
  'time_order_to',
  'timestamp_from',
  'timestamp_to',
])

function normalizeFilterText(value: string) {
  return value.trim()
}

function normalizeComparableText(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function rangeAliases(field: 'frame_id' | 'frame_order' | 'time_order') {
  return field === 'time_order' ? ['time_order', 'timestamp'] : [field]
}

function firstRangeValue(filterValues: FilterValues, aliases: string[], suffix: 'from' | 'to') {
  for (const alias of aliases) {
    const value = normalizeFilterText(filterValues[`${alias}_${suffix}`] || '')
    if (value) return value
  }
  return ''
}

export function getRangeFilter(filterValues: FilterValues, field: 'frame_id' | 'frame_order' | 'time_order') {
  const aliases = rangeAliases(field)
  const from = firstRangeValue(filterValues, aliases, 'from')
  const to = firstRangeValue(filterValues, aliases, 'to')
  const legacyExact = aliases
    .map((alias) => normalizeFilterText(filterValues[alias] || ''))
    .find(Boolean) || ''

  if (!from && !to && legacyExact) {
    return { from: legacyExact, to: legacyExact }
  }

  return { from, to }
}

export function isRangeFilterKey(field: string) {
  return rangeFilterBaseFields.has(field) || rangeFilterKeys.has(field)
}

function parseRangeEndpoint(value: string, kind: 'integer' | 'number') {
  const normalized = normalizeFilterText(value)
  if (!normalized) return { value: null, invalid: false }
  if (kind === 'integer') {
    return integerPattern.test(normalized)
      ? { value: Number(normalized), invalid: false }
      : { value: null, invalid: true }
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric)
    ? { value: numeric, invalid: false }
    : { value: null, invalid: true }
}

export function getParsedRangeFilter(
  filterValues: FilterValues,
  field: 'frame_id' | 'frame_order' | 'time_order',
  kind: 'integer' | 'number',
) {
  const range = getRangeFilter(filterValues, field)
  const active = Boolean(range.from || range.to)
  const from = parseRangeEndpoint(range.from, kind)
  const to = parseRangeEndpoint(range.to, kind)
  let error: string | null = null

  if (from.invalid || to.invalid) {
    error = kind === 'integer' ? 'Use integers only.' : 'Use a valid number.'
  } else if (from.value != null && to.value != null && from.value > to.value) {
    error = 'From must be less than or equal to To.'
  }

  return {
    active,
    from: from.value,
    to: to.value,
    error,
  }
}

export function getRangeFilterValidationError(
  filterValues: FilterValues,
  field: 'frame_id' | 'frame_order' | 'time_order',
) {
  const kind = field === 'time_order' ? 'number' : 'integer'
  return getParsedRangeFilter(filterValues, field, kind).error
}

export function getFilterValidationErrors(filterValues: FilterValues) {
  const errors: string[] = []
  const frameIdError = getRangeFilterValidationError(filterValues, 'frame_id')
  const frameOrderError = getRangeFilterValidationError(filterValues, 'frame_order')
  const timeOrderError = getRangeFilterValidationError(filterValues, 'time_order')

  if (frameIdError) errors.push(`Frame Id: ${frameIdError}`)
  if (frameOrderError) errors.push(`Frame Order: ${frameOrderError}`)
  if (timeOrderError) errors.push(`Time Order: ${timeOrderError}`)

  return errors
}

export function getActiveResultFilters(filterValues: FilterValues) {
  const activeFilters: Array<readonly [string, string]> = []

  for (const field of ['frame_id', 'frame_order', 'time_order'] as const) {
    const range = getRangeFilter(filterValues, field)
    if (range.from || range.to) {
      activeFilters.push([field, `${range.from || '*'}..${range.to || '*'}`] as const)
    }
  }

  Object.entries(filterValues)
    .map(([field, value]) => [field, normalizeFilterText(value)] as const)
    .filter(([field, value]) => !isRangeFilterKey(field) && value.length > 0)
    .forEach((filter) => activeFilters.push(filter))

  return activeFilters
}

function addRangeFilter(
  filters: BackendSearchFilters,
  labelParts: string[],
  filterValues: FilterValues,
  field: 'frame_id' | 'frame_order' | 'time_order',
  label: string,
) {
  const kind = field === 'time_order' ? 'number' : 'integer'
  const range = getParsedRangeFilter(filterValues, field, kind)
  if (!range.active || range.error) return 0

  filters[field] = {
    ...(range.from != null ? { from: range.from } : {}),
    ...(range.to != null ? { to: range.to } : {}),
  }
  labelParts.push(`${label} ${range.from ?? '*'}-${range.to ?? '*'}`)
  return 1
}

export function buildSearchFilterRequest(
  filterValues: FilterValues,
  collectionSchema: CollectionSchema,
): SearchFilterRequest {
  const filters: BackendSearchFilters = {}
  const labelParts: string[] = []
  let backendFilterCount = 0

  backendFilterCount += addRangeFilter(filters, labelParts, filterValues, 'frame_id', 'Frame Id')
  backendFilterCount += addRangeFilter(filters, labelParts, filterValues, 'frame_order', 'Frame Order')
  backendFilterCount += addRangeFilter(filters, labelParts, filterValues, 'time_order', 'Time Order')

  const videoId = normalizeFilterText(filterValues.video_id || filterValues.vid_id || '')
  if (videoId) {
    filters.video_id = videoId
    labelParts.push(videoId)
    backendFilterCount += 1
  }

  const transcriptField = collectionSchema.transcript ? 'transcript' : collectionSchema.caption ? 'caption' : null
  const transcript = transcriptField ? normalizeFilterText(filterValues[transcriptField] || '') : ''
  if (transcript && transcriptField === 'transcript') {
    filters.transcript = transcript
    labelParts.push('Transcript')
    backendFilterCount += 1
  }

  const activeFilterCount = getActiveResultFilters(filterValues).length

  return {
    filters,
    activeFilterCount,
    backendFilterCount,
    errors: getFilterValidationErrors(filterValues),
    label: labelParts.join(' · '),
    hasBackendFilters: backendFilterCount > 0,
  }
}

export function getFilteredSearchResults(searchResults: SearchResult[]) {
  return searchResults
}

export function getSearchResultFilterSummary(searchResults: SearchResult[], filterValues: FilterValues) {
  return {
    results: getFilteredSearchResults(searchResults),
    activeFilterCount: getActiveResultFilters(filterValues).length,
    invalidFilters: getFilterValidationErrors(filterValues),
  }
}

export function describeSearchQuery(query: string, request: SearchFilterRequest) {
  const trimmedQuery = normalizeComparableText(query)
  if (trimmedQuery && request.hasBackendFilters) return `${trimmedQuery} · filtered`
  if (trimmedQuery) return trimmedQuery
  return request.label ? `Filter · ${request.label}` : 'Filter'
}
