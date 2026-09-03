import type { RecheckItem, SearchResult, TrakeState } from '../store'

export type SubmissionQueryType = 'KIS' | 'QA' | 'TRAKE'

export interface SubmissionPackageFile {
  filename: string
  queryName: string
  queryType: SubmissionQueryType
  csv: string
  rows: number
  savedAt: number
}

export interface SubmissionValidation {
  valid: boolean
  errors: string[]
  csv: string
  rows: number
}

export const MAX_SUBMISSION_ROWS = 100
export const MAX_QA_ANSWER_LENGTH = 100
export const MAX_TRAKE_EVENT_COUNT = 20
export const DEFAULT_QUERY_NAME = 'query-1-kis'
export const TEAM_SUBMISSION_VERSION = 3
export const DEFAULT_TEAM_QUERY_COUNT = 25
export const MAX_PACKAGE_QUERY_COUNT = 50
export const DEFAULT_FILENAME_TEMPLATE = 'query-{n}-{type}'

export interface CandidateSource {
  resultId?: string
  imgLink?: string
  frameId?: string | number
  timestamp?: number | null
  score?: number
}

export interface KisCandidate {
  id: string
  type: 'KIS'
  videoId: string
  frameOrder: number | ''
  source?: CandidateSource
}

export interface QaCandidate {
  id: string
  type: 'QA'
  videoId: string
  frameOrder: number | ''
  answer: string
  source?: CandidateSource
}

export interface TrakeCandidate {
  id: string
  type: 'TRAKE'
  videoId: string
  frameOrders: Array<number | ''>
  expectedEventCount?: number
  source?: CandidateSource
}

export type QueryCandidate = KisCandidate | QaCandidate | TrakeCandidate
export type QueryCandidatePatch =
  | Partial<Omit<KisCandidate, 'id' | 'type'>>
  | Partial<Omit<QaCandidate, 'id' | 'type'>>
  | Partial<Omit<TrakeCandidate, 'id' | 'type'>>

export interface PackageQuery {
  id: string
  queryNumber: number
  type: SubmissionQueryType
  candidates: QueryCandidate[]
  reviewed: boolean
  notes?: string
  expectedEventCount?: number
  updatedAt: number
}

export interface TeamSubmissionPackage {
  version: typeof TEAM_SUBMISSION_VERSION
  queryCount: number
  filenameTemplate: string
  activeQueryId: string | null
  queries: PackageQuery[]
}

export type PackageQueryStatus = 'READY' | 'ERROR' | 'UNANSWERED'

export interface QueryValidationIssue {
  code: string
  message: string
  severity: 'warning' | 'error'
  candidateId?: string
  candidateIndex?: number
}

export interface QueryValidationResult {
  queryId: string
  queryNumber: number
  type: SubmissionQueryType
  filename: string
  candidateCount: number
  errors: QueryValidationIssue[]
  warnings: QueryValidationIssue[]
  status: PackageQueryStatus
  serializedCsv: string
}

export interface PackageValidationResult {
  totalQueries: number
  readyCount: number
  errorCount: number
  unansweredCount: number
  packageErrors: QueryValidationIssue[]
  packageWarnings: QueryValidationIssue[]
  queries: QueryValidationResult[]
  canProceedToFinalExport: boolean
}

export interface TeamSubmissionZipFile {
  filename: string
  internalPath: string
  queryNumber: number
  queryType: SubmissionQueryType
  csv: string
  rows: number
}

export interface TeamSubmissionZipResult {
  blob: Blob
  files: TeamSubmissionZipFile[]
  validation: PackageValidationResult
}

export type SubmissionSource = SearchResult | RecheckItem | NonNullable<TrakeState['events'][number]['selectedCandidate']>

function getPayload(source: SubmissionSource) {
  return source.payload
}

export function getSubmissionFrame(source: SubmissionSource): number | null {
  const value = getPayload(source).frame_order as unknown
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) ? numeric : null
}

export function getSubmissionVideoId(source: SubmissionSource): string {
  const raw = getPayload(source).video_id || ''
  return normalizeSubmissionVideoId(raw)
}

export function getSubmissionKey(source: SubmissionSource) {
  const videoId = getSubmissionVideoId(source)
  const frameOrder = getSubmissionFrame(source)
  return frameOrder == null ? '' : `${videoId}:${frameOrder}`
}

export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  const escaped = text.replace(/"/g, '""')
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

export function quotedCsvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(',')
}

function qaCsvRow(videoId: string, frameOrder: number | null, answer: string) {
  return `${csvCell(videoId)}, ${csvCell(frameOrder)}, ${quotedCsvCell(answer)}`
}

function isValidGeneratedQaRow(row: string) {
  return /^[^,\r\n]+, \d+, "(?:[^"]|"")*"$/.test(row)
}

