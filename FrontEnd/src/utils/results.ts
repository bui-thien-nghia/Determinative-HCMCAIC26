import type { SearchResult } from '../store'

type TimestampResolvable = {
  timestamp?: number | null
  payload?: {
    time_order?: number | null
    timestamp?: number | null
  } | null
}

export function getResultVideoId(result?: SearchResult | null) {
  return result?.video_id || result?.payload?.video_id || ''
}

export function getResultFrameId(result?: SearchResult | null) {
  const frameId = result?.payload?.frame_id
  return frameId == null ? '' : String(frameId)
}

export function resolveTimestamp(result?: TimestampResolvable | null): number {
  const payload = result?.payload

  if (typeof payload?.time_order === 'number') {
    return payload.time_order
  }

  if (typeof payload?.timestamp === 'number') {
    return payload.timestamp
  }

  if (typeof result?.timestamp === 'number') {
    return result.timestamp
  }

  return 0
}

export function getResultTimestamp(result?: SearchResult | null) {
  return resolveTimestamp(result)
}

export function getResultScore(result?: SearchResult | null) {
  const numeric = Number(result?.score)
  return Number.isFinite(numeric) ? numeric : 0
}

export function getResultCaption(result?: SearchResult | null) {
  const candidates = [
    result?.payload?.caption,
    result?.payload?.transcript,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

export function getResultImagePath(result?: SearchResult | null) {
  return result?.payload?.img_link || result?.image_path || ''
}

export function getRawImagePath(result?: SearchResult | null) {
  return getResultImagePath(result)
}

export function getResultVideoPath(result?: SearchResult | null) {
  return result?.payload?.video_path || ''
}

export function getPortableImagePath(path?: string | null) {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  const marker = '/imgs/'
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex !== -1) {
    return normalized.slice(markerIndex + marker.length)
  }

  const looseMarker = 'imgs/'
  const looseIndex = normalized.indexOf(looseMarker)
  if (looseIndex !== -1) {
    return normalized.slice(looseIndex + looseMarker.length)
  }

  return normalized
}

export async function copyText(text: string) {
  if (!text) return false
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

export function formatSeconds(seconds: number | null | undefined, decimals = 2) {
  const numeric = Number(seconds)
  if (!Number.isFinite(numeric)) return '--'
  const safeDecimals = Math.max(0, Math.min(6, Math.floor(decimals)))
  return `${numeric.toFixed(safeDecimals)}s`
}

export function parseTimestampInput(input: string) {
  const value = input.trim()
  if (!value) return null
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}
