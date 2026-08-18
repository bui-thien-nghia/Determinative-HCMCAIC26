import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, Map, MessageSquare, Type, FileVideo, Copy, Loader2 } from 'lucide-react'
import { useStore, type SearchResult } from '../store'
import { getImageUrl, getNeighborKeyframes, type NeighborFrame } from '../utils/media'
import { captureVideoFrame, getCachedVideoFrame, type CapturedVideoFrame } from '../utils/videoFrameCapture'
import {
  copyText,
  formatSeconds,
  getPortableImagePath,
  getRawImagePath,
  getResultCaption,
  getResultFrameId,
  getResultScore,
  getResultTimestamp,
  getResultVideoId,
} from '../utils/results'

export default function PreviewModal() {
  const {
    previewResult,
    setPreviewResult,
    searchResults,
    setPlayingVideo,
    addToast,
    addCandidate,
    lastSearch,
    mode,
    recheckList,
    updateRecheckItemAnswer,
  } = useStore()
  const [activeTab, setActiveTab] = useState('Overview')
  const [neighbors, setNeighbors] = useState<NeighborFrame[]>([])
  const [neighborsLoading, setNeighborsLoading] = useState(false)
  const [neighborsError, setNeighborsError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [qaAnswer, setQaAnswer] = useState('')
  const [capturedFrame, setCapturedFrame] = useState<CapturedVideoFrame | null>(null)
  const [capturedFrameKey, setCapturedFrameKey] = useState('')
  const [captureState, setCaptureState] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle')
  const [captureStateKey, setCaptureStateKey] = useState('')

  const currentIndex = searchResults.findIndex(r => r.id === previewResult?.id)
  const videoId = getResultVideoId(previewResult)
  const frameId = getResultFrameId(previewResult)
  const timestamp = getResultTimestamp(previewResult)
  const caption = getResultCaption(previewResult)
  const imagePath = getRawImagePath(previewResult)
  const portableImagePath = getPortableImagePath(imagePath)
  const existingCandidate = previewResult
    ? recheckList.find((item) => item.id === previewResult.id)
    : undefined

  const currentNeighborKey = useMemo(() => `${videoId}:${frameId}`, [videoId, frameId])
  const captureKey = useMemo(() => (
    videoId && Number.isFinite(timestamp) ? `${videoId}:${timestamp.toFixed(3)}` : ''
  ), [videoId, timestamp])

  const goPrevious = () => {
    if (currentIndex > 0) setPreviewResult(searchResults[currentIndex - 1])
  }

  const goNext = () => {
    if (currentIndex < searchResults.length - 1) setPreviewResult(searchResults[currentIndex + 1])
  }

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation()
    goPrevious()
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    goNext()
  }

  const handleClose = () => setPreviewResult(null)

  const handleAddToBuilder = () => {
    if (!previewResult) return
    addCandidate(previewResult)
  }

  const handleCopy = async (value: string, label: string) => {
    if (!value) return
    const copied = await copyText(value)
    if (copied) {
      setCopiedField(label)
      addToast(`Copied ${label}`, 'success')
      window.setTimeout(() => setCopiedField(null), 1200)
    }
  }

  const handleAddQaCandidate = () => {
    if (!previewResult || mode !== 'QA') return
    addCandidate(previewResult)
    const qaCandidate = useStore.getState().recheckList.find((item) => (
      item.id === previewResult.id && item.answerType === 'QA'
    ))
    if (qaCandidate && qaAnswer.trim()) {
      updateRecheckItemAnswer(previewResult.id, qaAnswer)
    }
  }

  const handleNeighborClick = (neighbor: NeighborFrame) => {
    if (!previewResult) return
    const sameFrame = neighbor.payload.frame_id === frameId
    const nextResult: SearchResult = {
      ...previewResult,
      id: neighbor.id,
      score: sameFrame ? previewResult.score : 0,
      video_id: neighbor.video_id,
      videoId: neighbor.video_id,
      frameId: neighbor.payload.frame_id,
      timestamp: neighbor.timestamp ?? null,
      timeOrder: neighbor.payload.time_order ?? null,
      frameOrder: neighbor.payload.frame_order ?? null,
      fps: neighbor.payload.fps ?? null,
      image_path: neighbor.image_path,
      thumbnailUrl: neighbor.image_path,
      payload: {
        ...previewResult.payload,
        ...neighbor.payload,
        caption: sameFrame ? caption : neighbor.payload.caption || '',
      },
    }
    setPreviewResult(nextResult)
  }

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tagName = target.tagName.toLowerCase()
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'Escape') handleClose()
      if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && currentIndex > 0) {
        e.preventDefault()
        goPrevious()
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && currentIndex < searchResults.length - 1) {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, searchResults, setPreviewResult])

  useEffect(() => {
    if (!previewResult) return
    const existing = recheckList.find((item) => item.id === previewResult.id && item.answerType === 'QA')
    setQaAnswer(existing?.answer || '')
  }, [previewResult?.id, mode])

  useEffect(() => {
    let cancelled = false
    if (!previewResult || activeTab !== 'Neighbors' || !videoId || !frameId) return

    setNeighborsLoading(true)
    setNeighborsError(null)
    getNeighborKeyframes(videoId, frameId, 3)
      .then((frames) => {
        if (!cancelled) setNeighbors(frames)
      })
      .catch((error) => {
        if (!cancelled) {
          setNeighbors([])
          setNeighborsError(error instanceof Error ? error.message : 'Neighbor lookup failed')
        }
      })
      .finally(() => {
        if (!cancelled) setNeighborsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, currentNeighborKey, previewResult, videoId, frameId])

  useEffect(() => {
    let cancelled = false
    setCapturedFrame(null)
    setCapturedFrameKey(captureKey)
    setCaptureStateKey(captureKey)

    if (!previewResult || !videoId || !Number.isFinite(timestamp) || !captureKey) {
      setCaptureState('fallback')
      return
    }

    const cachedFrame = getCachedVideoFrame(videoId, timestamp)
    if (cachedFrame) {
      setCapturedFrame(cachedFrame)
      setCapturedFrameKey(captureKey)
      setCaptureState('ready')
      return
    }

    setCaptureState('loading')
    captureVideoFrame(videoId, timestamp)
      .then((frame) => {
        if (cancelled) return
        setCapturedFrame(frame)
        setCapturedFrameKey(captureKey)
        setCaptureState('ready')
        if (import.meta.env.DEV) {
          console.debug({
            videoId,
            frameId,
            timestamp,
            previewSource: 'video-frame',
          })
        }
      })
      .catch(() => {
        if (cancelled) return
        setCapturedFrame(null)
        setCapturedFrameKey(captureKey)
        setCaptureState('fallback')
      })

    return () => {
      cancelled = true
    }
  }, [previewResult?.id, videoId, frameId, timestamp, captureKey])

  if (!previewResult) return null

  const tabs = [
    { id: 'Overview', icon: ImageIcon, enabled: true },
    { id: 'Neighbors', icon: Map, enabled: true },
    { id: 'Q&A Answer', icon: MessageSquare, enabled: true },
    { id: 'OCR', icon: Type, enabled: true }
  ]

  const imageUrl = getImageUrl(imagePath)
  const cachedFrame = captureKey ? getCachedVideoFrame(videoId, timestamp) : null
  const activeCapturedFrame = capturedFrameKey === captureKey ? capturedFrame : null
  const exactFrame = activeCapturedFrame || cachedFrame
  const isCaptureStateCurrent = captureStateKey === captureKey
  const effectiveCaptureState = exactFrame
    ? 'ready'
    : isCaptureStateCurrent && captureState === 'fallback'
      ? 'fallback'
      : 'loading'
  const modelName = typeof previewResult.payload.model === 'string' ? previewResult.payload.model : ''
  const ocrText = typeof previewResult.payload.ocr === 'string' ? previewResult.payload.ocr.trim() : ''
  const previewSourceLabel = effectiveCaptureState === 'ready'
    ? `Video frame @ ${formatSeconds(exactFrame?.timestamp ?? timestamp)}`
    : effectiveCaptureState === 'loading'
      ? 'Loading exact video frame...'
      : 'Stored keyframe fallback'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8" onClick={handleClose}>
      <button
        onClick={handlePrevious}
        disabled={currentIndex <= 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 transition-colors bg-slate-900/50 hover:bg-slate-800 rounded-full border border-slate-700 backdrop-blur-md"
      >
        <ChevronLeft size={32} />
      </button>

      <button
        onClick={handleNext}
        disabled={currentIndex >= searchResults.length - 1}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 transition-colors bg-slate-900/50 hover:bg-slate-800 rounded-full border border-slate-700 backdrop-blur-md"
      >
        <ChevronRight size={32} />
      </button>

      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex w-full max-w-7xl h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-1 bg-black relative flex items-center justify-center group overflow-hidden">
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white rounded border border-white/10 text-sm font-mono z-10 shadow-lg flex items-center overflow-hidden">
            <button
              onClick={handlePrevious}
              disabled={currentIndex <= 0}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
            >
              ← PREV
            </button>
            <span className="px-3 py-1.5 border-x border-white/10">
              Result {currentIndex + 1} of {searchResults.length}
            </span>
            <button
              onClick={handleNext}
              disabled={currentIndex >= searchResults.length - 1}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
            >
              NEXT →
            </button>
          </div>
          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded border border-white/10 text-xs font-mono z-10 shadow-lg">
            {effectiveCaptureState === 'ready'
              ? `VIDEO FRAME • ${formatSeconds(exactFrame?.timestamp ?? timestamp)}`
              : previewSourceLabel}
          </div>
          {effectiveCaptureState === 'ready' && exactFrame ? (
            <img
              src={exactFrame.url}
              alt="Preview"
              className="w-full h-full object-contain"
            />
          ) : effectiveCaptureState === 'fallback' && imageUrl ? (
            <img
              src={imageUrl}
              alt="Stored keyframe fallback"
              className="w-full h-full object-contain"
            />
          ) : effectiveCaptureState === 'loading' ? (
            <div className="w-[min(78%,900px)] aspect-video rounded-lg border border-slate-800 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-400" />
              <span className="text-sm font-mono">Loading video frame @ {formatSeconds(timestamp)}...</span>
            </div>
          ) : (
            <div className="text-slate-500 flex flex-col items-center gap-2">
              <ImageIcon size={32} />
              <span className="text-sm">Image unavailable</span>
            </div>
          )}
        </div>

        <div className="w-[450px] bg-slate-950 flex flex-col shrink-0 border-l border-slate-800">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800 bg-slate-900">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-200 truncate pr-4" title={videoId}>
                {videoId || 'Unknown video'}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Frame: {frameId || 'N/A'} - {formatSeconds(timestamp)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAddToBuilder}
                className="px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded flex items-center gap-1.5 transition-colors"
              >
                <Plus size={14} />
                {existingCandidate ? 'ADDED ✓' : 'ADD'}
              </button>
              <button
                onClick={() => {
                  handleClose()
                  setPlayingVideo(previewResult)
                }}
                className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <FileVideo size={14} />
                WATCH
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex border-b border-slate-800 bg-slate-900/50 px-2 pt-2 gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => tab.enabled && setActiveTab(tab.id)}
                  disabled={!tab.enabled}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                    !tab.enabled ? 'opacity-30 cursor-not-allowed border-transparent text-slate-500' :
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t'
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-t'
                  }`}
                >
                  <Icon size={14} />
                  {tab.id}
                </button>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {activeTab === 'Overview' && (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <InfoTile label="Video" value={videoId || 'N/A'} />
                  <InfoTile label="Frame ID" value={frameId || 'N/A'} mono />
                  <InfoTile label="Timestamp" value={formatSeconds(timestamp)} mono />
                  <InfoTile label="Preview Source" value={previewSourceLabel} />
                  <InfoTile label="Score" value={getResultScore(previewResult).toFixed(4)} mono />
                  <InfoTile label="Model" value={modelName || '--'} />
                  <InfoTile label="Current Query" value={lastSearch?.query || '--'} />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Extracted Context</div>
                  <div className="bg-slate-900 p-4 rounded border border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {caption || 'No transcript available for this frame.'}
                  </div>
                </div>

                <div className="bg-slate-900 p-3 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Image Path</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-mono text-slate-200 truncate flex-1" title={portableImagePath}>
                      {portableImagePath || '--'}
                    </div>
                    <button
                      onClick={() => handleCopy(portableImagePath, 'image path')}
                      disabled={!portableImagePath}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40"
                      title="Copy portable image path"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleCopy(imagePath, 'raw path')}
                    disabled={!imagePath}
                    className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-40"
                  >
                    {copiedField === 'raw path' ? 'Copied raw path' : 'Copy raw path'}
                  </button>
                </div>

              </div>
            )}

            {activeTab === 'Neighbors' && (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-slate-500 leading-relaxed">
                  Neighboring keyframe files from AIC26/imgs/{videoId}. Timestamps are shown only when available in maps/{videoId}.csv.
                </div>
                {neighborsLoading && (
                  <div className="text-sm text-slate-500 flex items-center justify-center h-32">Loading neighbors...</div>
                )}
                {neighborsError && (
                  <div className="text-sm text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded p-3">{neighborsError}</div>
                )}
                {!neighborsLoading && !neighborsError && neighbors.length === 0 && (
                  <div className="text-sm text-slate-500 flex flex-col items-center justify-center h-32 gap-3">
                    <Map size={24} className="text-slate-700" />
                    <p>No neighboring keyframe files found.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {neighbors.map((neighbor) => {
                    const neighborFrameId = String(neighbor.payload.frame_id)
                    const isCurrent = neighborFrameId === frameId
                    const neighborTime = neighbor.timestamp
                    return (
                      <button
                        key={neighbor.id}
                        onClick={() => handleNeighborClick(neighbor)}
                        className={`text-left rounded border overflow-hidden transition ${
                          isCurrent
                            ? 'border-blue-500 bg-blue-950/30'
                            : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                        }`}
                      >
                        <div className="aspect-video bg-black">
                          <img
                            src={getImageUrl(neighbor.image_path)}
                            alt={`Frame ${neighborFrameId}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-mono text-slate-200">Frame {neighborFrameId}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {neighborTime == null ? 'Timestamp unavailable' : formatSeconds(neighborTime, 0)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'Q&A Answer' && (
              <div className="flex flex-col gap-4">
                {mode === 'QA' ? (
                  <>
                    <InfoBlock label="Question" value={lastSearch?.query || '--'} />
                    <InfoBlock label="Frame Context" value={caption || 'No transcript available for this frame.'} />
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Answer</div>
                      <textarea
                        value={qaAnswer}
                        onChange={(event) => setQaAnswer(event.target.value)}
                        rows={5}
                        className="w-full resize-none rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200 outline-none focus:border-blue-500"
                        placeholder="Enter the QA answer manually."
                      />
                    </div>
                    <button
                      onClick={handleAddQaCandidate}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus size={16} />
                      ADD QA CANDIDATE
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                      QA answer editing is available in QA mode.
                    </div>
                    <InfoBlock label="Frame Context" value={caption || 'No transcript available for this frame.'} />
                  </>
                )}
              </div>
            )}

            {activeTab === 'OCR' && (
              <div className="text-sm text-slate-400 flex flex-col gap-3">
                <Type size={24} className="text-slate-700" />
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">OCR</div>
                  <p className="whitespace-pre-wrap">{ocrText || 'OCR text is not available from the current retrieval API.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoTile({ label, value, secondary, mono = false }: { label: string; value: string; secondary?: string; mono?: boolean }) {
  return (
    <div className="bg-slate-900 p-3 rounded border border-slate-800 min-w-0">
      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm text-white truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
      {secondary && <div className="text-[11px] text-slate-500 font-mono mt-0.5">{secondary}</div>}
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <div className="bg-slate-900 p-3 rounded border border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
        {value}
      </div>
    </div>
  )
}