export function sanitizeQueryName(input: string) {
  return input
    .trim()
    .replace(/\.csv$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
}

export function detectQueryTypeFromName(name: string): SubmissionQueryType | null {
  const normalized = sanitizeQueryName(name).toLowerCase()
  if (normalized.endsWith('-kis')) return 'KIS'
  if (normalized.endsWith('-qa')) return 'QA'
  if (normalized.endsWith('-trake')) return 'TRAKE'
  return null
}

export function queryTypeSuffix(type: SubmissionQueryType) {
  return type === 'QA' ? 'qa' : type.toLowerCase()
}

export function displaySubmissionQueryType(type: SubmissionQueryType) {
  return type === 'QA' ? 'Q&A' : type
}

export function normalizeSubmissionVideoId(value: unknown) {
  return String(value ?? '').trim().replace(/\.mp4$/i, '')
}

export function packageQueryId(queryNumber: number) {
  return `query-${queryNumber}`
}

export function normalizeFilenameTemplate(input: unknown) {
  return String(input ?? DEFAULT_FILENAME_TEMPLATE)
    .trim()
    .replace(/\.csv$/i, '')
}

export function validateFilenameTemplate(input: unknown) {
  const template = normalizeFilenameTemplate(input)
  const errors: string[] = []

  if (!template) {
    errors.push('Filename format is required.')
  }
  if (!template.includes('{n}') || !template.includes('{type}')) {
    errors.push('Filename format must include {n} and {type}.')
  }
  if (/[\\/]/.test(template) || template.includes('..')) {
    errors.push('Filename format must not contain path separators or ..')
  }
  if (/[<>:"|?*\u0000-\u001F]/.test(template)) {
    errors.push('Filename format contains unsafe filename characters.')
  }

  return {
    template,
    errors,
    valid: errors.length === 0,
  }
}

export function clampTeamQueryCount(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_TEAM_QUERY_COUNT
  return Math.max(1, Math.min(MAX_PACKAGE_QUERY_COUNT, Math.floor(numeric)))
}

export function renderPackageQueryBasename(
  query: Pick<PackageQuery, 'queryNumber' | 'type'>,
  filenameTemplate = DEFAULT_FILENAME_TEMPLATE,
) {
  const validation = validateFilenameTemplate(filenameTemplate)
  const template = validation.valid ? validation.template : DEFAULT_FILENAME_TEMPLATE
  return template
    .replace(/\{n\}/g, String(query.queryNumber))
    .replace(/\{type\}/g, queryTypeSuffix(query.type))
}

export function filenameForPackageQuery(
  query: Pick<PackageQuery, 'queryNumber' | 'type'>,
  filenameTemplate = DEFAULT_FILENAME_TEMPLATE,
) {
  return `${renderPackageQueryBasename(query, filenameTemplate)}.csv`
}

export function createEmptySubmissionPackage(queryCount = DEFAULT_TEAM_QUERY_COUNT): TeamSubmissionPackage {
  const safeCount = clampTeamQueryCount(queryCount)
  const queries = Array.from({ length: safeCount }, (_, index): PackageQuery => {
    const queryNumber = index + 1
    return {
      id: packageQueryId(queryNumber),
      queryNumber,
      type: 'KIS',
      candidates: [],
      reviewed: false,
      notes: '',
      updatedAt: 0,
    }
  })

  return {
    version: TEAM_SUBMISSION_VERSION,
    queryCount: safeCount,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    activeQueryId: queries[0]?.id ?? null,
    queries,
  }
}

export function packageQueryHasData(query: PackageQuery) {
  return query.candidates.length > 0 || Boolean(query.notes?.trim()) || query.reviewed
}

export function queryPlanFromPackage(teamPackage: TeamSubmissionPackage): PackageSetupQueryPlan[] {
  return Array.from({ length: clampTeamQueryCount(teamPackage.queryCount) }, (_, index) => {
    const queryNumber = index + 1
    const query = getPackageQueryByNumber(teamPackage, queryNumber)
    return {
      queryNumber,
      type: query?.type ?? 'KIS',
      expectedEventCount: query?.type === 'TRAKE' ? query.expectedEventCount : undefined,
    }
  })
}

export function configureTeamSubmissionPackage(
  teamPackage: TeamSubmissionPackage,
  config: PackageSetupConfig,
): TeamSubmissionPackage {
  const queryCount = clampTeamQueryCount(config.queryCount)
  const template = validateFilenameTemplate(config.filenameTemplate).template || DEFAULT_FILENAME_TEMPLATE
  const currentByNumber = new Map(teamPackage.queries.map((query) => [query.queryNumber, query]))
  const planByNumber = new Map(config.queryPlan.map((plan) => [plan.queryNumber, plan]))

  const queries = Array.from({ length: queryCount }, (_, index): PackageQuery => {
    const queryNumber = index + 1
    const existing = currentByNumber.get(queryNumber)
    const plan = planByNumber.get(queryNumber)
    const type = plan?.type ?? existing?.type ?? 'KIS'
    const expectedEventCount = type === 'TRAKE' ? plan?.expectedEventCount ?? existing?.expectedEventCount : undefined

    if (existing && existing.type === type) {
      return {
        ...existing,
        type,
        expectedEventCount,
      }
    }

    return {
      id: packageQueryId(queryNumber),
      queryNumber,
      type,
      candidates: [],
      reviewed: false,
      notes: '',
      expectedEventCount,
      updatedAt: existing ? Date.now() : 0,
    }
  })

  const activeQueryId = queries.some((query) => query.id === teamPackage.activeQueryId)
    ? teamPackage.activeQueryId
    : queries[0]?.id ?? null

  return {
    version: TEAM_SUBMISSION_VERSION,
    queryCount,
    filenameTemplate: template,
    activeQueryId,
    queries,
  }
}

export function resetTeamSubmissionPackageAnswers(teamPackage: TeamSubmissionPackage): TeamSubmissionPackage {
  return {
    ...teamPackage,
    queries: teamPackage.queries.map((query) => ({
      id: query.id,
      queryNumber: query.queryNumber,
      type: query.type,
      candidates: [],
      reviewed: false,
      notes: '',
      expectedEventCount: query.type === 'TRAKE' ? query.expectedEventCount : undefined,
      updatedAt: 0,
    })),
  }
}

export function getActivePackageQuery(teamPackage: TeamSubmissionPackage) {
  return teamPackage.queries.find((query) => query.id === teamPackage.activeQueryId) ?? teamPackage.queries[0] ?? null
}

export function getPackageQueryByNumber(teamPackage: TeamSubmissionPackage, queryNumber: number) {
  return teamPackage.queries.find((query) => query.queryNumber === queryNumber) ?? null
}

export function getPackageQueryFilename(
  query: Pick<PackageQuery, 'queryNumber' | 'type'>,
  filenameTemplate = DEFAULT_FILENAME_TEMPLATE,
) {
  return filenameForPackageQuery(query, filenameTemplate)
}

export function getPackageQueryCandidateCount(query?: Pick<PackageQuery, 'candidates'> | null) {
  return query?.candidates.length ?? 0
}

export function packageQueryContainsFrame(
  query: PackageQuery | null | undefined,
  videoId: string,
  frameOrder: number | null | undefined,
) {
  if (!query || frameOrder == null) return false
  const normalizedVideoId = normalizeSubmissionVideoId(videoId)
  if (!normalizedVideoId) return false

  if (query.type === 'TRAKE') {
    return query.candidates.some((candidate) => (
      candidate.type === 'TRAKE'
      && candidate.videoId === normalizedVideoId
      && candidate.frameOrders.some((eventFrameOrder) => eventFrameOrder === frameOrder)
    ))
  }

  if (query.type === 'KIS') {
    return query.candidates.some((candidate) => (
      candidate.type === 'KIS'
      && candidate.videoId === normalizedVideoId
      && candidate.frameOrder === frameOrder
    ))
  }

  return query.candidates.some((candidate) => (
    candidate.type === 'QA'
    && candidate.videoId === normalizedVideoId
    && candidate.frameOrder === frameOrder
  ))
}

export function packageQueryContainsResult(
  query: PackageQuery | null | undefined,
  source: SubmissionSource,
  frameOrderOverride?: number | null,
) {
  const frameOrder = frameOrderOverride == null ? getSubmissionFrame(source) : frameOrderOverride
  return packageQueryContainsFrame(query, getSubmissionVideoId(source), frameOrder)
}

export function packageQueryHasTrakeVideo(query: PackageQuery | null | undefined, videoId: string) {
  if (!query || query.type !== 'TRAKE') return false
  const normalizedVideoId = normalizeSubmissionVideoId(videoId)
  if (!normalizedVideoId) return false
  return query.candidates.some((candidate) => candidate.type === 'TRAKE' && candidate.videoId === normalizedVideoId)
}

function queryIssue(
  severity: QueryValidationIssue['severity'],
  code: string,
  message: string,
  candidate?: QueryCandidate,
  candidateIndex?: number,
): QueryValidationIssue {
  return {
    code,
    message,
    severity,
    candidateId: candidate?.id,
    candidateIndex,
  }
}

function isSubmissionFrameOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function isValidTrakeExpectedEventCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 1
    && value <= MAX_TRAKE_EVENT_COUNT
}

function frameOrderText(value: number | '') {
  if (!isSubmissionFrameOrder(value)) {
    throw new Error('Frame Idx must be an integer')
  }
  return String(value)
}

function validateCommonCandidateFields(
  candidate: QueryCandidate,
  candidateIndex: number,
  errors: QueryValidationIssue[],
) {
  const videoId = candidate.videoId.trim()
  if (!videoId) {
    errors.push(queryIssue('error', 'missing-video-id', 'Video ID is missing.', candidate, candidateIndex))
  }
  if (/\.mp4/i.test(candidate.videoId)) {
    errors.push(queryIssue('error', 'video-id-mp4', 'Video ID must not include .mp4.', candidate, candidateIndex))
  }
}

function duplicateKeyForCandidate(candidate: QueryCandidate) {
  const videoId = normalizeSubmissionVideoId(candidate.videoId)
  if (candidate.type === 'TRAKE') return `${videoId}:${candidate.frameOrders.join('>')}`
  return `${videoId}:${candidate.frameOrder}`
}

function parseSerializedFrame(value: string) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const numeric = Number(trimmed)
  return Number.isSafeInteger(numeric) ? numeric : null
}

