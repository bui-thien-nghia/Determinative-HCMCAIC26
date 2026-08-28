import { create } from 'zustand'
import { api, DatasetConfigRequestError, type DatasetConfigResponse, type DatasetConfigStatus } from './api'
import { setMediaUrlVersion } from './utils/media'
import {
  DEFAULT_QUERY_NAME,
  DEFAULT_TEAM_QUERY_COUNT,
  MAX_SUBMISSION_ROWS,
  MAX_TRAKE_EVENT_COUNT,
  TEAM_SUBMISSION_VERSION,
  createEmptySubmissionPackage,
  filenameForPackageQuery,
  getActivePackageQuery,
  getSubmissionFrame,
  getSubmissionKey,
  getSubmissionVideoId,
  packageQueryId,
  packageQueryContainsFrame,
  type CandidateSource,
  type PackageQuery,
  type QueryCandidate,
  type QueryCandidatePatch,
  type SubmissionPackageFile,
  type SubmissionQueryType,
  type TeamSubmissionPackage,
  type TrakeCandidate,
} from './utils/submission'

export interface SearchResult {
  id: string
  score: number
  rank?: number
  image_path?: string
  video_id?: string
  timestamp?: number | null
  payload: {
    video_path?: string
    video_id: string
    frame_id: string | number
    img_link?: string
    timestamp?: number | null
    caption?: string
    transcript?: string | null
    time_order?: number | null
    frame_order?: number | null
    fps?: number | null
    youtube_link?: string | null
    score?: number
    [key: string]: unknown
  }
}

export interface SchemaField {
  data_type: string
  is_indexed: boolean
}

export type CollectionSchema = Record<string, SchemaField>
export type FilterValues = Record<string, string>
export type MetadataVisibility = Record<string, boolean>

export interface RecheckItem {
  id: string
  img_link: string
  payload: SearchResult['payload']
  addedAt: number
  answerType: 'KIS' | 'QA' | 'TRAKE'
  answer?: string
}

export interface TrakeEvent {
  id: string
  order: number
  label: string
  description?: string
  frameOrder?: string
  sourceVideoId?: string
  selectedCandidate?: RecheckItem
}

export interface TrakeState {
  selectedVideoId: string | null
  stage: 1 | 2
  activeEventId: string | null
  events: TrakeEvent[]
}

export interface SearchHistoryItem {
  query: string
  mode: string
  language: string
  top_k: number
  collection: string | null
  model_id: string | null
  results: SearchResult[]
  timestamp: number
}

export interface Toast {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
}

export type AddResultToActivePackageQueryOptions = {
  quiet?: boolean
  answer?: string
  frameOrderOverride?: number | null
  confirmCreateTrakeSequence?: (currentVideoId: string, nextVideoId: string) => boolean
}

export interface SearchStatus {
  state: 'idle' | 'searching' | 'success' | 'error'
  latency: number | null
}

