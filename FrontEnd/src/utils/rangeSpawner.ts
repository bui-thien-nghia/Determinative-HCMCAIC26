import type { SearchResult } from '../store'
import { getCurrentFrameOrder, resolveTimestamp } from './results'
import {
  MAX_QA_ANSWER_LENGTH,
  MAX_SUBMISSION_ROWS,
  normalizeSubmissionVideoId,
  type PackageQuery,
  type QueryCandidate,
} from './submission'

export type SpawnRangeMode = 'frame' | 'time'

export type SpawnRangePreview = {
  errors: string[]
  generatedFrameOrders: number[]
  newFrameOrders: number[]
  duplicateCount: number
  currentCount: number
  maxRows: number
  wouldExceedLimit: boolean
  generatedTimestamps?: number[]
}

export type SpawnRangeInput = {
  query: PackageQuery
  mode: SpawnRangeMode
  videoId: string
  startFrame: string
  endFrame: string
  frameSpacing: string
  startTime: string
  endTime: string
  timeSpacing: string
  answer: string
  videoMetadata?: SearchResult | null
}

function parseNonNegativeInteger(value: string) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const numeric = Number(trimmed)
  return Number.isSafeInteger(numeric) ? numeric : null
}

function parsePositiveInteger(value: string) {
  const numeric = parseNonNegativeInteger(value)
  return numeric != null && numeric >= 1 ? numeric : null
}

function parseNonNegativeFiniteNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function parsePositiveFiniteNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function roundTime(value: number) {
  return Number(value.toFixed(6))
}

function existingFrameKeys(query: PackageQuery) {
  const keys = new Set<string>()
  for (const candidate of query.candidates) {
    if (candidate.type === 'KIS' || candidate.type === 'QA') {
      const videoId = normalizeSubmissionVideoId(candidate.videoId)
      if (videoId && typeof candidate.frameOrder === 'number') {
        keys.add(`${videoId}:${candidate.frameOrder}`)
      }
    }
  }
  return keys
}

function dedupeFrameOrders(frameOrders: number[]) {
  const seen = new Set<number>()
  const deduped: number[] = []
  for (const frameOrder of frameOrders) {
    if (seen.has(frameOrder)) continue
    seen.add(frameOrder)
    deduped.push(frameOrder)
  }
  return deduped
}

export function generateFrameRange(startFrame: number, endFrame: number, spacing: number) {
  const frames: number[] = []
  for (let frameOrder = startFrame; frameOrder <= endFrame; frameOrder += spacing) {
    frames.push(frameOrder)
  }
  return frames
}

export function generateTimeRange(startTime: number, endTime: number, spacing: number) {
  const timestamps: number[] = []
  const maxIndex = Math.floor((endTime - startTime) / spacing)
  for (let index = 0; index <= maxIndex; index += 1) {
    const timestamp = roundTime(startTime + index * spacing)
    if (timestamp <= endTime + 1e-9) timestamps.push(timestamp)
  }
  return timestamps
}

export function findSpawnRangeVideoMetadata(videoId: string, results: SearchResult[]) {
  const normalizedVideoId = normalizeSubmissionVideoId(videoId)
  if (!normalizedVideoId) return null

  return results.find((result) => {
    const resultVideoId = normalizeSubmissionVideoId(result.video_id || result.payload?.video_id)
    if (resultVideoId !== normalizedVideoId) return false
    const baseTimestamp = resolveTimestamp(result)
    return getCurrentFrameOrder(result, baseTimestamp, baseTimestamp) != null
  }) ?? null
}