function serializedRowIssue(
  code: string,
  message: string,
  candidate?: QueryCandidate,
  candidateIndex?: number,
) {
  return queryIssue('error', code, message, candidate, candidateIndex)
}

export function validateSerializedPackageQueryCsv(query: PackageQuery, csv: string): QueryValidationIssue[] {
  const errors: QueryValidationIssue[] = []
  const records = splitSubmissionCsvRecords(csv)
  const expectedTrakeEventCount = isValidTrakeExpectedEventCount(query.expectedEventCount)
    ? query.expectedEventCount
    : undefined

  if (records.length === 0) {
    errors.push(serializedRowIssue('serialized-empty', 'No candidates yet.'))
    return errors
  }

  if (records.length > MAX_SUBMISSION_ROWS) {
    errors.push(serializedRowIssue('serialized-too-many-rows', `Maximum ${MAX_SUBMISSION_ROWS} candidate rows allowed.`))
  }

  records.forEach((record, index) => {
    const candidate = query.candidates[index]
    const parsed = parseSubmissionRow(record.raw)
    if (parsed.errors.length > 0) {
      parsed.errors.forEach((error) => {
        errors.push(serializedRowIssue('serialized-malformed-csv', error, candidate, index))
      })
      return
    }

    if (isHeaderRow(parsed.fields)) {
      errors.push(serializedRowIssue('serialized-header', 'Header rows are not allowed.', candidate, index))
    }

    const expectedFieldCount = query.type === 'KIS'
      ? 2
      : query.type === 'QA'
        ? 3
        : expectedTrakeEventCount == null
          ? null
          : expectedTrakeEventCount + 1

    if (expectedFieldCount == null) {
      errors.push(serializedRowIssue('serialized-missing-trake-required-events', 'Required event count is not set.', candidate, index))
      return
    }

    if (parsed.fields.length !== expectedFieldCount) {
      errors.push(serializedRowIssue(
        'serialized-field-count',
        query.type === 'TRAKE'
          ? `Expected ${expectedTrakeEventCount} events, found ${Math.max(0, parsed.fields.length - 1)}.`
          : `Expected ${expectedFieldCount} CSV fields.`,
        candidate,
        index,
      ))
      return
    }

    const videoId = parsed.fields[0].trim()
    if (!videoId) {
      errors.push(serializedRowIssue('serialized-missing-video-id', 'Video ID is missing.', candidate, index))
    }
    if (/\.mp4/i.test(videoId)) {
      errors.push(serializedRowIssue('serialized-video-id-mp4', 'Video ID must not include .mp4.', candidate, index))
    }

    if (query.type === 'KIS' || query.type === 'QA') {
      const frameOrder = parseSerializedFrame(parsed.fields[1] || '')
      if (frameOrder == null) {
        errors.push(serializedRowIssue('serialized-invalid-frame-order', 'Frame Idx must be an integer.', candidate, index))
      }
    }

    if (query.type === 'QA') {
      const answer = parsed.fields[2] ?? ''
      if (answer.length === 0) {
        errors.push(serializedRowIssue('serialized-missing-answer', 'Answer is required.', candidate, index))
      }
      if (answer.length > MAX_QA_ANSWER_LENGTH) {
        errors.push(serializedRowIssue('serialized-answer-too-long', `Answer exceeds ${MAX_QA_ANSWER_LENGTH} characters.`, candidate, index))
      }
      if (candidate?.type === 'QA' && answer !== candidate.answer) {
        errors.push(serializedRowIssue('serialized-answer-changed', 'Serialized answer does not match the edited answer.', candidate, index))
      }
    }

    if (query.type === 'TRAKE') {
      parsed.fields.slice(1).forEach((field, eventIndex) => {
        if (parseSerializedFrame(field) == null) {
          errors.push(serializedRowIssue(
            'serialized-invalid-trake-frame',
            `Event ${eventIndex + 1} Frame Idx must be an integer.`,
            candidate,
            index,
          ))
        }
      })
    }
  })

  return errors
}

