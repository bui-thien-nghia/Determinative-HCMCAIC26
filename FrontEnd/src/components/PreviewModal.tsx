import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, Map, MessageSquare, Database, FileVideo, Copy, Loader2 } from 'lucide-react'
import { useStore, type SearchResult } from '../store'
import { getImageUrl, getNeighborKeyframes, type NeighborFrame } from '../utils/media'
import { captureVideoFrame, type CapturedVideoFrame } from '../utils/videoFrameCapture'
import {
  copyText,
  formatSeconds,
	  getPortableImagePath,
	  getRawImagePath,
	  getResultCaption,
	  getResultFrameId,
	  getResultScore,
	  getResultTimestamp,
	  getResultVideoPath,
	  getResultVideoId,
	} from '../utils/results'
import {
  getActivePackageQuery,
  getSubmissionFrame,
  getSubmissionVideoId,
  packageQueryContainsResult,
  type QaCandidate,
} from '../utils/submission'

function formatFieldLabel(field: string) {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatMetadataValue(value: unknown) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function hasCopyValue(value?: string | null): value is string {
  return typeof value === 'string' && value !== ''
}

export default function PreviewModal() {
  const {
    previewResult,
    setPreviewResult,
	    searchResults,
    setPlayingVideo,
    addToast,
    addResultToActivePackageQuery,
    lastSearch,
    teamSubmissionPackage,
	    collectionSchema,
	    metadataVisibility,
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
  const captureRequestRef = useRef(0)
  const activeFrameUrlRef = useRef<string | null>(null)
  const lastCopyFeedbackRef = useRef<{ label: string; time: number }>({ label: '', time: 0 })

  const previewResults = useMemo(
    () => searchResults,
    [searchResults],
  )
  const currentIndex = previewResults.findIndex(r => r.id === previewResult?.id)
  const videoId = getResultVideoId(previewResult)
  const frameId = getResultFrameId(previewResult)
	  const timestamp = getResultTimestamp(previewResult)
	  const caption = getResultCaption(previewResult)
  const imagePath = getRawImagePath(previewResult)
	  const videoPath = getResultVideoPath(previewResult)
	  const videoSource = videoPath || videoId
	  const portableImagePath = getPortableImagePath(imagePath)
  const activePackageQuery = getActivePackageQuery(teamSubmissionPackage)
  const existingCandidate = previewResult
    ? packageQueryContainsResult(activePackageQuery, previewResult)
    : false
  const existingQaCandidate = previewResult && activePackageQuery?.type === 'QA'
    ? activePackageQuery.candidates.find((candidate): candidate is QaCandidate => (
        candidate.type === 'QA'
        && candidate.videoId === getSubmissionVideoId(previewResult)
        && candidate.frameOrder === getSubmissionFrame(previewResult)
      ))
    : undefined

  const currentNeighborKey = useMemo(() => `${videoId}:${frameId}`, [videoId, frameId])
	  const captureKey = useMemo(() => (
	    previewResult?.id && videoSource && Number.isFinite(timestamp)
	      ? `${previewResult.id}|${videoSource}|${timestamp}`
	      : ''
	  ), [previewResult?.id, videoSource, timestamp])

  const metadataRows = useMemo(() => {
    const payload = previewResult?.payload
    if (!payload) return []

    return Object.entries(payload)
      .filter(([, value]) => value != null && value !== '')
      .filter(([field]) => {
        const descriptor = collectionSchema[field]
        return !(descriptor && !descriptor.is_indexed && metadataVisibility[field] === false)
      })
      .map(([field, value]) => ({
        field,
        value: formatMetadataValue(value),
        isIndexed: collectionSchema[field]?.is_indexed ?? false,
      }))
  }, [collectionSchema, metadataVisibility, previewResult])

  const goPrevious = () => {
    if (currentIndex > 0) setPreviewResult(previewResults[currentIndex - 1])
  }

  const goNext = () => {
    if (currentIndex >= 0 && currentIndex < previewResults.length - 1) setPreviewResult(previewResults[currentIndex + 1])
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
    addResultToActivePackageQuery(previewResult, {
      answer: activePackageQuery?.type === 'QA' ? qaAnswer : undefined,
      confirmCreateTrakeSequence: (currentVideoId, nextVideoId) => (
        window.confirm(`Current TRAKE sequence belongs to ${currentVideoId}. Create a new sequence for ${nextVideoId}?`)
      ),
    })
  }

  const handleCopy = async (value: string, label: string) => {
    if (!value) return
    const copied = await copyText(value)
    if (copied) {
      setCopiedField(label)
      const now = Date.now()
      if (lastCopyFeedbackRef.current.label !== label || now - lastCopyFeedbackRef.current.time > 900) {
        addToast(`Copied ${label}`, 'success')
        lastCopyFeedbackRef.current = { label, time: now }
      }
      window.setTimeout(() => setCopiedField(null), 1200)
    }
  }

  const handleAddQaCandidate = () => {
    if (!previewResult || activePackageQuery?.type !== 'QA') return
    addResultToActivePackageQuery(previewResult, { answer: qaAnswer })
  }

	  const handleNeighborClick = (neighbor: NeighborFrame) => {
	    if (!previewResult) return
	    const sameFrame = neighbor.payload.frame_id === frameId
	    const nextResult: SearchResult = {
	      ...previewResult,
	      id: neighbor.id,
	      score: sameFrame ? previewResult.score : 0,
	      video_id: neighbor.video_id,
	      timestamp: neighbor.timestamp ?? null,
	      image_path: neighbor.image_path,
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
      if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && currentIndex >= 0 && currentIndex < previewResults.length - 1) {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, previewResults, setPreviewResult])

  useEffect(() => {
    if (!previewResult) return
    setQaAnswer(existingQaCandidate?.answer || '')
  }, [activePackageQuery?.id, existingQaCandidate?.id, previewResult?.id])

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
    const requestId = captureRequestRef.current + 1
    captureRequestRef.current = requestId

    if (activeFrameUrlRef.current) {
      URL.revokeObjectURL(activeFrameUrlRef.current)
      activeFrameUrlRef.current = null
    }

    setCapturedFrame(null)
    setCapturedFrameKey('')
    setCaptureStateKey(captureKey)

	    if (!previewResult || !videoSource || !Number.isFinite(timestamp) || !captureKey) {
	      setCaptureState('fallback')
	      return () => {
	        cancelled = true
	      }
	    }

	    setCaptureState('loading')
	    captureVideoFrame(videoSource, timestamp, videoId)
      .then((frame) => {
        if (cancelled || requestId !== captureRequestRef.current) {
          URL.revokeObjectURL(frame.url)
          return
        }
        if (activeFrameUrlRef.current && activeFrameUrlRef.current !== frame.url) {
          URL.revokeObjectURL(activeFrameUrlRef.current)
        }
        activeFrameUrlRef.current = frame.url
        setCapturedFrame(frame)
        setCapturedFrameKey(captureKey)
        setCaptureState('ready')
        if (import.meta.env.DEV) {
          console.debug({
            resultId: previewResult.id,
            videoId,
            frameId,
            videoSource,
            timestamp,
            previewSource: 'video-frame',
          })
        }
      })
      .catch(() => {
        if (cancelled || requestId !== captureRequestRef.current) return
        setCapturedFrame(null)
        setCapturedFrameKey('')
        setCaptureState('fallback')
      })

    return () => {
      cancelled = true
    }
	  }, [previewResult?.id, videoSource, videoId, frameId, timestamp, captureKey])

  useEffect(() => (
    () => {
      captureRequestRef.current += 1
      if (activeFrameUrlRef.current) {
        URL.revokeObjectURL(activeFrameUrlRef.current)
        activeFrameUrlRef.current = null
      }
    }
  ), [])

  if (!previewResult) return null

	  const tabs = [
	    { id: 'Overview', icon: ImageIcon, enabled: true },
	    { id: 'Metadata', icon: Database, enabled: true },
	    { id: 'Neighbors', icon: Map, enabled: true },
	    { id: 'Q&A Answer', icon: MessageSquare, enabled: true },
	  ]

	  const imageUrl = getImageUrl(imagePath)
  const activeCapturedFrame = capturedFrameKey === captureKey ? capturedFrame : null
  const exactFrame = activeCapturedFrame
  const isCaptureStateCurrent = captureStateKey === captureKey
  const effectiveCaptureState = exactFrame
    ? 'ready'
    : isCaptureStateCurrent && captureState === 'fallback'
      ? 'fallback'
      : 'loading'
	  const previewSourceLabel = effectiveCaptureState === 'ready'
	    ? `Video frame @ ${formatSeconds(exactFrame?.timestamp ?? timestamp)}`
	    : effectiveCaptureState === 'loading'
	      ? 'Loading exact video frame...'
	      : 'Stored keyframe fallback'
  const timestampCopyValue = Number.isFinite(timestamp) ? timestamp.toFixed(2) : ''
  const scoreValue = getResultScore(previewResult).toFixed(4)
  const fpsValue = typeof previewResult.payload.fps === 'number' ? String(previewResult.payload.fps) : ''
  const frameOrderValue = typeof previewResult.payload.frame_order === 'number' ? String(previewResult.payload.frame_order) : ''
  const currentQuery = lastSearch?.query || ''
  const youtubeLink = typeof previewResult.payload.youtube_link === 'string' ? previewResult.payload.youtube_link : ''
	  const showImagePath = metadataVisibility.img_link !== false
	  const showFps = metadataVisibility.fps !== false
	  const showYoutubeLink = metadataVisibility.youtube_link !== false

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
	        disabled={currentIndex < 0 || currentIndex >= previewResults.length - 1}
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
	              Result {currentIndex >= 0 ? currentIndex + 1 : '-'} of {previewResults.length}
            </span>
            <button
              onClick={handleNext}
	              disabled={currentIndex < 0 || currentIndex >= previewResults.length - 1}
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
	              <div className="flex items-center gap-1.5 pr-4">
	                <div className="min-w-0 truncate text-sm font-bold text-slate-200 select-text" title={videoId}>
	                  {videoId || 'Unknown video'}
	                </div>
	                {hasCopyValue(videoId) && (
	                  <CopyButton
	                    label="Video ID"
	                    value={videoId}
	                    copied={copiedField === 'Video ID'}
	                    onCopy={handleCopy}
	                  />
	                )}
	              </div>
	              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-400 font-mono">
	                <span>Frame:</span>
	                <span className="select-text">{frameId || 'N/A'}</span>
	                {hasCopyValue(frameId) && (
	                  <CopyButton
	                    label="Frame ID"
	                    value={frameId}
	                    copied={copiedField === 'Frame ID'}
	                    onCopy={handleCopy}
	                  />
	                )}
	                <span>-</span>
	                <span className="select-text">{formatSeconds(timestamp)}</span>
	                {hasCopyValue(timestampCopyValue) && (
	                  <CopyButton
	                    label="Timestamp"
	                    value={timestampCopyValue}
	                    copied={copiedField === 'Timestamp'}
	                    onCopy={handleCopy}
	                  />
	                )}
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
	                  <InfoTile label="Video" value={videoId || 'N/A'} copyLabel="Video ID" copyValue={videoId} copiedField={copiedField} onCopy={handleCopy} />
	                  <InfoTile label="Frame ID" value={frameId || 'N/A'} copyLabel="Frame ID" copyValue={frameId} copiedField={copiedField} onCopy={handleCopy} mono />
	                  <InfoTile label="Timestamp" value={formatSeconds(timestamp)} copyLabel="Timestamp" copyValue={timestampCopyValue} copiedField={copiedField} onCopy={handleCopy} mono />
	                  <InfoTile label="Preview Source" value={previewSourceLabel} copyLabel="Preview Source" copyValue={previewSourceLabel} copiedField={copiedField} onCopy={handleCopy} />
	                  <InfoTile label="Score" value={scoreValue} copyLabel="Score" copyValue={scoreValue} copiedField={copiedField} onCopy={handleCopy} mono />
		                  <InfoTile label="Current Query" value={currentQuery || '--'} copyLabel="Query" copyValue={currentQuery} copiedField={copiedField} onCopy={handleCopy} />
		                  {showFps && <InfoTile label="FPS" value={fpsValue || '--'} copyLabel="FPS" copyValue={fpsValue} copiedField={copiedField} onCopy={handleCopy} mono />}
		                  <InfoTile label="Frame Order / BTC Frame Idx" value={frameOrderValue || '--'} copyLabel="Frame Order" copyValue={frameOrderValue} copiedField={copiedField} onCopy={handleCopy} mono />
		                </div>

	                <div>
	                  <div className="mb-2 flex items-center justify-between gap-2">
	                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Extracted Context</div>
	                    {hasCopyValue(caption) && (
	                      <CopyButton
	                        label="Context"
	                        value={caption}
	                        copied={copiedField === 'Context'}
	                        onCopy={handleCopy}
	                      />
	                    )}
	                  </div>
	                  <div className="bg-slate-900 p-4 rounded border border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
	                    {caption || 'No transcript available for this frame.'}
	                  </div>
	                </div>

	                {showImagePath && (
	                  <div className="bg-slate-900 p-3 rounded border border-slate-800">
		                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Image Path</div>
		                    <div className="flex items-center gap-2">
		                      <div className="text-xs font-mono text-slate-200 truncate flex-1 select-text" title={portableImagePath}>
		                        {portableImagePath || '--'}
		                      </div>
		                      <button
		                        onClick={() => handleCopy(portableImagePath, 'Image Path')}
		                        disabled={!portableImagePath}
		                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-40"
		                        title="Copy image path"
		                        aria-label="Copy Image Path"
		                      >
		                        <Copy size={14} />
		                      </button>
	                    </div>
	                    <button
		                      onClick={() => handleCopy(imagePath, 'Raw Path')}
	                      disabled={!imagePath}
	                      className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-40"
	                    >
		                      {copiedField === 'Raw Path' ? 'Copied raw path' : 'Copy raw path'}
	                    </button>
		                  </div>
	                )}

		                {videoPath && (
		                  <InfoBlock label="Video Path" value={videoPath} copyLabel="Video Path" copyValue={videoPath} copiedField={copiedField} onCopy={handleCopy} mono />
		                )}

		                {showYoutubeLink && youtubeLink && (
		                  <InfoBlock label="YouTube Link" value={youtubeLink} copyLabel="YouTube Link" copyValue={youtubeLink} copiedField={copiedField} onCopy={handleCopy} />
		                )}

	              </div>
	            )}

	            {activeTab === 'Metadata' && (
	              <div className="flex flex-col gap-2">
	                {metadataRows.length === 0 ? (
	                  <div className="text-sm text-slate-500">No metadata fields are visible for this result.</div>
	                ) : (
		                  metadataRows.map((row) => (
		                    <div key={row.field} className="rounded border border-slate-800 bg-slate-900 p-3">
		                      <div className="flex items-center justify-between gap-2">
		                        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
	                          {formatFieldLabel(row.field)}
	                        </div>
	                        {row.isIndexed && (
	                          <span className="text-[8px] text-blue-300 border border-blue-900 bg-blue-950/40 rounded px-1 uppercase tracking-wider">
		                            indexed
		                          </span>
		                        )}
		                      </div>
		                      <div className="mt-1 flex items-start gap-2">
		                        <div className="min-w-0 flex-1 text-xs font-mono text-slate-200 break-words whitespace-pre-wrap select-text">
		                          {row.value}
		                        </div>
		                        <CopyButton
		                          label={formatFieldLabel(row.field)}
		                          value={row.value}
		                          copied={copiedField === formatFieldLabel(row.field)}
		                          onCopy={handleCopy}
		                        />
		                      </div>
		                    </div>
		                  ))
	                )}
	              </div>
	            )}

            {activeTab === 'Neighbors' && (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-slate-500 leading-relaxed">
	                  Neighboring keyframes are loaded from the local media service. Timestamps are shown when available.
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
	                    const neighborTime = neighbor.payload.time_order ?? neighbor.payload.timestamp ?? neighbor.timestamp
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
                {activePackageQuery?.type === 'QA' ? (
                  <>
	                    <InfoBlock label="Question" value={currentQuery || '--'} copyLabel="Question" copyValue={currentQuery} copiedField={copiedField} onCopy={handleCopy} />
	                    <InfoBlock label="Frame Context" value={caption || 'No transcript available for this frame.'} copyLabel="Context" copyValue={caption} copiedField={copiedField} onCopy={handleCopy} />
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
                      QA answer editing is available when the active package query is Q&A.
                    </div>
	                    <InfoBlock label="Frame Context" value={caption || 'No transcript available for this frame.'} copyLabel="Context" copyValue={caption} copiedField={copiedField} onCopy={handleCopy} />
                  </>
                )}
              </div>
            )}

	          </div>
        </div>
      </div>
    </div>
  )
}

