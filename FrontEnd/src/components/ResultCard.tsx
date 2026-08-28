import React, { useState, useEffect, useRef, memo } from 'react'
import { ImageOff, Loader2, ScanSearch } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'
import { getImageUrl } from '../utils/media'
import type { SearchResult } from '../store'
import { formatSeconds, getResultCaption, getResultFrameId, getResultImagePath, getResultTimestamp, getResultVideoId } from '../utils/results'
import {
  getActivePackageQuery,
  getSubmissionFrame,
  getSubmissionVideoId,
  packageQueryContainsResult,
  packageQueryHasTrakeVideo,
} from '../utils/submission'

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
  const {
    setPreviewResult,
    addToast,
    addResultToActivePackageQuery,
    teamSubmissionPackage,
    metadataVisibility,
    continuousSearchSourceKey,
    continuousSearchFromResult,
  } = useStore()

  const cardRef = useRef<HTMLDivElement>(null)
  const isVisible = useIntersectionObserver(cardRef, '320px')
  
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const activePackageQuery = getActivePackageQuery(teamSubmissionPackage)
  const candidateVideoId = getSubmissionVideoId(result)
  const isAddedToActiveQuery = packageQueryContainsResult(activePackageQuery, result)
  const isActiveTrakeVideo = packageQueryHasTrakeVideo(activePackageQuery, candidateVideoId)
  const imagePath = getResultImagePath(result)
  const keyframeImageUrl = getImageUrl(imagePath)
  const videoId = getResultVideoId(result)
  const frameId = getResultFrameId(result)
  const frameOrder = getSubmissionFrame(result)
  const timestamp = getResultTimestamp(result)
  const caption = getResultCaption(result)
  const showFps = metadataVisibility.fps !== false
  const visualSearchSourceKey = videoId && frameId ? `${videoId}:${frameId}` : ''
  const isVisualSearchRunning = continuousSearchSourceKey === visualSearchSourceKey
  const isVisualSearchDisabled = Boolean(continuousSearchSourceKey)

  useEffect(() => {
    setImgLoaded(false)
    setImgError(!keyframeImageUrl)
  }, [keyframeImageUrl])

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewResult(result)
  }

  const handleVisualSearch = (e: React.MouseEvent) => {
    e.stopPropagation()
    continuousSearchFromResult(result)
  }

  const handleAddRecheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isAddedToActiveQuery) return
    try {
      addResultToActivePackageQuery(result, {
        confirmCreateTrakeSequence: (currentVideoId, nextVideoId) => (
          window.confirm(`Current TRAKE sequence belongs to ${currentVideoId}. Create a new sequence for ${nextVideoId}?`)
        ),
      })
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
        isAddedToActiveQuery ? 'border-green-500' :
        isActiveTrakeVideo ? 'border-cyan-700/70' :
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
                onClick={handleVisualSearch}
                disabled={isVisualSearchDisabled}
                className="bg-slate-900/80 hover:bg-slate-800 text-white p-1.5 rounded shadow-lg backdrop-blur-sm border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                title="Visual search from this frame"
                aria-label="Visual search from this frame"
              >
                {isVisualSearchRunning ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
              </button>
            </div>

            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-[10px] font-mono text-white px-2 py-0.5 rounded border border-white/10">
              {(result.score || 0).toFixed(4)}
            </div>

            {isAddedToActiveQuery && (
              <div className="absolute bottom-1.5 left-1.5 bg-emerald-700/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded border border-emerald-400/50">
                Active Query
              </div>
            )}
            {!isAddedToActiveQuery && isActiveTrakeVideo && (
              <div className="absolute bottom-1.5 left-1.5 bg-blue-600/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded border border-blue-400/50">
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
                  isAddedToActiveQuery
                    ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300'
                    : 'bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/50 text-blue-300'
                )}
                onClick={handleAddRecheck}
                title="Add to active package query"
              >
                {isAddedToActiveQuery ? 'Added' : '+ Add'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 mt-0.5">
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