export function serializePackageQuery(query: PackageQuery) {
  if (
    query.type === 'TRAKE'
    && query.candidates.length > 0
    && !isValidTrakeExpectedEventCount(query.expectedEventCount)
  ) {
    throw new Error('Required event count is not set')
  }

  const rows = query.candidates.map((candidate) => {
    if (candidate.type !== query.type) {
      throw new Error('Candidate format does not match query type')
    }

    const videoId = normalizeSubmissionVideoId(candidate.videoId)
    if (!videoId || /\.mp4/i.test(candidate.videoId)) {
      throw new Error('Video ID is missing or contains .mp4')
    }

    if (candidate.type === 'KIS') {
      return `${csvCell(videoId)},${frameOrderText(candidate.frameOrder)}`
    }

    if (candidate.type === 'QA') {
      const answer = candidate.answer
      if (answer.length === 0 || answer.length > MAX_QA_ANSWER_LENGTH) {
        throw new Error('Q&A answer is missing or too long')
      }
      return `${csvCell(videoId)},${frameOrderText(candidate.frameOrder)},${quotedCsvCell(answer)}`
    }

    if (!Array.isArray(candidate.frameOrders) || candidate.frameOrders.length === 0) {
      throw new Error('TRAKE candidate must contain at least one event frame')
    }
    if (candidate.frameOrders.length !== query.expectedEventCount) {
      throw new Error(`Expected ${query.expectedEventCount} events, found ${candidate.frameOrders.length}`)
    }
    return [
      csvCell(videoId),
      ...candidate.frameOrders.map((frameOrder) => frameOrderText(frameOrder)),
    ].join(',')
  })

  return rows.join('\n')
}

export function validatePackageQuery(
  query: PackageQuery,
  filenameTemplate = DEFAULT_FILENAME_TEMPLATE,
): QueryValidationResult {
  const errors: QueryValidationIssue[] = []
  const warnings: QueryValidationIssue[] = []
  const filename = filenameForPackageQuery(query, filenameTemplate)
  const seen = new Map<string, number>()
  const expectedTrakeEventCount = isValidTrakeExpectedEventCount(query.expectedEventCount)
    ? query.expectedEventCount
    : undefined

  if (query.candidates.length > MAX_SUBMISSION_ROWS) {
    errors.push(queryIssue('error', 'too-many-candidates', `Maximum ${MAX_SUBMISSION_ROWS} candidate rows allowed.`))
  }

  if (query.type === 'TRAKE' && query.candidates.length > 0 && expectedTrakeEventCount == null) {
    errors.push(queryIssue('error', 'missing-trake-required-events', 'Required event count is not set.'))
  }

  query.candidates.forEach((candidate, candidateIndex) => {
    if (candidate.type !== query.type) {
      errors.push(queryIssue(
        'error',
        'candidate-type-mismatch',
        'Candidate format does not match query type.',
        candidate,
        candidateIndex,
      ))
      return
    }

    validateCommonCandidateFields(candidate, candidateIndex, errors)

    if (candidate.type === 'KIS') {
      if (!isSubmissionFrameOrder(candidate.frameOrder)) {
        errors.push(queryIssue('error', 'invalid-frame-order', 'Frame Idx must be an integer.', candidate, candidateIndex))
      }
    } else if (candidate.type === 'QA') {
      if (!isSubmissionFrameOrder(candidate.frameOrder)) {
        errors.push(queryIssue('error', 'invalid-frame-order', 'Frame Idx must be an integer.', candidate, candidateIndex))
      }
      if (candidate.answer.length === 0) {
        errors.push(queryIssue('error', 'missing-answer', 'Answer is required.', candidate, candidateIndex))
      }
      if (candidate.answer.length > MAX_QA_ANSWER_LENGTH) {
        errors.push(queryIssue('error', 'answer-too-long', `Answer exceeds ${MAX_QA_ANSWER_LENGTH} characters.`, candidate, candidateIndex))
      }
    } else {
      if (!Array.isArray(candidate.frameOrders) || candidate.frameOrders.length === 0) {
        errors.push(queryIssue('error', 'missing-trake-events', 'TRAKE candidate must contain at least one event frame.', candidate, candidateIndex))
      }
      candidate.frameOrders.forEach((frameOrder, eventIndex) => {
        if (!isSubmissionFrameOrder(frameOrder)) {
          errors.push(queryIssue(
            'error',
            'invalid-trake-frame-order',
            `Event ${eventIndex + 1} Frame Idx must be an integer.`,
            candidate,
            candidateIndex,
          ))
        }
      })
      if (expectedTrakeEventCount != null && candidate.frameOrders.length !== expectedTrakeEventCount) {
        errors.push(queryIssue(
          'error',
          'trake-event-count-mismatch',
          `Expected ${expectedTrakeEventCount} events, found ${candidate.frameOrders.length}.`,
          candidate,
          candidateIndex,
        ))
      }
    }

    const key = duplicateKeyForCandidate(candidate)
    if (seen.has(key)) {
      const firstIndex = (seen.get(key) ?? 0) + 1
      errors.push(queryIssue(
        'error',
        'duplicate-candidate',
        `Duplicate candidate also appears at row ${firstIndex}.`,
        candidate,
        candidateIndex,
      ))
    } else {
      seen.set(key, candidateIndex)
    }
  })

  let serializedCsv = ''
  if (query.candidates.length > 0) {
    try {
      serializedCsv = serializePackageQuery(query)
      const serializationErrors = validateSerializedPackageQueryCsv(query, serializedCsv)
      errors.push(...serializationErrors)
      const serializedRows = splitSubmissionCsvRecords(serializedCsv).length
      if (serializedRows !== query.candidates.length) {
        errors.push(queryIssue('error', 'serialization-row-count', 'Serialized CSV row count does not match candidate count.'))
      }
    } catch (error) {
      errors.push(queryIssue(
        'error',
        'serialization-failed',
        error instanceof Error ? `CSV dry run failed: ${error.message}.` : 'CSV dry run failed.',
      ))
    }
  }

  const status: PackageQueryStatus = query.candidates.length === 0
    ? 'UNANSWERED'
    : errors.length > 0
    ? 'ERROR'
    : 'READY'

  return {
    queryId: query.id,
    queryNumber: query.queryNumber,
    type: query.type,
    filename,
    candidateCount: query.candidates.length,
    errors,
    warnings,
    status,
    serializedCsv,
  }
}

