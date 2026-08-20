import React, { useState, useEffect, useRef, memo } from 'react'
import { Maximize2, Plus, CheckCircle, FileVideo, ImageOff, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'
import { getImageUrl } from '../utils/media'
import type { SearchResult } from '../store'
import { formatSeconds, getResultCaption, getResultFrameId, getResultImagePath, getResultTimestamp, getResultVideoId } from '../utils/results'
import { getSubmissionFrame, getSubmissionKey, getSubmissionVideoId } from '../utils/submission'

function useIntersectionObserver(ref: React.RefObject<Element | null>, rootMargin = '400px') {
  const [isIntersecting, setIntersecting] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting)
      },
      { rootMargin }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref, rootMargin])

  return isIntersecting
}

export const ResultCard = memo(({ result }: { result: SearchResult }) => {
  const { recheckList, setPreviewResult, setPlayingVideo, addToast, mode, trakeState, metadataVisibility, setTrakeSelectedVideo } = useStore()

  const cardRef = useRef<HTMLDivElement>(null)
  const isVisible = useIntersectionObserver(cardRef, '320px')
  
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [frameOrderCopied, setFrameOrderCopied] = useState(false)

  // ── Mode-aware selection state ───────────────────────────────
  // KIS/QA: only highlight if the candidate was added IN the current mode
  const submissionKey = getSubmissionKey(result)
  const candidateVideoId = getSubmissionVideoId(result)
  const isInCurrentModeList = (mode === 'KIS' || mode === 'QA')
    ? recheckList.some((r) => getSubmissionKey(r) === submissionKey && r.answerType === mode)
    : false

  // TRAKE: check if this result's video is the selectedVideoId
  const isTrakeVideo = mode === 'TRAKE' && !!trakeState.selectedVideoId
    && candidateVideoId === trakeState.selectedVideoId

  // TRAKE: check if this exact frame is assigned to an event slot
  const trakeEventLabel = mode === 'TRAKE'
    ? trakeState.events.find(e =>
        e.selectedCandidate &&
        getSubmissionKey(e.selectedCandidate) === submissionKey
      )?.label ?? null
    : null

  // The generic "isRechecked" (green checkmark on + button) only applies to KIS/QA
  const isRechecked = isInCurrentModeList
  const imagePath = getResultImagePath(result)
  const keyframeImageUrl = getImageUrl(imagePath)
  const videoId = getResultVideoId(result)
  const frameId = getResultFrameId(result)
  const frameOrder = getSubmissionFrame(result)
  const timestamp = getResultTimestamp(result)
  const caption = getResultCaption(result)
  const showFps = metadataVisibility.fps !== false

  useEffect(() => {
    setImgLoaded(false)
    setImgError(!keyframeImageUrl)
  }, [keyframeImageUrl])

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (frameOrder == null) {
      addToast('Cannot copy: frame_order is missing', 'error')
      return
    }
    navigator.clipboard.writeText(String(frameOrder))
      .then(() => {
        setFrameOrderCopied(true)
        window.setTimeout(() => setFrameOrderCopied(false), 1200)
      })
      .catch(() => addToast('Copy failed', 'error'))
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewResult(result)
  }

  const handleAddRecheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRechecked) return
    try {
      if (mode === 'TRAKE') {
        const nextVideoId = videoId?.replace(/\.mp4$/i, '')
        if (!nextVideoId) {
          addToast('Cannot use video: video_id is missing', 'error')
          return
        }
        if (trakeState.selectedVideoId && trakeState.selectedVideoId !== nextVideoId) {
          const replace = window.confirm(`Replace TRAKE Video ID ${trakeState.selectedVideoId} with ${nextVideoId}?`)
          if (!replace) return
        }
        setTrakeSelectedVideo(nextVideoId)
        addToast(`TRAKE Video ID set to ${nextVideoId}`, 'success')
        return
      }
      useStore.getState().addCandidate(result)
    } catch (err) {
      console.error(err)
      addToast('Add failed', 'error')
    }
  }

  // To maintain grid layout, we always render the card shell, but only render content if visible
  return (
    <div
      ref={cardRef}
      onClick={handlePreview}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(result))
      }}
      className={clsx(
        'group flex flex-col bg-slate-800 border rounded-lg overflow-hidden cursor-pointer transition-colors shadow-sm h-full',
        // KIS/QA selected candidate
        isInCurrentModeList ? 'border-green-500' :
        // TRAKE assigned event frame
        trakeEventLabel ? 'border-blue-500' :
        // TRAKE selected video (subtle)
        isTrakeVideo ? 'border-cyan-700/70' :
        'border-slate-700 hover:border-blue-500 cursor-grab active:cursor-grabbing'
      )}
    >
      {isVisible ? (
        <>
          <div className="relative w-full bg-slate-950 block overflow-hidden" style={{ aspectRatio: '16 / 9', minHeight: '130px' }}>
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <Loader2 size={24} className="text-slate-600 animate-spin" />
              </div>
            )}
            {imgError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-500">
                <ImageOff size={24} className="mb-2 opacity-50" />
                <span className="text-[10px] uppercase tracking-wider">Image Broken</span>
              </div>
            )}
            {keyframeImageUrl && !imgError && (
              <img
                src={keyframeImageUrl}
                alt={`Frame ${result.payload?.frame_id}`}
                className={clsx(
                  "absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                  !imgLoaded && "opacity-0"
                )}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgError(true)
                  setImgLoaded(true) // stop showing loader
                }}
              />
            )}

            <div className="absolute top-2 right-2 flex flex-col gap-1.5 translate-x-8 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPlayingVideo(result)
                }}
                className="bg-slate-900/80 hover:bg-slate-800 text-white p-1.5 rounded shadow-lg backdrop-blur-sm border border-slate-700 transition-colors"
                title="Watch Video"
              >
                <FileVideo size={14} />
              </button>
              <button
                onClick={handleAddRecheck}
                className={clsx(
                  'p-1.5 rounded shadow-lg backdrop-blur-sm border transition-colors text-white',
                  trakeEventLabel ? 'bg-blue-700 border-blue-500' :
                  isRechecked ? 'bg-green-600 border-green-500' : 'bg-blue-600/90 hover:bg-blue-500 border-blue-500'
                )}
                title={
                  mode === 'TRAKE'
                    ? 'Use this result video for TRAKE'
                    : 'Add to CSV'
                }
              >
                {trakeEventLabel ? <CheckCircle size={14} /> : isRechecked ? <CheckCircle size={14} /> : <Plus size={14} />}
              </button>
              <button
                onClick={handlePreview}
                className="bg-slate-900/80 hover:bg-slate-800 text-white p-1.5 rounded shadow-lg backdrop-blur-sm border border-slate-700 transition-colors"
                title="Expand preview"
              >
                <Maximize2 size={14} />
              </button>
            </div>

            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-[10px] font-mono text-white px-2 py-0.5 rounded border border-white/10">
              {(result.score || 0).toFixed(4)}
            </div>

            {/* TRAKE badges — bottom-left of image */}
            {trakeEventLabel && (
              <div className="absolute bottom-1.5 left-1.5 bg-blue-600/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded border border-blue-400/50">
                {trakeEventLabel}
              </div>
            )}
            {isTrakeVideo && !trakeEventLabel && (
              <div className="absolute bottom-1.5 left-1.5 bg-cyan-900/80 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-700/60">
                TRAKE VIDEO
              </div>
            )}
          </div>

          <div className="p-2 text-[10px] text-slate-400 font-mono flex flex-col gap-1.5 bg-slate-900/50 flex-1">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-300 font-medium font-sans" title={videoId}>
                  Video: {videoId || result.payload?.video_id}
                </div>
                <div className={`text-[10px] font-mono ${frameOrder == null ? 'text-red-400' : 'text-blue-300'}`}>
                  Frame Idx: {frameOrder ?? 'missing'}
                </div>
                {frameId && (
                  <div className="text-[8px] text-slate-600 font-mono">
                    keyframe {frameId}
                  </div>
                )}
              </div>
              <button
                className={clsx(
                  'px-2 py-1 rounded border text-[9px] shrink-0 font-bold uppercase transition-colors',
                  isRechecked || trakeEventLabel
                    ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300'
                    : 'bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/50 text-blue-300'
                )}
                onClick={handleAddRecheck}
                title={mode === 'TRAKE' ? 'Use this result video for TRAKE' : 'Add to active CSV'}
              >
                {isRechecked || trakeEventLabel ? 'Added' : mode === 'TRAKE' ? 'Use Video' : '+ Add'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1 mt-0.5">
              <button
                disabled={frameOrder == null}
                className={clsx(
                  'bg-slate-800 border border-slate-700 px-1 rounded text-[8px] uppercase tracking-wider',
                  frameOrder == null ? 'text-slate-600 cursor-not-allowed opacity-50' : 'text-slate-400 hover:text-white cursor-copy'
                )}
                onClick={handleCopyId}
                title="Copy payload.frame_order"
              >
                {frameOrderCopied ? 'Copied' : 'Copy Frame Order'}
              </button>
              <span className="bg-slate-800 text-slate-300 border border-slate-700 px-1 rounded text-[8px] uppercase tracking-wider">
                {formatSeconds(timestamp)}
              </span>
              {showFps && typeof result.payload?.fps === 'number' && (
                <span className="bg-slate-800 text-slate-400 border border-slate-700 px-1 rounded text-[8px] uppercase tracking-wider">
                  {result.payload.fps} FPS
                </span>
              )}
              {caption && (
                <span className="text-slate-500 text-[8px] italic truncate w-full mt-0.5" title={caption}>
                  {caption.slice(0, 60)}{caption.length > 60 ? '...' : ''}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div style={{ aspectRatio: '16 / 9', minHeight: '130px' }} className="w-full bg-slate-900 animate-pulse"></div>
      )}
    </div>
  )
})