export interface SearchResultFilterSummary {
  results: SearchResult[]
  activeFilterCount: number
  invalidFilters: string[]
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

function normalizeSearchText(value: unknown) {
  return normalizeComparableText(value).toLocaleLowerCase()
}

function parseNumberFilter(value: string) {
  const normalized = normalizeFilterText(value)
  if (!normalized) return null
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function rangeAliases(field: string) {
  return field === 'time_order' ? ['time_order', 'timestamp'] : [field]
}

function firstRangeValue(filterValues: FilterValues, aliases: string[], suffix: 'from' | 'to') {
  for (const alias of aliases) {
    const value = normalizeFilterText(filterValues[`${alias}_${suffix}`] || '')
    if (value) return value
  }
  return ''
}

function getRangeFilter(filterValues: FilterValues, field: 'frame_id' | 'frame_order' | 'time_order') {
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

function isRangeFilterKey(field: string) {
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

function getParsedRangeFilter(
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
    error = 'From must be <= To.'
  }

  return {
    active,
    from: from.value,
    to: to.value,
    error,
  }
}

function matchesNumericRange(value: number | null, range: ReturnType<typeof getParsedRangeFilter>) {
  if (!range.active) return true
  if (range.error || value == null) return false
  if (range.from != null && value < range.from) return false
  if (range.to != null && value > range.to) return false
  return true
}

function canonicalVideoId(result: SearchResult) {
  return result.video_id || result.payload.video_id || ''
}

function canonicalTimeOrder(result: SearchResult) {
  if (typeof result.payload.time_order === 'number') return result.payload.time_order
  if (typeof result.payload.timestamp === 'number') return result.payload.timestamp
  if (typeof result.timestamp === 'number') return result.timestamp
  const payloadTime = parseNumberFilter(normalizeComparableText(result.payload.time_order))
  if (payloadTime != null) return payloadTime
  const payloadTimestamp = parseNumberFilter(normalizeComparableText(result.payload.timestamp))
  if (payloadTimestamp != null) return payloadTimestamp
  return null
}

function canonicalTranscript(result: SearchResult) {
  return typeof result.payload.transcript === 'string'
    ? result.payload.transcript
    : typeof result.payload.caption === 'string'
      ? result.payload.caption
      : ''
}

function numericFrameId(result: SearchResult) {
  const actual = normalizeComparableText(result.payload.frame_id)
  return integerPattern.test(actual) ? Number(actual) : null
}

function numericFrameOrder(result: SearchResult) {
  const actual = parseNumberFilter(normalizeComparableText(result.payload.frame_order))
  return actual != null && Number.isInteger(actual) ? actual : null
}

function matchesTranscript(result: SearchResult, filterValue: string) {
  const expected = normalizeSearchText(filterValue)
  if (!expected) return true
  return normalizeSearchText(canonicalTranscript(result)).includes(expected)
}

function matchesVideoId(result: SearchResult, filterValue: string) {
  const expected = normalizeSearchText(filterValue)
  if (!expected) return true
  return normalizeSearchText(canonicalVideoId(result)).includes(expected)
}

function matchesGenericPayloadField(result: SearchResult, field: string, filterValue: string) {
  const expected = normalizeSearchText(filterValue)
  if (!expected) return true
  return normalizeSearchText(result.payload[field]).includes(expected)
}

function getContinuousSearchSource(result: SearchResult) {
  const videoId = normalizeComparableText(result.payload?.video_id || result.video_id)
  const frameId = normalizeComparableText(result.payload?.frame_id)
  return {
    videoId,
    frameId,
    sourceKey: videoId && frameId ? `${videoId}:${frameId}` : '',
  }
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

export function getRangeFilterValidationError(filterValues: FilterValues, field: 'frame_id' | 'frame_order' | 'time_order') {
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

export function getFilteredSearchResults(searchResults: SearchResult[], filterValues: FilterValues) {
  const activeFilters = getActiveResultFilters(filterValues)
  if (activeFilters.length === 0) return searchResults
  const frameIdRange = getParsedRangeFilter(filterValues, 'frame_id', 'integer')
  const frameOrderRange = getParsedRangeFilter(filterValues, 'frame_order', 'integer')
  const timeOrderRange = getParsedRangeFilter(filterValues, 'time_order', 'number')
  const activeTextFilters = Object.entries(filterValues)
    .map(([field, value]) => [field, normalizeFilterText(value)] as const)
    .filter(([field, value]) => !isRangeFilterKey(field) && value.length > 0)

  return searchResults.filter((result) => {
    if (!matchesNumericRange(numericFrameId(result), frameIdRange)) return false
    if (!matchesNumericRange(numericFrameOrder(result), frameOrderRange)) return false
    if (!matchesNumericRange(canonicalTimeOrder(result), timeOrderRange)) return false

    return activeTextFilters.every(([field, value]) => {
      switch (field) {
        case 'transcript':
        case 'caption':
          return matchesTranscript(result, value)
        case 'video_id':
        case 'vid_id':
          return matchesVideoId(result, value)
        default:
          return matchesGenericPayloadField(result, field, value)
      }
    })
  })
}

export function getSearchResultFilterSummary(searchResults: SearchResult[], filterValues: FilterValues): SearchResultFilterSummary {
  const activeFilterCount = getActiveResultFilters(filterValues).length
  return {
    results: getFilteredSearchResults(searchResults, filterValues),
    activeFilterCount,
    invalidFilters: getFilterValidationErrors(filterValues),
  }
}


interface AppState {
  currentDataset: string | null
  currentModel: string | null
  availableCollections: string[]
  collectionSchema: CollectionSchema
  schemaLoading: boolean
  schemaError: string | null
  filterValues: FilterValues
  metadataVisibility: MetadataVisibility
  searchResults: SearchResult[]
  recheckList: RecheckItem[]
  trakeState: TrakeState
  searchHistory: SearchHistoryItem[]
	  toasts: Toast[]
	  searchStatus: SearchStatus
	  continuousSearchSourceKey: string | null
	  datasetRoot: string
	  datasetStatus: DatasetConfigStatus | null
	  datasetStatusMessage: string | null
	  imagesAvailable: boolean
	  videosAvailable: boolean
	  canChangeDatasetRoot: boolean
	  datasetConfigLoading: boolean
	  datasetConfigError: string | null
	  datasetConfigVersion: number
	  // Compatibility-only active workspace fields stay until the UI moves to teamSubmissionPackage.
	  submissionQueryName: string
	  submissionPackage: SubmissionPackageFile[]
	  teamSubmissionPackage: TeamSubmissionPackage

  columns: number
  topK: number
  language: string
  mode: string
  lastSearch: {
    query: string
    collection: string
    model_id: string
    top_k: number
    mode?: string
    language?: string
  } | null
  previewResult: SearchResult | null
  playingVideo: SearchResult | null

  isLoading: boolean
  error: string | null
  displayMode: 'fast' | 'full'

  setDataset: (dataset: string | null) => void
  setModel: (model: string) => void
  setAvailableCollections: (collections: string[]) => void
  setCollectionSchema: (schema: CollectionSchema) => void
  setSchemaLoading: (loading: boolean) => void
  setSchemaError: (error: string | null) => void
  setFilterValue: (field: string, value: string) => void
  clearFilterValues: () => void
  setMetadataVisibility: (field: string, visible: boolean) => void
  setSearchResults: (results: SearchResult[]) => void
  setRecheckList: (list: RecheckItem[]) => void
  addToSearchHistory: (item: SearchHistoryItem) => void
  removeSearchHistory: (index: number) => void
  clearSearchHistory: () => void

  setColumns: (cols: number) => void
  setTopK: (k: number) => void
  setLanguage: (lang: string) => void
  setMode: (mode: string) => void
  setLastSearch: (lastSearch: AppState['lastSearch']) => void
  setPreviewResult: (res: SearchResult | null) => void
  setPlayingVideo: (video: SearchResult | null) => void
  setIsLoading: (loading: boolean) => void
	  setError: (err: string | null) => void
		  setDisplayMode: (mode: 'fast' | 'full') => void
			  setSearchStatus: (status: SearchStatus) => void
			  continuousSearchFromResult: (result: SearchResult) => Promise<void>
			  loadDatasetConfig: () => Promise<void>
		  setDatasetRoot: (datasetRoot: string) => Promise<boolean>
		  chooseDatasetRoot: () => Promise<boolean>
		  setSubmissionQueryName: (name: string) => void
  addSubmissionPackageFile: (file: SubmissionPackageFile) => void
  removeSubmissionPackageFile: (filename: string) => void
  clearSubmissionPackage: () => void
  setActivePackageQuery: (queryId: string) => void
  setPackageQueryType: (queryId: string, type: SubmissionQueryType) => void
  setPackageQueryReviewed: (queryId: string, reviewed: boolean) => void
  setPackageQueryNotes: (queryId: string, notes: string) => void
  setPackageQueryExpectedEventCount: (queryId: string, expectedEventCount: number | undefined) => void
  replacePackageQueryCandidates: (queryId: string, candidates: QueryCandidate[]) => void
  addPackageQueryCandidate: (queryId: string, candidate: QueryCandidate) => void
  addPackageQueryCandidates: (queryId: string, candidates: QueryCandidate[]) => number
  updatePackageQueryCandidate: (queryId: string, candidateId: string, patch: QueryCandidatePatch) => void
  removePackageQueryCandidate: (queryId: string, candidateId: string) => void
  reorderPackageQueryCandidates: (queryId: string, fromIdx: number, toIdx: number) => void
  resetTeamSubmissionPackage: () => void

  addToRecheckList: (item: Omit<RecheckItem, 'addedAt'>) => void
  removeFromRecheckList: (id: string) => void
  clearRecheckList: () => void
  moveRecheckItem: (id: string, direction: 'up' | 'down') => void
  reorderRecheckItem: (fromIdx: number, toIdx: number) => void
  updateRecheckItemAnswer: (id: string, answer: string) => void
  
  addCandidate: (result: SearchResult, options?: { quiet?: boolean }) => void
  addResultToActivePackageQuery: (result: SearchResult, options?: AddResultToActivePackageQueryOptions) => boolean
  
  setTrakeSelectedVideo: (videoId: string | null) => void
  setTrakeStage: (stage: 1 | 2) => void
  setTrakeActiveEvent: (eventId: string | null) => void
  setTrakeEventCandidate: (eventId: string, candidate: RecheckItem | undefined) => void
  setTrakeEventFrameOrder: (eventId: string, frameOrder: string) => void
  setTrakeEventCount: (count: number) => void
  clearTrakeEvent: (eventId: string) => void
  clearAllTrakeEvents: () => void
  addTrakeEvent: () => void
  removeTrakeEvent: (eventId: string) => void
  moveTrakeEvent: (eventId: string, direction: 'up' | 'down') => void

  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

const loadHistory = (): SearchHistoryItem[] => {
  try {
    const data = localStorage.getItem('aic_history')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const SUBMISSION_STORAGE_KEY = 'aic_submission_workspace'

type LegacySubmissionState = Pick<AppState, 'mode' | 'submissionQueryName' | 'recheckList' | 'trakeState' | 'submissionPackage'>

interface PersistedSubmissionWorkspaceV2 extends LegacySubmissionState {
  version: typeof TEAM_SUBMISSION_VERSION
  teamSubmissionPackage: TeamSubmissionPackage
  legacySubmissionPackageSnapshots: SubmissionPackageFile[]
}

type LoadedSubmissionState = Partial<LegacySubmissionState> & {
  teamSubmissionPackage: TeamSubmissionPackage
  legacySubmissionPackageSnapshots: SubmissionPackageFile[]
}

const compactRecheckItem = (item: RecheckItem): RecheckItem => ({
  id: item.id,
  img_link: item.img_link,
  addedAt: item.addedAt,
  answerType: item.answerType,
  answer: item.answer || '',
  payload: {
    video_id: getSubmissionVideoId(item),
    frame_id: item.payload.frame_id,
    frame_order: item.payload.frame_order,
    time_order: item.payload.time_order,
    timestamp: item.payload.timestamp,
    fps: item.payload.fps,
    score: item.payload.score,
    img_link: item.payload.img_link,
  },
})

const compactTrakeState = (trakeState: TrakeState): TrakeState => ({
  ...trakeState,
  events: trakeState.events.map((event) => ({
    ...event,
    frameOrder: event.frameOrder || '',
    sourceVideoId: event.sourceVideoId,
    selectedCandidate: event.selectedCandidate ? compactRecheckItem(event.selectedCandidate) : undefined,
  })),
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSubmissionQueryType(value: unknown): value is SubmissionQueryType {
  return value === 'KIS' || value === 'QA' || value === 'TRAKE'
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizeVideoId(value: unknown) {
  return safeString(value).trim().replace(/\.mp4$/i, '')
}

function safeIntegerOrEmpty(value: unknown): number | '' {
  if (value === '') return ''
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) ? numeric : ''
}

function safeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function safeSubmissionPackageFiles(value: unknown): SubmissionPackageFile[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isPlainObject)
    .map((file) => ({
      filename: safeString(file.filename),
      queryName: safeString(file.queryName),
      queryType: isSubmissionQueryType(file.queryType) ? file.queryType : 'KIS',
      csv: safeString(file.csv),
      rows: Number.isFinite(Number(file.rows)) ? Number(file.rows) : 0,
      savedAt: Number.isFinite(Number(file.savedAt)) ? Number(file.savedAt) : 0,
    }))
    .filter((file) => file.filename && file.csv)
}

function safeRecheckItems(value: unknown): RecheckItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => (
      isPlainObject(item) && isPlainObject(item.payload)
    ))
    .map((item) => {
      const payload = item.payload as Record<string, unknown>
      const answerType = isSubmissionQueryType(item.answerType) ? item.answerType : 'KIS'
      const videoId = normalizeVideoId(payload.video_id)
      const frameId = typeof payload.frame_id === 'string' || typeof payload.frame_id === 'number'
        ? payload.frame_id
        : ''
      return {
        id: safeString(item.id) || `${answerType.toLowerCase()}-${videoId || 'missing-video'}-${safeString(payload.frame_order) || safeString(payload.frame_id) || 'empty'}`,
        img_link: safeString(item.img_link) || safeString(payload.img_link),
        addedAt: Number.isFinite(Number(item.addedAt)) ? Number(item.addedAt) : 0,
        answerType,
        answer: safeString(item.answer),
        payload: {
          ...payload,
          video_id: videoId,
          frame_id: frameId,
          frame_order: payload.frame_order as number | null | undefined,
          time_order: payload.time_order as number | null | undefined,
          timestamp: payload.timestamp as number | null | undefined,
          fps: payload.fps as number | null | undefined,
          score: payload.score as number | undefined,
          img_link: safeString(payload.img_link),
        },
      }
    })
}

function safeTrakeState(value: unknown): TrakeState | undefined {
  if (!isPlainObject(value)) return undefined
  const events = Array.isArray(value.events)
    ? value.events
        .filter(isPlainObject)
        .map((event, index): TrakeEvent => {
          const selectedCandidate = safeRecheckItems([event.selectedCandidate])[0]
          return {
            id: safeString(event.id) || `evt-${index}`,
            order: Number.isInteger(Number(event.order)) ? Number(event.order) : index + 1,
            label: safeString(event.label) || `Event ${index + 1}`,
            description: safeString(event.description) || undefined,
            frameOrder: safeString(event.frameOrder),
            sourceVideoId: normalizeVideoId(event.sourceVideoId) || undefined,
            selectedCandidate,
          }
        })
    : []

  return {
    selectedVideoId: normalizeVideoId(value.selectedVideoId) || null,
    stage: value.stage === 2 ? 2 : 1,
    activeEventId: safeString(value.activeEventId) || null,
    events,
  }
}

function sourceFromRecheckItem(item: RecheckItem): CandidateSource | undefined {
  const timestamp = typeof item.payload.time_order === 'number'
    ? item.payload.time_order
    : typeof item.payload.timestamp === 'number'
      ? item.payload.timestamp
      : null
  const score = safeOptionalNumber(item.payload.score)
  const source: CandidateSource = {
    resultId: item.id,
    imgLink: item.img_link || item.payload.img_link,
    frameId: item.payload.frame_id,
    timestamp,
    score,
  }

  return Object.values(source).some((value) => value !== undefined && value !== null && value !== '')
    ? source
    : undefined
}

function sourceFromCandidate(value: unknown): CandidateSource | undefined {
  if (!isPlainObject(value)) return undefined
  const source: CandidateSource = {
    resultId: safeString(value.resultId) || undefined,
    imgLink: safeString(value.imgLink) || undefined,
    frameId: typeof value.frameId === 'string' || typeof value.frameId === 'number' ? value.frameId : undefined,
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : null,
    score: safeOptionalNumber(value.score),
  }

  return Object.values(source).some((item) => item !== undefined && item !== null && item !== '')
    ? source
    : undefined
}

function sourceFromSearchResult(result: SearchResult): CandidateSource | undefined {
  const timestamp = typeof result.payload.time_order === 'number'
    ? result.payload.time_order
    : typeof result.payload.timestamp === 'number'
      ? result.payload.timestamp
      : typeof result.timestamp === 'number'
        ? result.timestamp
        : null
  const score = safeOptionalNumber(result.payload.score ?? result.score)
  const source: CandidateSource = {
    resultId: result.id,
    imgLink: result.payload.img_link || result.image_path,
    frameId: result.payload.frame_id,
    timestamp,
    score,
  }

  return Object.values(source).some((value) => value !== undefined && value !== null && value !== '')
    ? source
    : undefined
}

function packageCandidateId(type: SubmissionQueryType, videoId: string, frameOrder: number) {
  const random = Math.random().toString(36).slice(2, 9)
  return `pkg-${type.toLowerCase()}-${videoId}-${frameOrder}-${Date.now()}-${random}`
}

function getAddFrameOrder(result: SearchResult, options?: AddResultToActivePackageQueryOptions) {
  if (Object.prototype.hasOwnProperty.call(options || {}, 'frameOrderOverride')) {
    const numeric = options?.frameOrderOverride
    return Number.isInteger(numeric) ? numeric as number : null
  }

  return getSubmissionFrame(result)
}

function legacyQueryMeta(value: unknown, mode: unknown): { queryNumber: number; type: SubmissionQueryType } {
  const match = safeString(value).match(/(?:^|[^a-z0-9])query-(\d+)-(kis|qa|trake)(?:$|[^a-z0-9])/i)
  const queryNumber = match ? Math.max(1, Math.min(DEFAULT_TEAM_QUERY_COUNT, Number(match[1]))) : 1
  const suffixType = match?.[2]?.toLowerCase()
  const type = suffixType === 'qa'
    ? 'QA'
    : suffixType === 'trake'
      ? 'TRAKE'
      : suffixType === 'kis'
        ? 'KIS'
        : isSubmissionQueryType(mode)
          ? mode
          : 'KIS'

  return { queryNumber, type }
}

function recheckItemToPackageCandidate(item: RecheckItem, type: 'KIS' | 'QA', index: number): QueryCandidate | null {
  const videoId = getSubmissionVideoId(item)
  const frameOrder = getSubmissionFrame(item)
  if (!videoId || frameOrder == null) return null

  const base = {
    id: item.id || `${type.toLowerCase()}-${videoId}-${frameOrder}-${index}`,
    videoId,
    frameOrder,
    source: sourceFromRecheckItem(item),
  }

  if (type === 'QA') {
    return {
      ...base,
      type: 'QA',
      answer: item.answer || '',
    }
  }

  return {
    ...base,
    type: 'KIS',
  }
}

function trakeStateToPackageCandidate(trakeState: TrakeState | undefined): TrakeCandidate | null {
  if (!trakeState) return null
  const videoId = normalizeVideoId(trakeState.selectedVideoId)
  const events = Array.isArray(trakeState.events) ? trakeState.events : []
  const frameOrders = events.map((event) => safeIntegerOrEmpty(event.frameOrder))

  if (!videoId && frameOrders.every((frameOrder) => frameOrder === '')) return null

  const firstSelected = events.find((event) => event.selectedCandidate)?.selectedCandidate
  return {
    id: `trake-${videoId || 'missing-video'}-${frameOrders.join('-') || 'empty'}`,
    type: 'TRAKE',
    videoId,
    frameOrders,
    expectedEventCount: frameOrders.length || undefined,
    source: firstSelected ? sourceFromRecheckItem(firstSelected) : undefined,
  }
}

function migrateLegacySubmissionState(raw: Record<string, unknown>): LoadedSubmissionState {
  const emptyPackage = createEmptySubmissionPackage(DEFAULT_TEAM_QUERY_COUNT)
  const { queryNumber, type } = legacyQueryMeta(raw.submissionQueryName, raw.mode)
  const activeQueryId = packageQueryId(queryNumber)
  const recheckList = safeRecheckItems(raw.recheckList)
  const trakeState = safeTrakeState(raw.trakeState)
  const candidates = type === 'TRAKE'
    ? [trakeStateToPackageCandidate(trakeState)].filter((candidate): candidate is TrakeCandidate => Boolean(candidate))
    : recheckList
        .map((item, index) => recheckItemToPackageCandidate(item, type, index))
        .filter((candidate): candidate is QueryCandidate => Boolean(candidate))
  const queries = emptyPackage.queries.map((query) => (
    query.queryNumber === queryNumber
      ? {
          ...query,
          type,
          candidates,
          updatedAt: candidates.length > 0 ? Date.now() : 0,
        }
      : query
  ))
  const legacySnapshots = safeSubmissionPackageFiles(raw.submissionPackage)

  return {
    mode: isSubmissionQueryType(raw.mode) ? raw.mode : type,
    submissionQueryName: safeString(raw.submissionQueryName) || DEFAULT_QUERY_NAME,
    recheckList,
    trakeState,
    submissionPackage: legacySnapshots,
    legacySubmissionPackageSnapshots: legacySnapshots,
    teamSubmissionPackage: {
      ...emptyPackage,
      activeQueryId,
      queries,
    },
  }
}

function sanitizeCandidate(candidate: unknown, expectedType: SubmissionQueryType): QueryCandidate | null {
  if (!isPlainObject(candidate) || candidate.type !== expectedType) return null
  const id = safeString(candidate.id)
  const videoId = normalizeVideoId(candidate.videoId)
  const source = sourceFromCandidate(candidate.source)

  if (expectedType === 'KIS') {
    return {
      id: id || `kis-${videoId || 'missing-video'}-${safeString(candidate.frameOrder) || 'empty'}`,
      type: 'KIS',
      videoId,
      frameOrder: safeIntegerOrEmpty(candidate.frameOrder),
      source,
    }
  }

  if (expectedType === 'QA') {
    return {
      id: id || `qa-${videoId || 'missing-video'}-${safeString(candidate.frameOrder) || 'empty'}`,
      type: 'QA',
      videoId,
      frameOrder: safeIntegerOrEmpty(candidate.frameOrder),
      answer: safeString(candidate.answer),
      source,
    }
  }

  const frameOrders = Array.isArray(candidate.frameOrders)
    ? candidate.frameOrders.map(safeIntegerOrEmpty)
    : []

  return {
    id: id || `trake-${videoId || 'missing-video'}-${frameOrders.join('-') || 'empty'}`,
    type: 'TRAKE',
    videoId,
    frameOrders,
    expectedEventCount: safeOptionalNumber(candidate.expectedEventCount),
    source,
  }
}

function sanitizePackageQuery(value: unknown, fallback: PackageQuery): PackageQuery {
  if (!isPlainObject(value)) return fallback
  const type = isSubmissionQueryType(value.type) ? value.type : fallback.type
  const candidates = Array.isArray(value.candidates)
    ? value.candidates
        .map((candidate) => sanitizeCandidate(candidate, type))
        .filter((candidate): candidate is QueryCandidate => Boolean(candidate))
    : []

  return {
    id: packageQueryId(fallback.queryNumber),
    queryNumber: fallback.queryNumber,
    type,
    candidates,
    reviewed: value.reviewed === true,
    notes: safeString(value.notes),
    expectedEventCount: safeOptionalNumber(value.expectedEventCount),
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : fallback.updatedAt,
  }
}

function sanitizeTeamSubmissionPackage(value: unknown): TeamSubmissionPackage {
  const emptyPackage = createEmptySubmissionPackage(DEFAULT_TEAM_QUERY_COUNT)
  if (!isPlainObject(value) || value.version !== TEAM_SUBMISSION_VERSION || !Array.isArray(value.queries)) {
    return emptyPackage
  }

  const incomingByNumber = new Map<number, unknown>()
  for (const query of value.queries) {
    if (!isPlainObject(query)) continue
    const queryNumber = Number(query.queryNumber)
    if (Number.isInteger(queryNumber) && queryNumber >= 1 && queryNumber <= DEFAULT_TEAM_QUERY_COUNT) {
      incomingByNumber.set(queryNumber, query)
    }
  }

  const queries = emptyPackage.queries.map((fallback) => (
    sanitizePackageQuery(incomingByNumber.get(fallback.queryNumber), fallback)
  ))
  const activeQueryId = queries.some((query) => query.id === value.activeQueryId)
    ? safeString(value.activeQueryId)
    : queries[0]?.id ?? null

  return {
    version: TEAM_SUBMISSION_VERSION,
    activeQueryId,
    queries,
  }
}

const freshLoadedSubmissionState = (): LoadedSubmissionState => ({
  teamSubmissionPackage: createEmptySubmissionPackage(DEFAULT_TEAM_QUERY_COUNT),
  legacySubmissionPackageSnapshots: [],
})

const loadSubmissionState = (): LoadedSubmissionState => {
  try {
    const data = localStorage.getItem(SUBMISSION_STORAGE_KEY)
    if (!data) return freshLoadedSubmissionState()
    const parsed = JSON.parse(data) as unknown
    if (!isPlainObject(parsed)) return freshLoadedSubmissionState()

    if (parsed.version === TEAM_SUBMISSION_VERSION) {
      const submissionPackage = safeSubmissionPackageFiles(parsed.submissionPackage)
      const legacySnapshots = safeSubmissionPackageFiles(parsed.legacySubmissionPackageSnapshots)
      return {
        mode: isSubmissionQueryType(parsed.mode) ? parsed.mode : undefined,
        submissionQueryName: safeString(parsed.submissionQueryName) || undefined,
        recheckList: safeRecheckItems(parsed.recheckList),
        trakeState: safeTrakeState(parsed.trakeState),
        submissionPackage,
        legacySubmissionPackageSnapshots: legacySnapshots.length > 0 ? legacySnapshots : submissionPackage,
        teamSubmissionPackage: sanitizeTeamSubmissionPackage(parsed.teamSubmissionPackage),
      }
    }

    if (parsed.version == null) {
      return migrateLegacySubmissionState(parsed)
    }

    return freshLoadedSubmissionState()
  } catch {
    return freshLoadedSubmissionState()
  }
}

const persistedSubmission = loadSubmissionState()
const MIN_TRAKE_EVENTS = 1
const MAX_TRAKE_EVENTS = 20

const makeTrakeEvent = (index: number): TrakeEvent => ({
  id: `evt-${Date.now()}-${index}`,
  order: index + 1,
  label: `Event ${index + 1}`,
  frameOrder: '',
})

const relabelTrakeEvents = (events: TrakeEvent[]) => (
  events.map((event, index) => ({ ...event, order: index + 1, label: `Event ${index + 1}` }))
)

const datasetConfigState = (config: DatasetConfigResponse) => {
  const version = config.version ?? 0
  setMediaUrlVersion(version)

  return {
    datasetRoot: config.datasetRoot,
    datasetStatus: config.status,
    datasetStatusMessage: config.message ?? null,
    imagesAvailable: config.imagesAvailable,
    videosAvailable: config.videosAvailable,
    canChangeDatasetRoot: config.canChangeDatasetRoot,
    datasetConfigVersion: version,
  }
}

const clampTrakeEventCount = (count: number) => {
  const normalized = Number.isFinite(count) ? Math.floor(count) : MIN_TRAKE_EVENTS
  return Math.min(MAX_TRAKE_EVENTS, Math.max(MIN_TRAKE_EVENTS, normalized))
}

const defaultTrakeEvents: TrakeEvent[] = [makeTrakeEvent(0), makeTrakeEvent(1)]
const persistedTrakeEvents = persistedSubmission.trakeState?.events?.length
  ? relabelTrakeEvents(persistedSubmission.trakeState.events)
  : defaultTrakeEvents

function updateTeamSubmissionQuery(
  teamSubmissionPackage: TeamSubmissionPackage,
  queryId: string,
  updater: (query: PackageQuery) => PackageQuery,
): TeamSubmissionPackage {
  let changed = false
  const queries = teamSubmissionPackage.queries.map((query) => {
    if (query.id !== queryId) return query
    changed = true
    return updater(query)
  })

  return changed
    ? { ...teamSubmissionPackage, queries }
    : teamSubmissionPackage
}

export const useStore = create<AppState>((set, get) => ({
  currentDataset: 'aic2026_v2',
  currentModel: 'siglip2',
  availableCollections: [],
  collectionSchema: {},
  schemaLoading: false,
  schemaError: null,
  filterValues: {},
  metadataVisibility: {},
  searchResults: [],
  recheckList: persistedSubmission.recheckList || [],
  trakeState: {
    selectedVideoId: persistedSubmission.trakeState?.selectedVideoId ?? null,
    stage: persistedSubmission.trakeState?.stage ?? 1 as const,
    activeEventId: persistedSubmission.trakeState?.activeEventId ?? null,
    events: persistedTrakeEvents
  },
  searchHistory: loadHistory(),
  toasts: [],
  searchStatus: { state: 'idle', latency: null },
  continuousSearchSourceKey: null,
  datasetRoot: '',
  datasetStatus: null,
  datasetStatusMessage: null,
  imagesAvailable: false,
  videosAvailable: false,
  canChangeDatasetRoot: false,
  datasetConfigLoading: false,
  datasetConfigError: null,
  datasetConfigVersion: 0,
  submissionQueryName: persistedSubmission.submissionQueryName || DEFAULT_QUERY_NAME,
  submissionPackage: persistedSubmission.submissionPackage || [],
  teamSubmissionPackage: persistedSubmission.teamSubmissionPackage,

  columns: 4,
  topK: 100,
  language: 'AUTO',
  mode: persistedSubmission.mode || 'KIS',
  lastSearch: null,
  previewResult: null,
  playingVideo: null,

  isLoading: false,
  error: null,
  displayMode: 'full',

  setDataset: (dataset) => set({
    currentDataset: dataset,
    collectionSchema: {},
    schemaError: null,
    filterValues: {},
    metadataVisibility: {},
  }),
  setModel: (model) => set({ currentModel: model }),
  setAvailableCollections: (collections) => set((state) => ({
    availableCollections: collections,
    currentDataset: state.currentDataset && collections.includes(state.currentDataset)
      ? state.currentDataset
      : collections[0] ?? null,
  })),
  setCollectionSchema: (schema) => set((state) => {
    const metadataVisibility: MetadataVisibility = {}
    for (const [field, descriptor] of Object.entries(schema)) {
      if (!descriptor.is_indexed) {
        metadataVisibility[field] = state.metadataVisibility[field] ?? true
      }
    }
    return { collectionSchema: schema, metadataVisibility }
  }),
  setSchemaLoading: (loading) => set({ schemaLoading: loading }),
  setSchemaError: (error) => set({ schemaError: error }),
  setFilterValue: (field, value) => set((state) => ({
    filterValues: { ...state.filterValues, [field]: value },
  })),
  clearFilterValues: () => set({ filterValues: {} }),
  setMetadataVisibility: (field, visible) => set((state) => ({
    metadataVisibility: { ...state.metadataVisibility, [field]: visible },
  })),
  setSearchResults: (results) => set({ searchResults: results }),
	  setRecheckList: (list) => set({ recheckList: list }),
	  setSearchStatus: (status) => set({ searchStatus: status }),
	  continuousSearchFromResult: async (result) => {
	    const state = get()
	    if (state.continuousSearchSourceKey) {
	      state.addToast('Visual search is already running', 'info')
	      return
	    }

	    const collection = state.currentDataset
	    const { videoId, frameId, sourceKey } = getContinuousSearchSource(result)
	    if (!collection || !videoId || !frameId) {
	      state.addToast('Cannot run visual search: source frame information is missing.', 'error')
	      return
	    }

	    const startedAt = performance.now()
	    const queryLabel = `Visual Search · ${videoId} · ${frameId}`
	    set({
	      continuousSearchSourceKey: sourceKey,
	      error: null,
	      searchStatus: { state: 'searching', latency: null },
	    })

	    try {
	      const results = await api.continuousSearch(collection, videoId, frameId)
	      const latency = (performance.now() - startedAt) / 1000
	      set({
	        searchResults: results,
	        lastSearch: {
	          query: queryLabel,
	          collection,
	          model_id: state.currentModel || 'siglip2',
	          top_k: 100,
	          mode: state.mode,
	          language: 'AUTO',
	        },
	        continuousSearchSourceKey: null,
	        searchStatus: { state: 'success', latency },
	      })
	      get().addToSearchHistory({
	        query: queryLabel,
	        mode: state.mode,
	        language: 'AUTO',
	        top_k: 100,
	        collection,
	        model_id: state.currentModel || 'siglip2',
	        results,
	        timestamp: Date.now(),
	      })
	      get().addToast(`Visual search complete: ${results.length} result(s)`, 'success')
	    } catch (error) {
	      const message = error instanceof Error ? error.message : 'Visual search failed'
	      set({
	        continuousSearchSourceKey: null,
	        error: message,
	        searchStatus: { state: 'error', latency: null },
	      })
	      get().addToast(message, 'error')
	    }
	  },
	  loadDatasetConfig: async () => {
	    set({ datasetConfigLoading: true, datasetConfigError: null })
	    try {
	      const config = await api.getDatasetConfig()
	      set({
	        ...datasetConfigState(config),
	        datasetConfigLoading: false,
	        datasetConfigError: null,
	      })
	    } catch (error) {
	      const message = error instanceof Error ? error.message : 'Dataset config lookup failed'
	      set({
	        datasetConfigLoading: false,
	        datasetConfigError: message,
	      })
	    }
	  },
		  setDatasetRoot: async (datasetRoot) => {
		    set({ datasetConfigLoading: true, datasetConfigError: null })
	    try {
	      const config = await api.setDatasetRoot(datasetRoot)
	      set((state) => ({
	        ...datasetConfigState(config),
	        datasetConfigLoading: false,
	        datasetConfigError: null,
	        searchResults: [...state.searchResults],
	        previewResult: state.previewResult ? { ...state.previewResult } : null,
	        playingVideo: state.playingVideo ? { ...state.playingVideo } : null,
	      }))
	      get().addToast('Dataset folder updated', 'success')
	      return true
	    } catch (error) {
	      const message = error instanceof DatasetConfigRequestError
	        ? error.message
	        : error instanceof Error
	          ? error.message
	          : 'Dataset folder update failed'
	      set({
	        datasetConfigLoading: false,
	        datasetConfigError: message,
	      })
	      get().addToast(message, 'error')
		      return false
		    }
		  },
		  chooseDatasetRoot: async () => {
		    set({ datasetConfigLoading: true, datasetConfigError: null })
		    try {
		      const config = await api.chooseDatasetRoot()
		      if (config.cancelled) {
		        set({
		          ...datasetConfigState(config),
		          datasetConfigLoading: false,
		          datasetConfigError: null,
		        })
		        return false
		      }

		      set((state) => ({
		        ...datasetConfigState(config),
		        datasetConfigLoading: false,
		        datasetConfigError: null,
		        searchResults: [...state.searchResults],
		        previewResult: state.previewResult ? { ...state.previewResult } : null,
		        playingVideo: state.playingVideo ? { ...state.playingVideo } : null,
		      }))
		      get().addToast('Dataset folder updated', 'success')
		      return true
		    } catch (error) {
		      const message = error instanceof DatasetConfigRequestError
		        ? error.message
		        : error instanceof Error
		          ? error.message
		          : 'Dataset folder chooser failed'
		      set({
		        datasetConfigLoading: false,
		        datasetConfigError: message,
		      })
		      get().addToast(message, 'error')
		      return false
		    }
		  },

		  addToSearchHistory: (item) => set((state) => {
    if (state.searchHistory.length > 0 && state.searchHistory[0].query === item.query && state.searchHistory[0].mode === item.mode) {
      return state
    }
    const newHistory = [item, ...state.searchHistory].slice(0, 20)
    localStorage.setItem('aic_history', JSON.stringify(newHistory))
    return { searchHistory: newHistory }
  }),

  removeSearchHistory: (index) => set((state) => {
    const newHistory = [...state.searchHistory]
    newHistory.splice(index, 1)
    localStorage.setItem('aic_history', JSON.stringify(newHistory))
    return { searchHistory: newHistory }
  }),

  clearSearchHistory: () => {
    localStorage.removeItem('aic_history')
    set({ searchHistory: [] })
  },

  setColumns: (cols) => set({ columns: cols }),
  setTopK: (k) => set({ topK: k }),
  setLanguage: (lang) => set({ language: lang }),
  setMode: (mode) => set({ mode }),
  setLastSearch: (lastSearch) => set({ lastSearch }),
  setPreviewResult: (res) => set({ previewResult: res }),
  setPlayingVideo: (video) => set({ playingVideo: video }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (err) => set({ error: err }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  setSubmissionQueryName: (submissionQueryName) => set({ submissionQueryName }),
  addSubmissionPackageFile: (file) => set((state) => ({
    submissionPackage: [
      ...state.submissionPackage.filter((existing) => existing.filename !== file.filename),
      file,
    ].sort((a, b) => a.filename.localeCompare(b.filename)),
  })),
  removeSubmissionPackageFile: (filename) => set((state) => ({
    submissionPackage: state.submissionPackage.filter((file) => file.filename !== filename),
  })),
  clearSubmissionPackage: () => set({ submissionPackage: [] }),
  setActivePackageQuery: (queryId) => set((state) => (
    state.teamSubmissionPackage.queries.some((query) => query.id === queryId)
      ? { teamSubmissionPackage: { ...state.teamSubmissionPackage, activeQueryId: queryId } }
      : state
  )),
  setPackageQueryType: (queryId, type) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => query.type === type
        ? query
        : {
            ...query,
            type,
            candidates: [],
            reviewed: false,
            expectedEventCount: type === 'TRAKE' ? query.expectedEventCount : undefined,
            updatedAt: Date.now(),
          },
    ),
  })),
  setPackageQueryReviewed: (queryId, reviewed) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => ({ ...query, reviewed, updatedAt: Date.now() }),
    ),
  })),
  setPackageQueryNotes: (queryId, notes) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => ({ ...query, notes, updatedAt: Date.now() }),
    ),
  })),
  setPackageQueryExpectedEventCount: (queryId, expectedEventCount) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => {
        if (query.type !== 'TRAKE') return query
        const normalized = typeof expectedEventCount === 'number'
          && Number.isInteger(expectedEventCount)
          && expectedEventCount >= 1
          && expectedEventCount <= MAX_TRAKE_EVENT_COUNT
          ? expectedEventCount
          : undefined
        return {
          ...query,
          expectedEventCount: normalized,
          reviewed: false,
          updatedAt: Date.now(),
        }
      },
    ),
  })),
  replacePackageQueryCandidates: (queryId, candidates) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => ({
        ...query,
        candidates: candidates
          .map((candidate) => sanitizeCandidate(candidate, query.type))
          .filter((candidate): candidate is QueryCandidate => Boolean(candidate)),
        reviewed: false,
        updatedAt: Date.now(),
      }),
    ),
  })),
  addPackageQueryCandidate: (queryId, candidate) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => {
        const sanitized = sanitizeCandidate(candidate, query.type)
        if (!sanitized) return query
        return {
          ...query,
          candidates: [...query.candidates, sanitized],
          reviewed: false,
          updatedAt: Date.now(),
        }
      },
    ),
  })),
  addPackageQueryCandidates: (queryId, candidates) => {
    let added = 0
    set((state) => ({
      teamSubmissionPackage: updateTeamSubmissionQuery(
        state.teamSubmissionPackage,
        queryId,
        (query) => {
          const sanitized = candidates
            .map((candidate) => sanitizeCandidate(candidate, query.type))
            .filter((candidate): candidate is QueryCandidate => Boolean(candidate))
          const available = Math.max(0, MAX_SUBMISSION_ROWS - query.candidates.length)
          const nextCandidates = sanitized.slice(0, available)
          added = nextCandidates.length
          if (added === 0) return query
          return {
            ...query,
            candidates: [...query.candidates, ...nextCandidates],
            reviewed: false,
            updatedAt: Date.now(),
          }
        },
      ),
    }))
    return added
  },
  updatePackageQueryCandidate: (queryId, candidateId, patch) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => {
        let changed = false
        const candidates = query.candidates.map((candidate) => {
          if (candidate.id !== candidateId) return candidate
          const sanitized = sanitizeCandidate({
            ...candidate,
            ...patch,
            id: candidate.id,
            type: candidate.type,
          }, candidate.type)
          if (!sanitized) return candidate
          changed = true
          return sanitized
        })
        return changed
          ? { ...query, candidates, reviewed: false, updatedAt: Date.now() }
          : query
      },
    ),
  })),
  removePackageQueryCandidate: (queryId, candidateId) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => {
        const candidates = query.candidates.filter((candidate) => candidate.id !== candidateId)
        return candidates.length === query.candidates.length
          ? query
          : { ...query, candidates, reviewed: false, updatedAt: Date.now() }
      },
    ),
  })),
  reorderPackageQueryCandidates: (queryId, fromIdx, toIdx) => set((state) => ({
    teamSubmissionPackage: updateTeamSubmissionQuery(
      state.teamSubmissionPackage,
      queryId,
      (query) => {
        if (fromIdx < 0 || fromIdx >= query.candidates.length) return query
        if (toIdx < 0 || toIdx >= query.candidates.length) return query
        if (fromIdx === toIdx) return query
        const candidates = [...query.candidates]
        const [moved] = candidates.splice(fromIdx, 1)
        candidates.splice(toIdx, 0, moved)
        return { ...query, candidates, reviewed: false, updatedAt: Date.now() }
      },
    ),
  })),
  resetTeamSubmissionPackage: () => set({
    teamSubmissionPackage: createEmptySubmissionPackage(DEFAULT_TEAM_QUERY_COUNT),
  }),

  addToRecheckList: (item) => set((state) => {
    if (state.recheckList.length >= 100) return state
    if (state.recheckList.some((x) => x.id === item.id)) return state
    return {
      recheckList: [...state.recheckList, { ...item, addedAt: Date.now() }]
    }
  }),

  removeFromRecheckList: (id) => set((state) => ({
    recheckList: state.recheckList.filter(item => item.id !== id)
  })),

  clearRecheckList: () => set({ recheckList: [] }),

  updateRecheckItemAnswer: (id, answer) => set((state) => ({
    recheckList: state.recheckList.map(item => item.id === id ? { ...item, answer } : item)
  })),

  moveRecheckItem: (id, direction) => set((state) => {
    const idx = state.recheckList.findIndex(item => item.id === id)
    if (idx < 0) return state
    if (direction === 'up' && idx > 0) {
      const newList = [...state.recheckList]
      ;[newList[idx - 1], newList[idx]] = [newList[idx], newList[idx - 1]]
      return { recheckList: newList }
    }
    if (direction === 'down' && idx < state.recheckList.length - 1) {
      const newList = [...state.recheckList]
      ;[newList[idx + 1], newList[idx]] = [newList[idx], newList[idx + 1]]
      return { recheckList: newList }
    }
    return state
  }),

  reorderRecheckItem: (fromIdx, toIdx) => set((state) => {
    if (fromIdx < 0 || fromIdx >= state.recheckList.length) return state
    if (toIdx < 0 || toIdx >= state.recheckList.length) return state
    if (fromIdx === toIdx) return state
    
    const newList = [...state.recheckList]
    const [moved] = newList.splice(fromIdx, 1)
    newList.splice(toIdx, 0, moved)
    
    return { recheckList: newList }
  }),

  addResultToActivePackageQuery: (result, options = {}) => {
    const state = get()
    const quiet = options.quiet === true
    const activeQuery = getActivePackageQuery(state.teamSubmissionPackage)
    if (!activeQuery) {
      if (!quiet) state.addToast('Select an active submission query first.', 'error')
      return false
    }

    const frameOrder = getAddFrameOrder(result, options)
    if (frameOrder == null) {
      if (!quiet) state.addToast('Cannot add: frame_order is missing or invalid', 'error')
      return false
    }

    const videoId = getSubmissionVideoId(result)
    if (!videoId) {
      if (!quiet) state.addToast('Cannot add: video_id is missing', 'error')
      return false
    }

    const queryName = filenameForPackageQuery(activeQuery).replace(/\.csv$/i, '')
    const source = sourceFromSearchResult(result)

    if (activeQuery.type === 'KIS' || activeQuery.type === 'QA') {
      if (activeQuery.candidates.length >= MAX_SUBMISSION_ROWS) {
        if (!quiet) state.addToast(`Maximum ${MAX_SUBMISSION_ROWS} candidates allowed for ${queryName}`, 'error')
        return false
      }

      if (packageQueryContainsFrame(activeQuery, videoId, frameOrder)) {
        if (!quiet) state.addToast('Candidate already exists in this query.', 'error')
        return false
      }

      const candidate: QueryCandidate = activeQuery.type === 'QA'
        ? {
            id: packageCandidateId('QA', videoId, frameOrder),
            type: 'QA',
            videoId,
            frameOrder,
            answer: options.answer || '',
            source,
          }
        : {
            id: packageCandidateId('KIS', videoId, frameOrder),
            type: 'KIS',
            videoId,
            frameOrder,
            source,
          }

      state.addPackageQueryCandidate(activeQuery.id, candidate)
      if (!quiet) {
        state.addToast(
          activeQuery.type === 'QA'
            ? `Added to ${queryName}. Answer required.`
            : `Added to ${queryName}`,
          'success',
        )
      }
      return true
    }

    const trakeCandidates = activeQuery.candidates.filter((candidate): candidate is TrakeCandidate => (
      candidate.type === 'TRAKE'
    ))
    const activeSequence = trakeCandidates[trakeCandidates.length - 1]
    const createSequence = () => {
      if (activeQuery.candidates.length >= MAX_SUBMISSION_ROWS) {
        if (!quiet) state.addToast(`Maximum ${MAX_SUBMISSION_ROWS} TRAKE sequences allowed for ${queryName}`, 'error')
        return false
      }
      state.addPackageQueryCandidate(activeQuery.id, {
        id: packageCandidateId('TRAKE', videoId, frameOrder),
        type: 'TRAKE',
        videoId,
        frameOrders: [frameOrder],
        source,
      })
      if (!quiet) state.addToast(`Added frame ${frameOrder} to ${queryName}`, 'success')
      return true
    }

    if (!activeSequence) {
      return createSequence()
    }

    if (activeSequence.videoId && activeSequence.videoId !== videoId) {
      const confirmed = options.confirmCreateTrakeSequence?.(activeSequence.videoId, videoId) ?? false
      if (!confirmed) return false
      return createSequence()
    }

    const filledFrameOrders = activeSequence.frameOrders.filter((value): value is number => typeof value === 'number')
    if (filledFrameOrders[filledFrameOrders.length - 1] === frameOrder) {
      if (!quiet) state.addToast('Frame already exists as the last TRAKE event.', 'error')
      return false
    }

    const nextFrameOrders = [...activeSequence.frameOrders]
    const emptyIdx = nextFrameOrders.findIndex((value) => value === '')
    if (emptyIdx >= 0) {
      nextFrameOrders[emptyIdx] = frameOrder
    } else {
      nextFrameOrders.push(frameOrder)
    }

    state.updatePackageQueryCandidate(activeQuery.id, activeSequence.id, {
      videoId,
      frameOrders: nextFrameOrders,
      source: activeSequence.source || source,
    })
    if (!quiet) state.addToast(`Added frame ${frameOrder} to ${queryName}`, 'success')
    return true
  },

  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2, 11)
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, 3000)
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  setTrakeSelectedVideo: (videoId) => set((state) => ({
    trakeState: { ...state.trakeState, selectedVideoId: videoId ? videoId.replace(/\.mp4$/i, '') : null }
  })),

  setTrakeStage: (stage) => set((state) => ({
    trakeState: { ...state.trakeState, stage }
  })),

  setTrakeActiveEvent: (eventId) => set((state) => ({
    trakeState: { ...state.trakeState, activeEventId: eventId }
  })),

  setTrakeEventCandidate: (eventId, candidate) => set((state) => {
    const newEvents = state.trakeState.events.map(evt => 
      evt.id === eventId ? {
        ...evt,
        selectedCandidate: candidate,
        frameOrder: candidate ? String(getSubmissionFrame(candidate) ?? '') : '',
        sourceVideoId: candidate ? getSubmissionVideoId(candidate) : undefined,
      } : evt
    )
    return {
      trakeState: { ...state.trakeState, events: newEvents }
    }
  }),

  setTrakeEventFrameOrder: (eventId, frameOrder) => set((state) => {
    const nextFrameOrder = frameOrder.replace(/[^\d]/g, '')
    const newEvents = state.trakeState.events.map(evt =>
      evt.id === eventId ? {
        ...evt,
        frameOrder: nextFrameOrder,
        sourceVideoId: undefined,
        selectedCandidate: undefined,
      } : evt
    )
    return {
      trakeState: { ...state.trakeState, events: newEvents }
    }
  }),

  setTrakeEventCount: (count) => set((state) => {
    const nextCount = clampTrakeEventCount(count)
    const nextEvents = Array.from({ length: nextCount }, (_, index) => (
      state.trakeState.events[index] ?? makeTrakeEvent(index)
    ))
    const events = relabelTrakeEvents(nextEvents)
    return {
      trakeState: {
        ...state.trakeState,
        activeEventId: events.some((event) => event.id === state.trakeState.activeEventId)
          ? state.trakeState.activeEventId
          : null,
        events,
      }
    }
  }),

  clearTrakeEvent: (eventId) => set((state) => {
    const newEvents = state.trakeState.events.map(evt => 
      evt.id === eventId ? { ...evt, frameOrder: '', sourceVideoId: undefined, selectedCandidate: undefined } : evt
    )
    return {
      trakeState: { ...state.trakeState, events: newEvents }
    }
  }),
  
  clearAllTrakeEvents: () => set((state) => ({
    trakeState: {
      selectedVideoId: null,
      stage: 1 as const,
      activeEventId: null,
      events: state.trakeState.events.length
        ? state.trakeState.events.map(evt => ({ ...evt, frameOrder: '', sourceVideoId: undefined, selectedCandidate: undefined }))
        : defaultTrakeEvents
    }
  })),

  addTrakeEvent: () => set((state) => {
    if (state.trakeState.events.length >= MAX_TRAKE_EVENTS) {
      state.addToast(`Maximum ${MAX_TRAKE_EVENTS} TRAKE events allowed`, 'error')
      return state
    }
    const n = state.trakeState.events.length + 1
    return {
      trakeState: {
        ...state.trakeState,
        events: relabelTrakeEvents([...state.trakeState.events, makeTrakeEvent(n - 1)])
      }
    }
  }),

  removeTrakeEvent: (eventId) => set((state) => {
    if (state.trakeState.events.length <= MIN_TRAKE_EVENTS) return state
    const newEvents = state.trakeState.events
      .filter(e => e.id !== eventId)
    if (newEvents.length < MIN_TRAKE_EVENTS) return state
    return {
      trakeState: {
        ...state.trakeState,
        activeEventId: state.trakeState.activeEventId === eventId ? null : state.trakeState.activeEventId,
        events: relabelTrakeEvents(newEvents)
      }
    }
  }),

  moveTrakeEvent: (eventId, direction) => set((state) => {
    const idx = state.trakeState.events.findIndex((event) => event.id === eventId)
    if (idx < 0) return state
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= state.trakeState.events.length) return state

    const events = [...state.trakeState.events]
    ;[events[idx], events[targetIdx]] = [events[targetIdx], events[idx]]
    const relabeled = events.map((event, index) => ({ ...event, order: index + 1, label: `Event ${index + 1}` }))

    return {
      trakeState: {
        ...state.trakeState,
        events: relabeled,
      }
    }
  }),

  addCandidate: (result, options) => set((state) => {
    const quiet = options?.quiet === true
    const mode = state.mode as SubmissionQueryType
    const frameOrder = getSubmissionFrame(result)
    if (frameOrder == null) {
      if (!quiet) state.addToast('Cannot add: frame_order is missing or invalid', 'error')
      return state
    }

    const videoId = getSubmissionVideoId(result)
    if (!videoId) {
      if (!quiet) state.addToast('Cannot add: video_id is missing', 'error')
      return state
    }

    const item = {
      id: result.id || `${videoId}_${frameOrder}_${Date.now()}`,
      img_link: result.payload?.img_link || result.image_path || '',
      payload: {
        ...result.payload,
        video_id: videoId,
      },
      answerType: mode as any,
      addedAt: Date.now(),
      answer: ''
    }

    if (mode === 'KIS' || mode === 'QA') {
      if (state.recheckList.length >= 100) {
        state.addToast('Maximum 100 candidates allowed', 'error')
        return state
      }
      const itemKey = getSubmissionKey(item)
      if (state.recheckList.some((x) => getSubmissionKey(x) === itemKey)) {
        if (!quiet) state.addToast('Candidate already added', 'error')
        return state
      }
      
      if (mode === 'QA') {
        if (!quiet) state.addToast('Added. Answer required.', 'info')
      } else {
        if (!quiet) state.addToast('Added candidate via click', 'success')
      }
      
      return {
        recheckList: [...state.recheckList, item]
      }
    } else if (mode === 'TRAKE') {
      const { selectedVideoId, activeEventId } = state.trakeState
      const newVideoId = videoId

      if (selectedVideoId && selectedVideoId !== newVideoId) {
        if (!quiet) state.addToast(
          `Frame belongs to ${newVideoId} — TRAKE is locked to ${selectedVideoId}`,
          'error'
        )
        return state
      }

      const events = state.trakeState.events.length
        ? state.trakeState.events
        : defaultTrakeEvents

      // Determine target event: active or first empty
      const targetIdx = activeEventId
        ? events.findIndex(e => e.id === activeEventId)
        : events.findIndex(e => !String(e.frameOrder || '').trim())

      if (targetIdx === -1) {
        if (!quiet) state.addToast('No empty TRAKE event input', 'error')
        return state
      }

      const newEvents = [...events]
      newEvents[targetIdx] = {
        ...newEvents[targetIdx],
        frameOrder: String(frameOrder),
        sourceVideoId: newVideoId,
        selectedCandidate: item,
      }

      // Auto-advance active event to next empty slot
      const nextEmptyIdx = newEvents.findIndex((e, i) => i > targetIdx && !String(e.frameOrder || '').trim())
      const nextActiveId = nextEmptyIdx !== -1 ? newEvents[nextEmptyIdx].id : null

      if (!quiet) state.addToast(`Used Frame Idx ${frameOrder} for ${newEvents[targetIdx].label}`, 'success')

      return {
        trakeState: {
          ...state.trakeState,
          selectedVideoId: selectedVideoId || newVideoId,
          stage: 2,
          activeEventId: nextActiveId,
          events: newEvents
        }
      }
    }
    return state
  })
}))

useStore.subscribe((state) => {
  try {
    const payload: PersistedSubmissionWorkspaceV2 = {
      version: TEAM_SUBMISSION_VERSION,
      mode: state.mode,
      submissionQueryName: state.submissionQueryName,
      recheckList: state.recheckList.map(compactRecheckItem),
      trakeState: compactTrakeState(state.trakeState),
      submissionPackage: state.submissionPackage,
      legacySubmissionPackageSnapshots: state.submissionPackage,
      teamSubmissionPackage: state.teamSubmissionPackage,
    }
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage can fail in private browsing or when quota is exhausted.
  }
})