function CopyButton({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value?: string | null
  copied?: boolean
  onCopy: (value: string, label: string) => void
}) {
  if (!hasCopyValue(value)) return null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onCopy(value, label)
      }}
      className="shrink-0 rounded p-1 text-slate-500 opacity-70 transition hover:bg-slate-800 hover:text-slate-100 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      <Copy size={12} />
      <span className="sr-only">{copied ? `Copied ${label}` : `Copy ${label}`}</span>
    </button>
  )
}

function InfoTile({
  label,
  value,
  secondary,
  mono = false,
  copyLabel,
  copyValue,
  copiedField,
  onCopy,
}: {
  label: string
  value: string
  secondary?: string
  mono?: boolean
  copyLabel?: string
  copyValue?: string
  copiedField?: string | null
  onCopy?: (value: string, label: string) => void
}) {
  return (
    <div className="bg-slate-900 p-3 rounded border border-slate-800 min-w-0">
      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-center gap-1.5 min-w-0">
        <div className={`min-w-0 flex-1 text-sm text-white truncate select-text ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
        {copyLabel && onCopy && (
          <CopyButton
            label={copyLabel}
            value={copyValue}
            copied={copiedField === copyLabel}
            onCopy={onCopy}
          />
        )}
      </div>
      {secondary && <div className="text-[11px] text-slate-500 font-mono mt-0.5 select-text">{secondary}</div>}
    </div>
  )
}

function InfoBlock({
  label,
  value,
  copyLabel,
  copyValue,
  copiedField,
  onCopy,
  mono = false,
}: {
  label: string
  value: string
  copyLabel?: string
  copyValue?: string
  copiedField?: string | null
  onCopy?: (value: string, label: string) => void
  mono?: boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        {copyLabel && onCopy && (
          <CopyButton
            label={copyLabel}
            value={copyValue}
            copied={copiedField === copyLabel}
            onCopy={onCopy}
          />
        )}
      </div>
      <div className={`bg-slate-900 p-3 rounded border border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap select-text ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  )
}