export function validateTeamSubmissionPackage(
  teamPackage: TeamSubmissionPackage,
): PackageValidationResult {
  const packageErrors: QueryValidationIssue[] = []
  const packageWarnings: QueryValidationIssue[] = []
  const expectedQueryCount = clampTeamQueryCount(teamPackage.queryCount)
  const templateValidation = validateFilenameTemplate(teamPackage.filenameTemplate)
  const filenameTemplate = templateValidation.valid ? templateValidation.template : DEFAULT_FILENAME_TEMPLATE
  const queries = teamPackage.queries.map((query) => validatePackageQuery(query, filenameTemplate))
  const queryNumbers = new Map<number, number>()
  const filenames = new Map<string, number>()

  for (const error of templateValidation.errors) {
    packageErrors.push(queryIssue('error', 'filename-template-invalid', error))
  }

  if (teamPackage.queries.length !== expectedQueryCount) {
    packageErrors.push(queryIssue(
      'error',
      'package-query-count',
      `Expected exactly ${expectedQueryCount} queries, found ${teamPackage.queries.length}.`,
    ))
  }

  for (const query of teamPackage.queries) {
    if (!Number.isInteger(query.queryNumber) || query.queryNumber < 1 || query.queryNumber > expectedQueryCount) {
      packageErrors.push(queryIssue(
        'error',
        'query-number-out-of-range',
        `Query number ${query.queryNumber} must be between 1 and ${expectedQueryCount}.`,
      ))
    }

    queryNumbers.set(query.queryNumber, (queryNumbers.get(query.queryNumber) ?? 0) + 1)
    const filename = filenameForPackageQuery(query, filenameTemplate)
    filenames.set(filename, (filenames.get(filename) ?? 0) + 1)
  }

  for (let queryNumber = 1; queryNumber <= expectedQueryCount; queryNumber += 1) {
    if (!queryNumbers.has(queryNumber)) {
      packageErrors.push(queryIssue('error', 'missing-query-number', `Query ${queryNumber} is missing.`))
    }
  }

  for (const [queryNumber, count] of queryNumbers) {
    if (count > 1) {
      packageErrors.push(queryIssue('error', 'duplicate-query-number', `Query number ${queryNumber} appears ${count} times.`))
    }
  }

  for (const [filename, count] of filenames) {
    if (count > 1) {
      packageErrors.push(queryIssue('error', 'duplicate-filename', `Generated filename ${filename} appears ${count} times.`))
    }
  }

  const readyCount = queries.filter((query) => query.status === 'READY').length
  const errorCount = queries.filter((query) => query.status === 'ERROR').length
  const unansweredCount = queries.filter((query) => query.status === 'UNANSWERED').length

  return {
    totalQueries: expectedQueryCount,
    readyCount,
    errorCount,
    unansweredCount,
    packageErrors,
    packageWarnings,
    queries,
    canProceedToFinalExport: packageErrors.length === 0 && errorCount === 0 && unansweredCount === 0,
  }
}

