import { normalizeSubmissionVideoId } from '../../utils/submission'

export type CandidateMoveDirection = 'up' | 'down'

export function normalizePackageVideoId(value: string) {
  return normalizeSubmissionVideoId(value)
}

export function parseFrameOrderInput(value: string): number | '' {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^\d+$/.test(trimmed) ? Number(trimmed) : ''
}
