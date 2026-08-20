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
export const DEFAULT_QUERY_NAME = 'query-1-kis'

type SubmissionSource = SearchResult | RecheckItem | NonNullable<TrakeState['events'][number]['selectedCandidate']>

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
  return String(raw).replace(/\.mp4$/i, '')
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
