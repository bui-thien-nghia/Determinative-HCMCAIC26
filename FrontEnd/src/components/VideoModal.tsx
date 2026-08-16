import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore, type SearchResult } from '../store'
import { getImageUrl, resolveVideoUrl } from '../utils/media'
import { formatSeconds, getRawImagePath, getResultFrameId, getResultTimestamp, parseTimestampInput } from '../utils/results'

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
  const { addCandidate, recheckList } = useStore()
  const selectedTimestamp = result ? getResultTimestamp(result) : Number(timestamp || 0)
  const [currentTime, setCurrentTime] = useState(selectedTimestamp)
  const [duration, setDuration] = useState(0)
  const [timeInput, setTimeInput] = useState(String(Number.isFinite(selectedTimestamp) ? selectedTimestamp : 0))
  const [inputError, setInputError] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [editingTime, setEditingTime] = useState(false)

  const frameId = getResultFrameId(result)
  const imagePath = getRawImagePath(result)
  const videoUrl = resolveVideoUrl(videoId)
  const selectedTimeLabel = formatSeconds(selectedTimestamp)
  const isAdded = !!result && recheckList.some((item) => item.id === result.id)
  const offset = currentTime - selectedTimestamp
  const offsetLabel = Math.abs(offset) < 0.005 ? '±0.00s' : `${offset > 0 ? '+' : ''}${offset.toFixed(2)}s`

  const clampTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return 0
    if (duration > 0) return Math.max(0, Math.min(duration, seconds))
    return Math.max(0, seconds)
  }

  const seekTo = (seconds: number, updateInput = true) => {
    const nextTime = clampTime(seconds)
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = nextTime
      } catch {
        setInputError('Unable to seek yet. Wait for video metadata to load.')
      }
    }
    setCurrentTime(nextTime)
    if (updateInput) setTimeInput(nextTime.toFixed(2))
  }

  const seekBy = (seconds: number) => {
    seekTo(currentTime + seconds)
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

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
    setDuration(nextDuration)
    const nextTime = nextDuration > 0 ? Math.min(selectedTimestamp, nextDuration) : selectedTimestamp
    try {
      video.currentTime = nextTime
      video.pause()
    } catch {
      // Browser may defer seeking until the media buffer is ready.
    }
    setCurrentTime(nextTime)
    setTimeInput(nextTime.toFixed(2))
  }

  const handleAddToBuilder = () => {
    if (!result) return
    addCandidate(result)
  }

  useEffect(() => {
    if (!isOpen) return
    setCurrentTime(selectedTimestamp)
    setTimeInput(String(Number.isFinite(selectedTimestamp) ? selectedTimestamp : 0))
    setInputError(null)
    setVideoError(false)
    setDuration(0)
  }, [isOpen, selectedTimestamp, videoId])

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
              onClick={handleAddToBuilder}
              disabled={!result}
              className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Plus size={13} />
              {isAdded ? 'ADDED ✓' : 'ADD'}
            </button>
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
              {inputError && <span className="text-amber-400">{inputError}</span>}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-1.5">
          {videoUrl && !videoError ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              preload="metadata"
              className="h-auto max-h-[62vh] w-full rounded bg-black object-contain"
              onLoadedMetadata={handleLoadedMetadata}
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
