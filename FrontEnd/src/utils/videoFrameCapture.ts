import { getVideoUrl } from './media'

export interface CapturedVideoFrame {
  url: string
  width: number
  height: number
  timestamp: number
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: unknown) => void) => number
}

const MAX_CONCURRENT_CAPTURES = 3
const captureQueue: Array<() => void> = []
let activeCaptures = 0

export function getCachedVideoFrame(videoSource: string, timestamp: number) {
  void videoSource
  void timestamp
  return null
}

function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: number | undefined

    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent)
      target.removeEventListener('error', handleError)
      if (timeoutId != null) window.clearTimeout(timeoutId)
    }

    const handleEvent = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error(`Video ${eventName} failed`))
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, timeoutMs)

    target.addEventListener(eventName, handleEvent, { once: true })
    target.addEventListener('error', handleError, { once: true })
  })
}

function waitForPresentedFrame(video: HTMLVideoElement) {
  const videoWithCallback = video as VideoWithFrameCallback
  if (typeof videoWithCallback.requestVideoFrameCallback !== 'function') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, 250)
    videoWithCallback.requestVideoFrameCallback?.(() => {
      window.clearTimeout(timeoutId)
      resolve()
    })
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas capture failed'))
    }, 'image/jpeg', 0.92)
  })
}

async function decodeVideoFrame(videoSource: string, timestamp: number, fallbackVideoId?: string): Promise<CapturedVideoFrame> {
  const videoUrl = getVideoUrl(videoSource, fallbackVideoId)
  if (!videoUrl) throw new Error('Video URL could not be resolved')

  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true

  try {
    const metadataReady = waitForEvent(video, 'loadedmetadata')
    video.src = videoUrl
    video.load()
    await metadataReady

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const targetTime = duration > 0 ? Math.max(0, Math.min(duration, timestamp)) : Math.max(0, timestamp)

    if (Math.abs(video.currentTime - targetTime) > 0.001) {
      const seeked = waitForEvent(video, 'seeked')
      video.currentTime = targetTime
      await seeked
    } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForEvent(video, 'loadeddata')
    }

    if (Math.abs(video.currentTime - targetTime) > 0.25) {
      throw new Error(`Video seek landed at ${video.currentTime.toFixed(3)} instead of ${targetTime.toFixed(3)}`)
    }

    await waitForPresentedFrame(video)

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('Video frame dimensions unavailable')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')

    context.drawImage(video, 0, 0, width, height)
    const blob = await canvasToBlob(canvas)
    const url = URL.createObjectURL(blob)

    return { url, width, height, timestamp: targetTime }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}

function runNextCapture() {
  while (activeCaptures < MAX_CONCURRENT_CAPTURES && captureQueue.length > 0) {
    const next = captureQueue.shift()
    if (next) next()
  }
}

function enqueueDecode(videoSource: string, timestamp: number, fallbackVideoId?: string) {
  return new Promise<CapturedVideoFrame>((resolve, reject) => {
    captureQueue.push(() => {
      activeCaptures += 1
      decodeVideoFrame(videoSource, timestamp, fallbackVideoId)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeCaptures -= 1
          runNextCapture()
        })
    })
    runNextCapture()
  })
}

export function captureVideoFrame(videoSource: string, timestamp: number, fallbackVideoId?: string) {
  const numericTimestamp = Number(timestamp)
  if (!videoSource || !Number.isFinite(numericTimestamp)) {
    return Promise.reject(new Error('Invalid video frame capture request'))
  }

  return enqueueDecode(videoSource, numericTimestamp, fallbackVideoId)
}