export function buildSpawnRangePreview(input: SpawnRangeInput): SpawnRangePreview {
  const errors: string[] = []
  const normalizedVideoId = normalizeSubmissionVideoId(input.videoId)
  let generatedFrameOrders: number[] = []
  let generatedTimestamps: number[] | undefined

  if (!normalizedVideoId) errors.push('Video ID is required.')

  if (input.query.type !== 'KIS' && input.query.type !== 'QA') {
    errors.push('Spawn Range is only available for KIS and Q&A queries.')
  }

  if (input.query.type === 'QA') {
    if (input.answer.length === 0) errors.push('Answer is required.')
    if (input.answer.length > MAX_QA_ANSWER_LENGTH) {
      errors.push(`Answer exceeds ${MAX_QA_ANSWER_LENGTH} characters.`)
    }
  }

  if (input.mode === 'frame') {
    const startFrame = parseNonNegativeInteger(input.startFrame)
    const endFrame = parseNonNegativeInteger(input.endFrame)
    const spacing = parsePositiveInteger(input.frameSpacing)

    if (startFrame == null) errors.push('Enter a valid start frame.')
    if (endFrame == null) errors.push('Enter a valid end frame.')
    if (spacing == null) errors.push('Spacing must be at least 1 frame.')
    if (startFrame != null && endFrame != null && startFrame > endFrame) {
      errors.push('Start Frame must be less than or equal to End Frame.')
    }

    if (errors.length === 0 && startFrame != null && endFrame != null && spacing != null) {
      generatedFrameOrders = generateFrameRange(startFrame, endFrame, spacing)
    }
  } else {
    const startTime = parseNonNegativeFiniteNumber(input.startTime)
    const endTime = parseNonNegativeFiniteNumber(input.endTime)
    const spacing = parsePositiveFiniteNumber(input.timeSpacing)

    if (startTime == null) errors.push('Enter a valid start time.')
    if (endTime == null) errors.push('Enter a valid end time.')
    if (spacing == null) errors.push('Spacing must be greater than 0 seconds.')
    if (startTime != null && endTime != null && startTime > endTime) {
      errors.push('Start Time must be less than or equal to End Time.')
    }
    if (!input.videoMetadata) {
      errors.push('Video metadata is required for time-based spawning.')
    }

    if (errors.length === 0 && startTime != null && endTime != null && spacing != null && input.videoMetadata) {
      generatedTimestamps = generateTimeRange(startTime, endTime, spacing)
      generatedFrameOrders = dedupeFrameOrders(
        generatedTimestamps
          .map((timestamp) => getCurrentFrameOrder(input.videoMetadata, timestamp))
          .filter((frameOrder): frameOrder is number => frameOrder != null),
      )
    }
  }

  const existingKeys = existingFrameKeys(input.query)
  const newFrameOrders = normalizedVideoId
    ? generatedFrameOrders.filter((frameOrder) => !existingKeys.has(`${normalizedVideoId}:${frameOrder}`))
    : []
  const duplicateCount = Math.max(0, generatedFrameOrders.length - newFrameOrders.length)
  const currentCount = input.query.candidates.length
  const wouldExceedLimit = currentCount + newFrameOrders.length > MAX_SUBMISSION_ROWS

  if (generatedFrameOrders.length > 0 && newFrameOrders.length === 0) {
    errors.push('All generated rows already exist in this query.')
  }
  if (wouldExceedLimit) {
    errors.push('This range would exceed the 100-row limit.')
  }

  return {
    errors,
    generatedFrameOrders,
    newFrameOrders,
    duplicateCount,
    currentCount,
    maxRows: MAX_SUBMISSION_ROWS,
    wouldExceedLimit,
    generatedTimestamps,
  }
}

function rangeCandidateId(type: 'KIS' | 'QA', videoId: string, frameOrder: number, index: number) {
  const random = Math.random().toString(36).slice(2, 9)
  return `range-${type.toLowerCase()}-${videoId}-${frameOrder}-${Date.now()}-${index}-${random}`
}

export function createSpawnRangeCandidates(
  query: PackageQuery,
  videoId: string,
  frameOrders: number[],
  answer: string,
): QueryCandidate[] {
  const normalizedVideoId = normalizeSubmissionVideoId(videoId)
  if (!normalizedVideoId || (query.type !== 'KIS' && query.type !== 'QA')) return []

  return frameOrders.map((frameOrder, index) => (
    query.type === 'QA'
      ? {
          id: rangeCandidateId('QA', normalizedVideoId, frameOrder, index),
          type: 'QA' as const,
          videoId: normalizedVideoId,
          frameOrder,
          answer,
        }
      : {
          id: rangeCandidateId('KIS', normalizedVideoId, frameOrder, index),
          type: 'KIS' as const,
          videoId: normalizedVideoId,
          frameOrder,
        }
  ))
}
