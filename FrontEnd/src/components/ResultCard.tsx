import React, { useState, useEffect, useRef, memo } from 'react'
import { Maximize2, Search, Plus, CheckCircle, FileVideo, ImageOff, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'
import { getImageUrl } from '../utils/media'
import type { SearchResult } from '../store'

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
  const { currentDataset, currentModel, addToRecheckList, recheckList, setPreviewResult, setSearchResults, setPlayingVideo, addToast, displayMode, mode, trakeState } = useStore()

  const cardRef = useRef<HTMLDivElement>(null)
  const isVisible = useIntersectionObserver(cardRef, '400px') // 400px buffer
  
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // ── Mode-aware selection state ───────────────────────────────
  // KIS/QA: only highlight if the candidate was added IN the current mode
  const isInCurrentModeList = (mode === 'KIS' || mode === 'QA')
    ? recheckList.some((r) => r.id === result.id && r.answerType === mode)
    : false

  // TRAKE: check if this result's video is the selectedVideoId
  const isTrakeVideo = mode === 'TRAKE' && !!trakeState.selectedVideoId
    && result.payload.video_id === trakeState.selectedVideoId

  // TRAKE: check if this exact frame is assigned to an event slot
  const trakeEventLabel = mode === 'TRAKE'
    ? trakeState.events.find(e =>
        e.selectedCandidate &&
        e.selectedCandidate.payload.video_id === result.payload.video_id &&
        String(e.selectedCandidate.payload.frame_id) === String(result.payload.frame_id)
      )?.label ?? null
    : null

  // The generic "isRechecked" (green checkmark on + button) only applies to KIS/QA
  const isRechecked = isInCurrentModeList
  const imagePath = result.image_path || result.payload?.img_link || ''

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(`${result.payload.video_id},${result.payload.frame_id}`)
    addToast('Copied frame ID', 'success')
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewResult(result)
  }

  const handleContinuousSearch = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentDataset || !currentModel) return
    try {
      const { api } = await import('../api')
      const res = await api.continuousSearch(imagePath, currentDataset, currentModel)
      setSearchResults(res.results || [])
      addToast('Similar frames loaded', 'success')
    } catch (err) {
      console.error(err)
      addToast('Similar search failed', 'error')
    }
  }

  const handleAddRecheck = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRechecked) return
    try {
      const mode = useStore.getState().mode
      const answerType = mode as any
      
      const item = {
        id: result.id || `${result.payload?.video_id}_${result.payload?.frame_id}_${Date.now()}`,
        img_link: imagePath,
        payload: result.payload,
        answerType
      }
      
      const { api } = await import('../api')
      api.addRecheck(item).catch(console.error)

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
            {!imgError && (
              <img
                src={getImageUrl(imagePath)}
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
                onClick={handleContinuousSearch}
                className="bg-slate-900/80 hover:bg-slate-800 text-white p-1.5 rounded shadow-lg backdrop-blur-sm border border-slate-700 transition-colors"
                title="Find Similar"
              >
                <Search size={14} />
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
                    ? (trakeState.stage === 1 ? `Select ${result.payload.video_id} as TRAKE video` : `Assign to active event`)
                    : 'Add to Answer Builder'
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
            <div className="flex justify-between items-center gap-1">
              <span className="truncate text-slate-300 font-medium font-sans flex-1" title={result.payload?.video_id}>
                {result.payload?.video_id}
              </span>
              <button className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-[9px] shrink-0 cursor-copy hover:text-white" onClick={handleCopyId} title="Copy ID">
                {result.payload?.frame_id}
              </button>
            </div>

            {displayMode === 'full' && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                <span className="bg-blue-900/40 text-blue-300 border border-blue-800/50 px-1 rounded text-[8px] uppercase tracking-wider">
                  {currentDataset?.startsWith('AIC2026') ? 'AIC' : 'LSC'}
                </span>
                <span className="bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 px-1 rounded text-[8px] uppercase tracking-wider">
                  {currentModel?.includes('siglip') ? 'SIGLIP' : 'CLIP'}
                </span>
                {result.payload?.ocr && (
                  <span className="bg-emerald-900/40 text-emerald-300 border border-emerald-800/50 px-1 rounded text-[8px] uppercase tracking-wider">
                    OCR
                  </span>
                )}
                {result.payload?.asr && (
                  <span className="bg-amber-900/40 text-amber-300 border border-amber-800/50 px-1 rounded text-[8px] uppercase tracking-wider">
                    ASR
                  </span>
                )}
                {result.payload?.people_count != null && (
                  <span className="bg-purple-900/40 text-purple-300 border border-purple-800/50 px-1 rounded text-[8px] uppercase tracking-wider">
                    {result.payload.people_count}p
                  </span>
                )}
                {result.payload?.caption && (
                  <span className="text-slate-500 text-[8px] italic truncate w-full mt-0.5" title={result.payload.caption}>
                    {result.payload.caption.slice(0, 60)}{result.payload.caption.length > 60 ? '…' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ aspectRatio: '16 / 9', minHeight: '130px' }} className="w-full bg-slate-900 animate-pulse"></div>
      )}
    </div>
  )
})
