const AIC_MEDIA_PREFIX = '/__aic_media__/'
const AIC_VIDEO_PREFIX = '/__aic_video__/'
const AIC_NEIGHBORS_PREFIX = '/__aic_neighbors__/'
const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]+$/
const DATASET_DIRS = ['imgs', 'vids', 'maps', 'mets', 'trans', 'feats']

function getDatasetRelativePath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const match = normalized.match(/(?:^|\/)(imgs|vids|maps|mets|trans|feats)\/(.+)$/)
  if (!match) return ''

  const relativePath = `${match[1]}/${match[2]}`
  const segments = relativePath.split('/').filter(Boolean)
  if (
    segments.length < 2 ||
    !DATASET_DIRS.includes(segments[0]) ||
    segments.some((segment) => segment === '..' || segment === '.')
  ) {
    return ''
  }

  return relativePath
}

export interface NeighborFrame {
  id: string
  score: number
  video_id: string
  timestamp?: number | null
  image_path: string
  payload: {
    video_id: string
    frame_id: string
    img_link: string
    timestamp?: number | null
    time_order?: number | null
    frame_order?: number | null
    fps?: number | null
    caption?: string
    model?: string
  }
}

export function getMediaUrl(path?: string | null) {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  if (path.startsWith(AIC_MEDIA_PREFIX) || path.startsWith('/static/') || path.startsWith('/media/')) return path

  const relativePath = getDatasetRelativePath(path)
  if (!relativePath) return ''
  const segments = relativePath.split('/').filter(Boolean)

  return `${AIC_MEDIA_PREFIX}${segments.map(encodeURIComponent).join('/')}`
}

export function getImageUrl(path?: string | null) {
  return getMediaUrl(path)
}

export function resolveVideoUrl(videoId?: string | null) {
  if (!videoId || !SAFE_VIDEO_ID.test(videoId)) return null
  return `${AIC_VIDEO_PREFIX}${encodeURIComponent(videoId)}`
}

export function getVideoUrl(videoPath?: string | null, fallbackVideoId?: string | null) {
  const mediaUrl = getMediaUrl(videoPath)
  if (mediaUrl) return mediaUrl
  return resolveVideoUrl(fallbackVideoId)
}

export async function getNeighborKeyframes(videoId: string, frameId: string, limit = 3) {
  if (!SAFE_VIDEO_ID.test(videoId) || !/^[A-Za-z0-9_-]+$/.test(frameId)) {
    return []
  }

  const clampedLimit = Math.max(1, Math.min(10, Math.floor(limit)))
  const response = await fetch(
    `${AIC_NEIGHBORS_PREFIX}${encodeURIComponent(videoId)}/${encodeURIComponent(frameId)}?limit=${clampedLimit}`,
  )

  if (!response.ok) {
    throw new Error(`Neighbor lookup failed (${response.status})`)
  }

  const data = await response.json()
  return Array.isArray(data.frames) ? data.frames as NeighborFrame[] : []
}
