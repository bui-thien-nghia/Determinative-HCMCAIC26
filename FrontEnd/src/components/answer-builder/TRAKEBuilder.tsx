import { X, Film, Plus, ChevronRight, AlertTriangle, Check, Trash2 } from 'lucide-react'
import { useStore } from '../../store'
import { getImageUrl } from '../../utils/media'
import { formatSeconds } from '../../utils/results'

export default function TRAKEBuilder() {
  const {
    trakeState,
    clearTrakeEvent,
    clearAllTrakeEvents,
    setTrakeStage,
    setTrakeActiveEvent,
    setTrakeSelectedVideo,
    addTrakeEvent,
    removeTrakeEvent,
    addToast,
  } = useStore()

  const { selectedVideoId, stage, activeEventId, events } = trakeState

  // ── Temporal validation ────────────────────────────────────────
  const getCandidateTime = (candidate: NonNullable<typeof events[number]['selectedCandidate']>) => {
    const value = candidate.payload.timestamp ?? candidate.payload.time_order
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }

  const getTemporalWarnings = () => {
    const warnings: Record<string, string> = {}
    let lastTime: number | null = null
    let lastLabel = ''
    for (const evt of events) {
      if (!evt.selectedCandidate) continue
      const seconds = getCandidateTime(evt.selectedCandidate)
      if (seconds == null) continue
      if (lastTime != null && seconds <= lastTime) {
        warnings[evt.id] = `${formatSeconds(seconds)} ≤ ${lastLabel} (${formatSeconds(lastTime)}) — out of order`
      }
      lastTime = seconds
      lastLabel = evt.label
    }
    return warnings
  }

  const temporalWarnings = getTemporalWarnings()
  const selectedCount = events.filter(e => e.selectedCandidate).length
  const allSelected = events.length > 0 && selectedCount === events.length
  const hasTemporalError = Object.keys(temporalWarnings).length > 0
  const isReady = allSelected && !hasTemporalError

  // ── Actions ───────────────────────────────────────────────────
  const handleSelectVideoAndAdvance = () => {
    if (!selectedVideoId) return
    setTrakeStage(2)
    // Auto-activate first event
    if (events.length > 0) setTrakeActiveEvent(events[0].id)
    else setTrakeActiveEvent(null)
  }

  const handleChangeVideo = () => {
    if (selectedCount > 0) {
      if (!window.confirm(`Changing the video will clear ${selectedCount} selected event frame(s). Continue?`)) return
    }
    // Reset to stage 1, clear all frame selections but keep event structure
    useStore.setState(s => ({
      trakeState: {
        ...s.trakeState,
        selectedVideoId: null,
        stage: 1,
        activeEventId: null,
        events: s.trakeState.events.map(e => ({ ...e, selectedCandidate: undefined }))
      }
    }))
  }

  const handleClearAll = () => {
    if (!window.confirm('Reset entire TRAKE workspace?')) return
    clearAllTrakeEvents()
    addToast('TRAKE workspace cleared', 'info')
  }

  const handleEventClick = (eventId: string) => {
    setTrakeActiveEvent(activeEventId === eventId ? null : eventId)
  }

  // ── STAGE 1 ───────────────────────────────────────────────────
  if (stage === 1) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-0">
        {/* Stage indicator */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded">1</span>
            <span className="text-blue-400">RETRIEVAL</span>
            <ChevronRight size={10} className="text-slate-600" />
            <span className="text-slate-600 px-2 py-0.5 rounded border border-slate-700">2</span>
            <span className="text-slate-600">ALIGNMENT</span>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Find the video containing the complete event sequence, then click <strong>Select</strong> on the video card.
          </p>

          {/* Selected video status */}
          <div className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${selectedVideoId ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-700 border-dashed bg-slate-950/50'}`}>
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Selected Video</div>
            {selectedVideoId ? (
              <>
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-blue-400 shrink-0" />
                  <span className="text-blue-300 font-semibold font-mono text-sm truncate flex-1">{selectedVideoId}</span>
                  <button
                    onClick={() => setTrakeSelectedVideo(null)}
                    className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    title="Clear selection"
                  >
                    <X size={12} />
                  </button>
                </div>
                <button
                  onClick={handleSelectVideoAndAdvance}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider py-2 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  Start Alignment
                  <ChevronRight size={12} />
                </button>
              </>
            ) : (
              <div className="text-[10px] text-slate-500 italic">
                None — select a video from the candidates grid
              </div>
            )}
          </div>

          {/* Event count config for development */}
          <div className="border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex justify-between">
              <span>Event Slots</span>
              <span className="text-slate-600">{events.length} configured</span>
            </div>
            {events.length === 0 ? (
              <p className="text-[10px] text-slate-600 italic">
                No events defined. Add event slots for the number of semantic stages in the query.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {events.map((evt, i) => (
                  <div key={evt.id} className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-bold text-slate-500 shrink-0">{i + 1}</span>
                    <span className="flex-1">{evt.label}</span>
                    <button
                      onClick={() => removeTrakeEvent(evt.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                      title="Remove event"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => addTrakeEvent()}
              className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors border border-dashed border-slate-700 hover:border-slate-500 rounded px-2 py-1.5 w-full justify-center"
            >
              <Plus size={10} />
              Add Event
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── STAGE 2 ───────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-0">
      {/* Stage indicator */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-800 bg-slate-950/30 flex-col flex gap-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          <span className="bg-slate-700 text-slate-400 px-2 py-0.5 rounded">1</span>
          <span className="text-slate-500">RETRIEVAL</span>
          <ChevronRight size={10} className="text-slate-600" />
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded">2</span>
          <span className="text-blue-400">ALIGNMENT</span>
        </div>

        {/* Locked video + change */}
        <div className="flex items-center gap-2">
          <Film size={11} className="text-blue-400 shrink-0" />
          <span className="text-blue-300 font-mono text-[10px] font-semibold truncate flex-1">{selectedVideoId}</span>
          <button
            onClick={handleChangeVideo}
            className="text-[9px] text-slate-500 hover:text-amber-400 transition-colors border border-slate-700 hover:border-amber-600 rounded px-1.5 py-0.5 shrink-0"
          >
            Change
          </button>
        </div>
      </div>

      {/* Single instruction line */}
      <div className="px-3 py-2 text-[10px] text-slate-500 border-b border-slate-800/50">
        {activeEventId
          ? `Select a frame from results → will assign to active event`
          : 'Click an event below to activate, then select a frame from results.'}
      </div>

      {/* Ready badge */}
      {isReady && (
        <div className="mx-3 mt-2 flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/50 rounded px-2 py-1.5">
          <Check size={12} className="text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
            {events.length} / {events.length} Ready to Export
          </span>
        </div>
      )}

      {/* Events */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {events.length === 0 ? (
          <div className="text-center text-slate-600 text-xs italic py-8">
            No event structure. Go back to Stage 1 and add events.
          </div>
        ) : (
          <>
            {/* Timeline */}
            <div className="flex flex-col">
              {events.map((evt, idx) => {
                const isActive = activeEventId === evt.id
                const isComplete = !!evt.selectedCandidate
                const hasWarning = !!temporalWarnings[evt.id]
                const candidateTime = evt.selectedCandidate ? getCandidateTime(evt.selectedCandidate) : null

                return (
                  <div key={evt.id} className="flex gap-2">
                    {/* Timeline spine */}
                    <div className="flex flex-col items-center w-5 shrink-0 mt-1">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isComplete && !hasWarning ? 'border-emerald-500 bg-emerald-900/30' :
                        hasWarning ? 'border-red-500 bg-red-900/20' :
                        isActive ? 'border-blue-500 bg-blue-900/30' :
                        'border-slate-700 bg-slate-900'
                      }`}>
                        {isComplete && !hasWarning && <Check size={8} className="text-emerald-400" />}
                        {hasWarning && <AlertTriangle size={8} className="text-red-400" />}
                        {!isComplete && !hasWarning && (
                          <span className="text-[8px] font-bold text-slate-500">{idx + 1}</span>
                        )}
                      </div>
                      {idx < events.length - 1 && (
                        <div className={`w-px flex-1 mt-0.5 mb-0.5 min-h-2 ${isComplete ? 'bg-slate-600' : 'bg-slate-800'}`} />
                      )}
                    </div>

                    {/* Event card */}
                    <div
                      className={`flex-1 mb-2 rounded-lg border overflow-hidden transition-all cursor-pointer ${
                        isActive ? 'border-blue-500 ring-1 ring-blue-500/30' :
                        hasWarning ? 'border-red-700/60' :
                        isComplete ? 'border-slate-700 bg-slate-900/50' :
                        'border-slate-800 border-dashed'
                      }`}
                      onClick={() => handleEventClick(evt.id)}
                    >
                      {/* Card header */}
                      <div className={`px-2 py-1.5 flex justify-between items-center ${isActive ? 'bg-blue-900/20' : 'bg-slate-950/50'}`}>
                        <div className="flex items-center gap-1.5">
                          {isActive && (
                            <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">ACTIVE</span>
                          )}
                          <span className="text-xs font-semibold text-slate-200">{evt.label}</span>
                          {evt.description && (
                            <span className="text-[9px] text-slate-500 italic truncate max-w-24">{evt.description}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isComplete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); clearTrakeEvent(evt.id) }}
                              className="text-slate-500 hover:text-red-400 transition-colors p-0.5 rounded"
                              title="Clear frame"
                            >
                              <X size={10} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeTrakeEvent(evt.id) }}
                            className="text-slate-700 hover:text-slate-400 transition-colors p-0.5 rounded"
                            title="Remove event"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-2">
                        {isComplete ? (
                          <>
                            <div className="flex gap-2 items-center">
                              <img
                                src={getImageUrl(evt.selectedCandidate!.img_link)}
                                alt={`Frame ${evt.selectedCandidate!.payload.frame_id}`}
                                className="w-16 h-9 object-cover rounded border border-slate-700 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Frame <span className="text-slate-200 font-semibold">{String(evt.selectedCandidate!.payload.frame_id)}</span>
                                </div>
                                {candidateTime != null && (
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    {formatSeconds(candidateTime, 0)}
                                  </div>
                                )}
                                {evt.selectedCandidate!.payload.score != null && (
                                  <div className="text-[9px] text-slate-500">
                                    Score: {Number(evt.selectedCandidate!.payload.score).toFixed(4)}
                                  </div>
                                )}
                              </div>
                            </div>
                            {hasWarning && (
                              <div className="mt-1.5 flex items-start gap-1 text-[9px] text-red-400">
                                <AlertTriangle size={9} className="shrink-0 mt-px" />
                                <span>{temporalWarnings[evt.id]}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className={`h-7 flex items-center justify-center text-[10px] transition-colors ${isActive ? 'text-blue-400' : 'text-slate-600'}`}>
                            {isActive ? 'Click + on a result frame to assign' : 'Select frame'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add event button */}
            <button
              onClick={() => addTrakeEvent()}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors border border-dashed border-slate-800 hover:border-slate-600 rounded px-2 py-1.5 w-full justify-center"
            >
              <Plus size={10} />
              Add Event
            </button>
          </>
        )}
      </div>

      {/* Clear workspace */}
      <div className="p-3 pt-0">
        <button
          onClick={handleClearAll}
          className="w-full text-[10px] text-slate-600 hover:text-red-400 transition-colors border border-slate-800 hover:border-red-900/50 rounded py-1.5"
        >
          Reset TRAKE Workspace
        </button>
      </div>
    </div>
  )
}