function assertFinalSubmissionFiles(files: TeamSubmissionZipFile[], expectedQueryCount: number) {
  const errors: string[] = []
  const filenames = new Set<string>()
  const queryNumbers = new Set<number>()

  if (files.length !== expectedQueryCount) {
    errors.push(`Expected exactly ${expectedQueryCount} CSV files, found ${files.length}.`)
  }

  for (const file of files) {
    const expectedInternalPath = `submission/${file.filename}`
    if (file.internalPath !== expectedInternalPath) {
      errors.push(`${file.internalPath}: ZIP path must be ${expectedInternalPath}.`)
    }
    if (!file.internalPath.startsWith('submission/')) {
      errors.push(`${file.internalPath}: ZIP path must begin with submission/.`)
    }
    if (file.internalPath.startsWith('submission/submission/')) {
      errors.push(`${file.internalPath}: ZIP path must contain exactly one submission/ directory.`)
    }
    if (!file.filename.endsWith('.csv')) {
      errors.push(`${file.filename}: generated filename must end with .csv.`)
    }
    if (filenames.has(file.filename)) {
      errors.push(`${file.filename}: duplicate generated filename.`)
    }
    filenames.add(file.filename)
    queryNumbers.add(file.queryNumber)
  }

  for (let queryNumber = 1; queryNumber <= expectedQueryCount; queryNumber += 1) {
    if (!queryNumbers.has(queryNumber)) {
      errors.push(`Query ${queryNumber}: missing CSV file.`)
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '))
  }
}

export function buildTeamSubmissionFiles(
  teamPackage: TeamSubmissionPackage,
) {
  const expectedQueryCount = clampTeamQueryCount(teamPackage.queryCount)
  const validation = validateTeamSubmissionPackage(teamPackage)
  if (!validation.canProceedToFinalExport) {
    throw new Error('Cannot export submission. Fix all validation errors first.')
  }

  const files = [...teamPackage.queries]
    .sort((a, b) => a.queryNumber - b.queryNumber)
    .map((query): TeamSubmissionZipFile => {
      const csv = serializePackageQuery(query)
      const filename = filenameForPackageQuery(query, teamPackage.filenameTemplate)
      return {
        filename,
        internalPath: `submission/${filename}`,
        queryNumber: query.queryNumber,
        queryType: query.type,
        csv,
        rows: query.candidates.length,
      }
    })

  assertFinalSubmissionFiles(files, expectedQueryCount)
  return files
}

export function createTeamSubmissionZip(
  teamPackage: TeamSubmissionPackage,
): TeamSubmissionZipResult {
  const validation = validateTeamSubmissionPackage(teamPackage)
  if (!validation.canProceedToFinalExport) {
    throw new Error('Cannot export submission. Fix all validation errors first.')
  }

  const files = buildTeamSubmissionFiles(teamPackage)
  const zipInput: SubmissionPackageFile[] = files.map((file) => ({
    filename: file.filename,
    queryName: file.filename.replace(/\.csv$/i, ''),
    queryType: file.queryType,
    csv: file.csv,
    rows: file.rows,
    savedAt: Date.now(),
  }))

  return {
    blob: createSubmissionZip(zipInput),
    files,
    validation,
  }
}

export type ParsedPasteRowStatus = 'OK' | 'ERROR' | 'DUPLICATE' | 'LIMIT'

export interface ParsedSubmissionCsvRow {
  fields: string[]
  errors: string[]
}

export interface ParsedSubmissionCsvRecord {
  raw: string
  lineNumber: number
}

export interface ParsedPasteRow {
  lineNumber: number
  raw: string
  fields: string[]
  candidate?: QueryCandidate
  errors: string[]
  warnings: string[]
  status: ParsedPasteRowStatus
  eligible: boolean
}

export interface ParsedPasteResult {
  queryId: string
  queryType: SubmissionQueryType
  existingCandidateCount: number
  capacity: number
  rows: ParsedPasteRow[]
  eligibleCandidates: QueryCandidate[]
}

export interface ParsePastedCandidatesOptions {
  strictOfficialVideoId?: boolean
  expectedEventCount?: number
  normalizeClipboardEnvelope?: boolean
}

export interface ParsedSubmissionFilename {
  filename: string
  queryNumber?: number
  type?: SubmissionQueryType
  errors: string[]
}

export interface PackageSetupQueryPlan {
  queryNumber: number
  type: SubmissionQueryType
  expectedEventCount?: number
}

export interface PackageSetupConfig {
  queryCount: number
  filenameTemplate: string
  queryPlan: PackageSetupQueryPlan[]
}

function pasteCandidateId(type: SubmissionQueryType, lineNumber: number, index: number) {
  const random = Math.random().toString(36).slice(2, 9)
  return `paste-${type.toLowerCase()}-${Date.now()}-${lineNumber}-${index}-${random}`
}

function parsePastedInteger(value: string, label: string, errors: string[]) {
  const trimmed = value.trim()
  if (!trimmed) {
    errors.push(`${label} is missing`)
    return null
  }
  if (!/^\d+$/.test(trimmed)) {
    errors.push(`Invalid ${label}: ${trimmed}`)
    return null
  }
  const numeric = Number(trimmed)
  if (!Number.isSafeInteger(numeric)) {
    errors.push(`Invalid ${label}: ${trimmed}`)
    return null
  }
  return numeric
}

function isHeaderRow(fields: string[]) {
  const normalized = fields.map((field) => (
    field.trim().toLowerCase().replace(/[\s_-]+/g, '')
  ))
  const firstFieldIsVideo = ['videoid', 'video', 'vidid'].includes(normalized[0] || '')
  const hasFrameHeader = normalized.some((field) => (
    ['frameorder', 'frameidx', 'frameindex', 'btcframeidx'].includes(field)
  ))
  const hasAnswerHeader = normalized.some((field) => ['answer', 'qaanswer'].includes(field))
  const hasEventHeader = normalized.some((field) => field.startsWith('event') || field.startsWith('frameorder'))
  return firstFieldIsVideo && (hasFrameHeader || hasAnswerHeader || hasEventHeader)
}

function existingPasteKeys(query: PackageQuery) {
  const keys = new Set<string>()
  for (const candidate of query.candidates) {
    if (query.type === 'TRAKE' && candidate.type === 'TRAKE') {
      keys.add(`${candidate.videoId}:${candidate.frameOrders.join('>')}`)
    } else if (candidate.type === 'KIS' || candidate.type === 'QA') {
      keys.add(`${candidate.videoId}:${candidate.frameOrder}`)
    }
  }
  return keys
}

function candidatePasteKey(candidate: QueryCandidate) {
  if (candidate.type === 'TRAKE') return `${candidate.videoId}:${candidate.frameOrders.join('>')}`
  return `${candidate.videoId}:${candidate.frameOrder}`
}

export function parseSubmissionFilename(
  filename: string,
  teamPackage: Pick<TeamSubmissionPackage, 'queryCount' | 'filenameTemplate' | 'queries'> = createEmptySubmissionPackage(DEFAULT_TEAM_QUERY_COUNT),
): ParsedSubmissionFilename {
  const trimmed = filename.trim()
  const errors: string[] = []
  if (!/\.csv$/i.test(trimmed)) {
    errors.push('Only .csv files are supported.')
    return { filename: trimmed, errors }
  }

  const expectedByFilename = new Map(
    teamPackage.queries.map((query) => [
      filenameForPackageQuery(query, teamPackage.filenameTemplate).toLowerCase(),
      query,
    ]),
  )
  const matchedQuery = expectedByFilename.get(trimmed.toLowerCase())
  if (!matchedQuery) {
    errors.push('Filename does not match the current package setup.')
    return { filename: trimmed, errors }
  }

  return {
    filename: trimmed,
    queryNumber: matchedQuery.queryNumber,
    type: matchedQuery.type,
    errors,
  }
}

export function parseSubmissionRow(row: string): ParsedSubmissionCsvRow {
  const fields: string[] = []
  const errors: string[] = []
  let field = ''
  let inQuotes = false
  let fieldQuoted = false
  let quoteClosed = false

  const pushField = () => {
    fields.push(fieldQuoted ? field : field)
    field = ''
    inQuotes = false
    fieldQuoted = false
    quoteClosed = false
  }

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (inQuotes) {
      if (char === '"') {
        if (row[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          quoteClosed = true
        }
      } else {
        field += char
      }
      continue
    }

    if (char === ',') {
      pushField()
      continue
    }

    if (char === '"') {
      if (!fieldQuoted && !quoteClosed && field.trim() === '') {
        field = ''
        fieldQuoted = true
        inQuotes = true
      } else {
        errors.push('Malformed quoted CSV')
        field += char
      }
      continue
    }

    if (quoteClosed) {
      if (/\s/.test(char)) continue
      errors.push('Unexpected text after closing quote')
      quoteClosed = false
    }

    field += char
  }

  if (inQuotes) errors.push('Malformed quoted CSV: missing closing quote')
  pushField()

  return {
    fields,
    errors: Array.from(new Set(errors)),
  }
}

export function splitSubmissionCsvRecords(text: string): ParsedSubmissionCsvRecord[] {
  const source = text.replace(/^\uFEFF/, '')
  const records: ParsedSubmissionCsvRecord[] = []
  let raw = ''
  let field = ''
  let inQuotes = false
  let fieldQuoted = false
  let quoteClosed = false
  let lineNumber = 1
  let recordLineNumber = 1

  const resetField = () => {
    field = ''
    fieldQuoted = false
    quoteClosed = false
  }

  const pushRecord = () => {
    if (raw.trim().length > 0) {
      records.push({ raw, lineNumber: recordLineNumber })
    }
    raw = ''
    resetField()
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const isCrLf = char === '\r' && source[index + 1] === '\n'

    if (inQuotes) {
      raw += char
      if (char === '"') {
        if (source[index + 1] === '"') {
          raw += source[index + 1]
          index += 1
        } else {
          inQuotes = false
          quoteClosed = true
        }
      } else if (char === '\r' || char === '\n') {
        if (isCrLf) {
          raw += source[index + 1]
          index += 1
        }
        lineNumber += 1
      }
      continue
    }

    if (char === '\r' || char === '\n') {
      pushRecord()
      if (isCrLf) index += 1
      lineNumber += 1
      recordLineNumber = lineNumber
      continue
    }

    if (char === ',') {
      raw += char
      resetField()
      continue
    }

    if (char === '"') {
      raw += char
      if (!fieldQuoted && !quoteClosed && field.trim() === '') {
        field = ''
        fieldQuoted = true
        inQuotes = true
      } else {
        field += char
      }
      continue
    }

    if (quoteClosed && !/\s/.test(char)) {
      quoteClosed = false
    }

    raw += char
    field += char
  }

  pushRecord()
  return records
}

function hasPhysicalNewline(text: string) {
  return /[\r\n]/.test(text)
}

function looksLikeSubmissionRecord(fields: string[]) {
  if (fields.length < 2) return false
  const videoId = fields[0].trim()
  const frameValue = fields[1].trim()
  return /^L\d+_V\d+$/i.test(normalizeSubmissionVideoId(videoId)) && /^\d+$/.test(frameValue)
}

function looksLikeSubmissionText(text: string) {
  const records = splitSubmissionCsvRecords(text)
  if (records.length < 2) return false
  return records.every((record) => {
    const parsed = parseSubmissionRow(record.raw)
    return parsed.errors.length === 0 && looksLikeSubmissionRecord(parsed.fields)
  })
}

export function normalizeClipboardSubmissionText(text: string) {
  if (!hasPhysicalNewline(text)) return text

  const records = splitSubmissionCsvRecords(text)
  if (records.length !== 1) return text

  const parsed = parseSubmissionRow(records[0].raw)
  if (parsed.errors.length > 0 || parsed.fields.length !== 1) return text

  const innerText = parsed.fields[0]
  if (!hasPhysicalNewline(innerText)) return text
  return looksLikeSubmissionText(innerText) ? innerText : text
}

function parseCandidateForQuery(
  query: PackageQuery,
  fields: string[],
  lineNumber: number,
  rowIndex: number,
  options: ParsePastedCandidatesOptions,
) {
  const errors: string[] = []
  const rawVideoId = fields[0] || ''
  const videoId = normalizeSubmissionVideoId(rawVideoId)
  if (!videoId) errors.push('Video ID is missing')
  if (options.strictOfficialVideoId && /\.mp4$/i.test(rawVideoId.trim())) {
    errors.push('Video ID must not include .mp4')
  }

  if (query.type === 'KIS') {
    if (fields.length !== 2) errors.push('Expected 2 fields: videoId, frameOrder')
    const frameOrder = parsePastedInteger(fields[1] || '', 'Frame Idx', errors)
    return {
      errors,
      candidate: videoId && frameOrder != null
        ? {
            id: pasteCandidateId('KIS', lineNumber, rowIndex),
            type: 'KIS' as const,
            videoId,
            frameOrder,
          }
        : undefined,
    }
  }

  if (query.type === 'QA') {
    if (fields.length !== 3) errors.push('Expected 3 fields: videoId, frameOrder, answer')
    const frameOrder = parsePastedInteger(fields[1] || '', 'Frame Idx', errors)
    const answer = fields[2] || ''
    if (answer.length === 0) errors.push('Answer is required')
    if (answer.length > MAX_QA_ANSWER_LENGTH) {
      errors.push(`Answer exceeds ${MAX_QA_ANSWER_LENGTH} characters`)
    }
    return {
      errors,
      candidate: videoId && frameOrder != null && answer.length > 0
        ? {
            id: pasteCandidateId('QA', lineNumber, rowIndex),
            type: 'QA' as const,
            videoId,
            frameOrder,
            answer,
          }
        : undefined,
    }
  }

  if (fields.length < 2) errors.push('Expected videoId plus at least one event frame')
  const frameOrders = fields.slice(1).map((field, index) => (
    parsePastedInteger(field, `Event ${index + 1} Frame Idx`, errors)
  ))
  const validFrameOrders = frameOrders.filter((frameOrder): frameOrder is number => frameOrder != null)
  if (
    options.expectedEventCount
    && validFrameOrders.length === frameOrders.length
    && validFrameOrders.length !== options.expectedEventCount
  ) {
    errors.push(`Expected ${options.expectedEventCount} events, found ${validFrameOrders.length}`)
  }

  return {
    errors,
    candidate: videoId && validFrameOrders.length === frameOrders.length && validFrameOrders.length > 0
      ? {
          id: pasteCandidateId('TRAKE', lineNumber, rowIndex),
          type: 'TRAKE' as const,
          videoId,
          frameOrders: validFrameOrders,
        }
      : undefined,
  }
}

export function parsePastedCandidates(
  query: PackageQuery,
  text: string,
  options: ParsePastedCandidatesOptions = {},
): ParsedPasteResult {
  const existingKeys = existingPasteKeys(query)
  const pastedKeys = new Set<string>()
  const capacity = Math.max(0, MAX_SUBMISSION_ROWS - query.candidates.length)
  let eligibleCount = 0
  const parseText = options.normalizeClipboardEnvelope
    ? normalizeClipboardSubmissionText(text)
    : text

  const rows = splitSubmissionCsvRecords(parseText)
    .map((line, rowIndex): ParsedPasteRow => {
      const parsed = parseSubmissionRow(line.raw)
      const errors = [...parsed.errors]
      const warnings: string[] = []

      if (isHeaderRow(parsed.fields)) {
        errors.push('Header rows are not allowed.')
      }

      const candidateResult = errors.length === 0
        ? parseCandidateForQuery(query, parsed.fields, line.lineNumber, rowIndex, options)
        : { errors: [], candidate: undefined }
      errors.push(...candidateResult.errors)

      const candidate = candidateResult.candidate
      let status: ParsedPasteRowStatus = errors.length > 0 ? 'ERROR' : 'OK'
      let eligible = status === 'OK' && Boolean(candidate)

      if (eligible && candidate) {
        const key = candidatePasteKey(candidate)
        if (existingKeys.has(key)) {
          warnings.push('Duplicate already exists in this query.')
          status = 'DUPLICATE'
          eligible = false
        } else if (pastedKeys.has(key)) {
          warnings.push('Duplicate within pasted rows.')
          status = 'DUPLICATE'
          eligible = false
        } else if (eligibleCount >= capacity) {
          warnings.push(`Exceeds ${MAX_SUBMISSION_ROWS}-row maximum for active query.`)
          status = 'LIMIT'
          eligible = false
        } else {
          pastedKeys.add(key)
          eligibleCount += 1
        }
      }

      return {
        lineNumber: line.lineNumber,
        raw: line.raw,
        fields: parsed.fields,
        candidate,
        errors,
        warnings,
        status,
        eligible,
      }
    })

  return {
    queryId: query.id,
    queryType: query.type,
    existingCandidateCount: query.candidates.length,
    capacity,
    rows,
    eligibleCandidates: rows
      .filter((row): row is ParsedPasteRow & { candidate: QueryCandidate } => row.eligible && Boolean(row.candidate))
      .map((row) => row.candidate),
  }
}

export function filenameForQuery(queryName: string, type: SubmissionQueryType) {
  const cleaned = sanitizeQueryName(queryName) || `query-1-${queryTypeSuffix(type)}`
  const detected = detectQueryTypeFromName(cleaned)
  const basename = detected ? cleaned : `${cleaned}-${queryTypeSuffix(type)}`
  return `${basename}.csv`
}

function validateSource(source: SubmissionSource, rowLabel: string, seen?: Set<string>) {
  const errors: string[] = []
  const videoId = getSubmissionVideoId(source)
  const frameOrder = getSubmissionFrame(source)

  if (!videoId) errors.push(`${rowLabel}: video_id is missing`)
  if (/\.mp4$/i.test(String(getPayload(source).video_id || ''))) errors.push(`${rowLabel}: video_id must not include .mp4`)
  if (frameOrder == null) errors.push(`${rowLabel}: frame_order is missing or invalid`)

  if (seen && videoId && frameOrder != null) {
    const key = `${videoId}:${frameOrder}`
    if (seen.has(key)) errors.push(`${rowLabel}: duplicate video_id + frame_order`)
    seen.add(key)
  }

  return errors
}

export function validateSubmission(
  type: SubmissionQueryType,
  items: RecheckItem[],
  trakeState: TrakeState,
): SubmissionValidation {
  const errors: string[] = []

  if (type === 'TRAKE') {
    const selectedVideoId = String(trakeState.selectedVideoId || '').replace(/\.mp4$/i, '')
    if (!selectedVideoId) errors.push('TRAKE: selected video is missing')
    if (/\.mp4$/i.test(String(trakeState.selectedVideoId || ''))) errors.push('TRAKE: video_id must not include .mp4')
    if (trakeState.events.length === 0) errors.push('TRAKE: at least one event is required')

    const rawFrames = trakeState.events.map((event) => String(event.frameOrder || '').trim())
    rawFrames.forEach((value, index) => {
      if (!value) {
        errors.push(`Event ${index + 1}: frame_order is required`)
      } else if (!/^\d+$/.test(value)) {
        errors.push(`Event ${index + 1}: frame_order must be an integer`)
      }

      const eventVideoId = trakeState.events[index]?.sourceVideoId
      if (selectedVideoId && eventVideoId && eventVideoId !== selectedVideoId) {
        errors.push(`Event ${index + 1}: video_id does not match selected TRAKE video`)
      }
    })

    const csv = errors.length === 0
      ? csvRow([
          selectedVideoId,
          ...rawFrames.map((value) => Number(value)),
        ])
      : ''

    return { valid: errors.length === 0, errors, csv, rows: csv ? 1 : 0 }
  }

  if (items.length === 0) errors.push('No rows added')
  if (items.length > MAX_SUBMISSION_ROWS) errors.push(`Maximum ${MAX_SUBMISSION_ROWS} rows allowed`)

  const seen = new Set<string>()
  items.slice(0, MAX_SUBMISSION_ROWS).forEach((item, index) => {
    errors.push(...validateSource(item, `Row ${index + 1}`, seen))

    if (type === 'QA') {
      const answer = item.answer || ''
      if (!answer.trim()) errors.push(`Row ${index + 1}: answer is missing`)
      if (answer.length > MAX_QA_ANSWER_LENGTH) {
        errors.push(`Row ${index + 1}: answer exceeds ${MAX_QA_ANSWER_LENGTH} characters`)
      }
    }
  })

  const rows = items.slice(0, MAX_SUBMISSION_ROWS).map((item) => {
    if (type === 'QA') {
      return qaCsvRow(getSubmissionVideoId(item), getSubmissionFrame(item), item.answer || '')
    }
    return csvRow([getSubmissionVideoId(item), getSubmissionFrame(item)])
  })

  if (type === 'QA') {
    rows.forEach((row, index) => {
      if (!isValidGeneratedQaRow(row)) {
        errors.push(`Row ${index + 1}: generated Q&A CSV row is not video_id, frame_order, "answer"`)
      }
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    csv: errors.length === 0 ? rows.join('\n') : '',
    rows: items.length,
  }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: dosDate }
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff)
}

function pushUint32(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function pushBytes(bytes: number[], data: Uint8Array) {
  for (const byte of data) bytes.push(byte)
}

export function createSubmissionZip(files: SubmissionPackageFile[]) {
  const encoder = new TextEncoder()
  const now = dosDateTime(new Date())
  const output: number[] = []
  const centralDirectory: number[] = []

  for (const file of files) {
    const filename = `submission/${file.filename}`
    const nameBytes = encoder.encode(filename)
    const data = encoder.encode(file.csv.endsWith('\n') ? file.csv : `${file.csv}\n`)
    const crc = crc32(data)
    const localOffset = output.length

    pushUint32(output, 0x04034b50)
    pushUint16(output, 20)
    pushUint16(output, 0x0800)
    pushUint16(output, 0)
    pushUint16(output, now.time)
    pushUint16(output, now.date)
    pushUint32(output, crc)
    pushUint32(output, data.length)
    pushUint32(output, data.length)
    pushUint16(output, nameBytes.length)
    pushUint16(output, 0)
    pushBytes(output, nameBytes)
    pushBytes(output, data)

    pushUint32(centralDirectory, 0x02014b50)
    pushUint16(centralDirectory, 20)
    pushUint16(centralDirectory, 20)
    pushUint16(centralDirectory, 0x0800)
    pushUint16(centralDirectory, 0)
    pushUint16(centralDirectory, now.time)
    pushUint16(centralDirectory, now.date)
    pushUint32(centralDirectory, crc)
    pushUint32(centralDirectory, data.length)
    pushUint32(centralDirectory, data.length)
    pushUint16(centralDirectory, nameBytes.length)
    pushUint16(centralDirectory, 0)
    pushUint16(centralDirectory, 0)
    pushUint16(centralDirectory, 0)
    pushUint16(centralDirectory, 0)
    pushUint32(centralDirectory, 0)
    pushUint32(centralDirectory, localOffset)
    pushBytes(centralDirectory, nameBytes)
  }

  const centralOffset = output.length
  pushBytes(output, new Uint8Array(centralDirectory))
  pushUint32(output, 0x06054b50)
  pushUint16(output, 0)
  pushUint16(output, 0)
  pushUint16(output, files.length)
  pushUint16(output, files.length)
  pushUint32(output, centralDirectory.length)
  pushUint32(output, centralOffset)
  pushUint16(output, 0)

  return new Blob([new Uint8Array(output)], { type: 'application/zip' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
