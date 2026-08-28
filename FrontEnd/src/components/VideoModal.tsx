import { Copy, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore, type SearchResult } from '../store'
import { getImageUrl, getVideoUrl } from '../utils/media'
import {
  copyText,
  formatSeconds,
  getCurrentFrameOrder,
  getRawImagePath,
  getResultFrameId,
  getResultVideoPath,
  parseTimestampInput,
  resolveTimestamp,
} from '../utils/results'
import {
  getActivePackageQuery,
  normalizeSubmissionVideoId,
  packageQueryContainsFrame,
} from '../utils/submission'

type VideoModalProps = {
  isOpen: boolean
  onClose: () => void
  videoId: string
  timestamp: number
  result?: SearchResult | null
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

export default function VideoModal({
  isOpen,
  onClose,
  videoId,
  timestamp,
  result,
}: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoRequestRef = useRef(0)
  const { addResultToActivePackageQuery, addToast, teamSubmissionPackage } = useStore()
  const selectedTimestamp = result ? resolveTimestamp(result) : Number(timestamp || 0)
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [timeInput, setTimeInput] = useState(String(Number.isFinite(selectedTimestamp) ? selectedTimestamp : 0))
  const [inputError, setInputError] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [editingTime, setEditingTime] = useState(false)
  const [currentFrameCopied, setCurrentFrameCopied] = useState(false)

  const frameId = getResultFrameId(result)
  const imagePath = getRawImagePath(result)
  const videoUrl = getVideoUrl(getResultVideoPath(result), videoId)
  const videoSourceKey = videoUrl || ''
  const resultSeekKey = `${result?.id ?? videoId}|${videoSourceKey}|${selectedTimestamp}`
  const selectedTimeLabel = formatSeconds(selectedTimestamp)
  const offset = currentTime == null ? null : currentTime - selectedTimestamp
  const offsetLabel = offset == null
    ? '-- from frame'
    : Math.abs(offset) < 0.005 ? '±0.00s' : `${offset > 0 ? '+' : ''}${offset.toFixed(2)}s`
  const currentFrameOrder = getCurrentFrameOrder(result, currentTime, selectedTimestamp)
  const currentFrameOrderLabel = currentFrameOrder == null ? '--' : String(currentFrameOrder)
  const activePackageQuery = getActivePackageQuery(teamSubmissionPackage)
  const isAdded = packageQueryContainsFrame(activePackageQuery, videoId, currentFrameOrder)

  const clampTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return 0
    if (duration > 0) return Math.max(0, Math.min(duration, seconds))
    return Math.max(0, seconds)
  }

  const seekTo = (seconds: number, updateInput = true) => {
    const nextTime = clampTime(seconds)
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) {
      setInputError('Unable to seek yet. Wait for video metadata to load.')
      return
    }

    const requestId = videoRequestRef.current + 1
    videoRequestRef.current = requestId
    let timeoutId: number | undefined

    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      if (timeoutId != null) window.clearTimeout(timeoutId)
    }
    const handleSeeked = () => {
      cleanup()
      if (requestId !== videoRequestRef.current) return
      const actual = video.currentTime
      setCurrentTime(actual)
      if (updateInput && !editingTime) setTimeInput(actual.toFixed(2))
      setInputError(null)
    }
    const handleError = () => {
      cleanup()
      if (requestId !== videoRequestRef.current) return
      setInputError('Unable to seek video.')
    }
    const handleTimeout = () => {
      cleanup()
      if (requestId !== videoRequestRef.current) return
      const actual = video.currentTime
      setCurrentTime(actual)
      setInputError(`Video seek did not complete; current position is ${formatSeconds(actual)}.`)
    }

    try {
      video.addEventListener('seeked', handleSeeked, { once: true })
      video.addEventListener('error', handleError, { once: true })
      timeoutId = window.setTimeout(handleTimeout, 4000)
      video.currentTime = nextTime
      if (Math.abs(video.currentTime - nextTime) <= 0.001) {
        handleSeeked()
      }
    } catch {
      cleanup()
      setInputError('Unable to seek yet. Wait for video metadata to load.')
    }
  }

  const seekBy = (seconds: number) => {
    seekTo((currentTime ?? 0) + seconds)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }

  const handleGo = () => {
    const parsed = parseTimestampInput(timeInput)
    if (parsed == null) {
      setInputError('Enter seconds only.')
      return
    }

    if (duration > 0 && parsed > duration) {
      setInputError(`Clamped to ${formatSeconds(duration)}.`)
    } else {
      setInputError(null)
    }

    seekTo(parsed)
  }

  const handleAddToBuilder = () => {
    if (!result) return
    addResultToActivePackageQuery(result, {
      frameOrderOverride: currentFrameOrder,
      confirmCreateTrakeSequence: (currentVideoId, nextVideoId) => (
        window.confirm(`Current TRAKE sequence belongs to ${currentVideoId}. Create a new sequence for ${nextVideoId}?`)
      ),
    })
  }

  const handleCopyCurrentFrameOrder = async () => {
    if (currentFrameOrder == null) return
    const rowText = `${normalizeSubmissionVideoId(videoId)},${currentFrameOrder}`
    const copied = await copyText(rowText)
    if (!copied) return
    addToast(`Copied ${rowText}`, 'success')
    setCurrentFrameCopied(true)
    window.setTimeout(() => setCurrentFrameCopied(false), 1200)
  }

  useEffect(() => {
    if (!isOpen) return
    videoRequestRef.current += 1
    setCurrentTime(null)
    setTimeInput(String(Number.isFinite(selectedTimestamp) ? selectedTimestamp : 0))
    setInputError(null)
    setVideoError(false)
    setDuration(0)
    setCurrentFrameCopied(false)
  }, [isOpen, resultSeekKey, selectedTimestamp])

  useEffect(() => {
    setCurrentFrameCopied(false)
  }, [currentFrameOrder])

  useEffect(() => {
    if (!isOpen || !videoUrl) return

    let cancelled = false
    const requestId = videoRequestRef.current + 1
    videoRequestRef.current = requestId
    const video = videoRef.current

    if (!video) return

    const cleanupFns: Array<() => void> = []
    const isCurrentRequest = () => !cancelled && requestId === videoRequestRef.current

    const waitForVideoEvent = (eventName: string, timeoutMs = 8000) => (
      new Promise<void>((resolve, reject) => {
        let timeoutId: number | undefined
        const cleanup = () => {
          video.removeEventListener(eventName, handleEvent)
          video.removeEventListener('error', handleError)
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

        video.addEventListener(eventName, handleEvent, { once: true })
        video.addEventListener('error', handleError, { once: true })
        cleanupFns.push(cleanup)
      })
    )

    const loadAndSeek = async () => {
      try {
        video.pause()
        video.src = videoUrl
        const metadataReady = waitForVideoEvent('loadedmetadata')
        video.load()

        await metadataReady
        if (!isCurrentRequest()) return

        const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
        const targetTime = nextDuration > 0
          ? Math.max(0, Math.min(selectedTimestamp, nextDuration))
          : Math.max(0, selectedTimestamp)
        setDuration(nextDuration)

        if (Math.abs(video.currentTime - targetTime) > 0.001) {
          const seeked = waitForVideoEvent('seeked')
          video.currentTime = targetTime
          await seeked
        }
        if (!isCurrentRequest()) return

        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await waitForVideoEvent('canplay', 3000).catch(() => undefined)
        }
        if (!isCurrentRequest()) return

        const actualTime = video.currentTime
        video.pause()
        setCurrentTime(actualTime)
        setTimeInput(actualTime.toFixed(2))
        setInputError(null)

        if (Math.abs(actualTime - targetTime) > 0.25) {
          setInputError(`Video seek landed at ${formatSeconds(actualTime)} instead of ${formatSeconds(targetTime)}.`)
        }
      } catch (error) {
        if (!isCurrentRequest()) return
        setVideoError(true)
        setInputError(error instanceof Error ? error.message : 'Unable to load video.')
      }
    }

    loadAndSeek()

    return () => {
      cancelled = true
      cleanupFns.forEach((cleanup) => cleanup())
    }
  }, [isOpen, resultSeekKey, selectedTimestamp, videoUrl])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (isEditableTarget(e.target)) return

      const key = e.key.toLowerCase()
      if (e.code === 'Space' || key === 'k') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (key === 'j') {
        e.preventDefault()
        seekBy(-5)
        return
      }
      if (key === 'l') {
        e.preventDefault()
        seekBy(5)
        return
      }
      if (key === 's') {
        e.preventDefault()
        seekTo(selectedTimestamp)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, currentTime, selectedTimestamp, duration])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-5"
      onClick={onClose}
    >
      <div
        className="relative flex w-[min(1050px,90vw)] max-h-[88vh] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-white">{videoId}</div>
            <div className="mt-1 text-xs text-slate-400">
              Frame <span className="font-mono text-slate-200">{frameId || 'N/A'}</span>
              <span className="px-2 text-slate-600">•</span>
              <span className="font-mono text-blue-300">{selectedTimeLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onClose}
              className="rounded bg-slate-800 p-1.5 text-slate-300 transition hover:bg-red-600 hover:text-white"
              title="Close video"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {videoUrl && !videoError && (
          <div className="border-b border-slate-800 bg-slate-900 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => seekBy(-20)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                -20
              </button>
              <button
                onClick={() => seekBy(-10)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                -10
              </button>
              <button
                onClick={() => seekBy(-2)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                -2
              </button>
              <button
                onClick={() => seekBy(-1)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                -1
              </button>
              <input
                value={timeInput}
                onChange={(event) => {
                  setTimeInput(event.target.value)
                  setInputError(null)
                }}
                onFocus={() => setEditingTime(true)}
                onBlur={() => setEditingTime(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleGo()
                }}
                placeholder="Second"
                className="w-24 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-blue-500"
                aria-label="Jump to second"
              />
              <button
                onClick={handleGo}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                GO
              </button>
              <button
                onClick={() => seekBy(1)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                +1
              </button>
              <button
                onClick={() => seekBy(2)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                +2
              </button>
              <button
                onClick={() => seekBy(10)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                +10
              </button>
              <button
                onClick={() => seekBy(20)}
                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                +20
              </button>
              <button
                onClick={() => seekTo(selectedTimestamp)}
                className="rounded border border-blue-500/60 bg-blue-950/30 px-2.5 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-900/40"
                title="Return to retrieved frame timestamp"
              >
                ↶ FRAME
              </button>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-mono text-slate-300">
                Frame {selectedTimeLabel}
              </span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-300">
                Current {formatSeconds(currentTime)}
              </span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-500">
                {offsetLabel} from frame
              </span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-emerald-300">
                Current Frame Idx: {currentFrameOrderLabel}
              </span>
              <button
                onClick={handleCopyCurrentFrameOrder}
                disabled={currentFrameOrder == null}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300 transition hover:border-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Copy video ID + current Frame Idx"
              >
                <Copy size={11} />
                {currentFrameCopied ? 'Copied' : 'Copy Row'}
              </button>
              <button
                onClick={handleAddToBuilder}
                disabled={!result || currentFrameOrder == null}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                title="Add current frame to active query"
                aria-label="Add current frame to active query"
              >
                <Plus size={11} />
                {isAdded ? 'Added' : 'Add Frame'}
              </button>
              {inputError && <span className="text-amber-400">{inputError}</span>}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-1.5">
          {videoUrl && !videoError ? (
            <video
              key={videoSourceKey}
              ref={videoRef}
              src={videoUrl}
              controls
              preload="metadata"
              className="h-auto max-h-[62vh] w-full rounded bg-black object-contain"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                setDuration(Number.isFinite(video.duration) ? video.duration : 0)
                setCurrentTime(video.currentTime)
              }}
              onSeeked={(event) => {
                const actual = event.currentTarget.currentTime
                setCurrentTime(actual)
                if (!editingTime) setTimeInput(actual.toFixed(2))
              }}
              onTimeUpdate={(event) => {
                const nextTime = event.currentTarget.currentTime
                setCurrentTime(nextTime)
                if (!editingTime) setTimeInput(nextTime.toFixed(2))
              }}
              onError={() => setVideoError(true)}
            />
          ) : imagePath ? (
            <div className="flex w-full flex-col items-center gap-3">
              <img
                src={getImageUrl(imagePath)}
                alt="Selected keyframe"
                className="max-h-[62vh] w-full object-contain rounded bg-black"
              />
              <div className="rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                Local video file could not be resolved for this video.
              </div>
            </div>
          ) : (
            <div className="flex h-64 w-full items-center justify-center text-slate-500">
              Local video file could not be resolved for this video.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
