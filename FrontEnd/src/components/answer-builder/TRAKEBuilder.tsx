import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { useStore } from '../../store'
import { getImageUrl } from '../../utils/media'
import { formatSeconds, resolveTimestamp } from '../../utils/results'

const MIN_TRAKE_EVENTS = 1
const MAX_TRAKE_EVENTS = 20

function normalizeVideoId(value: string) {
  return value.trim().replace(/\.mp4$/i, '')
}

export default function TRAKEBuilder() {
  const {
    trakeState,
    setTrakeSelectedVideo,
    setTrakeEventFrameOrder,
    setTrakeEventCount,
    clearTrakeEvent,
    clearAllTrakeEvents,
    addTrakeEvent,
    removeTrakeEvent,
    moveTrakeEvent,
    addToast,
  } = useStore()

  const { selectedVideoId, events } = trakeState
  const filledEvents = events.filter((event) => String(event.frameOrder || '').trim()).length

  const handleVideoChange = (value: string) => {
    setTrakeSelectedVideo(normalizeVideoId(value) || null)
  }

  const handleEventCountChange = (value: string) => {
    const nextCount = Number(value)
    if (!Number.isFinite(nextCount)) return
    setTrakeEventCount(nextCount)
  }

  const handleRemoveLastEvent = () => {
    if (events.length === 0) return
    removeTrakeEvent(events[events.length - 1].id)
  }

  const handleClearAll = () => {
    if (!window.confirm('Clear the TRAKE result form?')) return
    clearAllTrakeEvents()
    addToast('TRAKE result form cleared', 'info')
  }

  return (
    <div className="p-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">TRAKE Result</h3>
          <p className="text-[10px] text-slate-500 mt-1">
            Search normally, then use result frames to fill each event in query order.
          </p>
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/35 p-2.5 flex flex-col gap-2.5">
          <div>
            <label className="text-[9px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">
              Video ID
            </label>
            <input
              type="text"
              value={selectedVideoId || ''}
              onChange={(e) => handleVideoChange(e.target.value)}
              placeholder="L10_V001"
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 outline-none focus:border-blue-500 text-xs font-mono"
            />
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <label className="text-[9px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">
                Event Count
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTrakeEventCount(events.length - 1)}
                  disabled={events.length <= MIN_TRAKE_EVENTS}
                  className="w-7 h-7 rounded border border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Decrease event count"
                >
                  -
                </button>
                <input
                  type="number"
                  min={MIN_TRAKE_EVENTS}
                  max={MAX_TRAKE_EVENTS}
                  value={events.length || 2}
                  onChange={(e) => handleEventCountChange(e.target.value)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 outline-none focus:border-blue-500 text-xs font-mono text-center"
                />
                <button
                  type="button"
                  onClick={() => setTrakeEventCount(events.length + 1)}
                  disabled={events.length >= MAX_TRAKE_EVENTS}
                  className="w-7 h-7 rounded border border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Increase event count"
                >
                  +
                </button>
              </div>
            </div>

            <div className="h-7 flex items-center rounded border border-slate-800 bg-slate-950 px-2.5 text-[9px] text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Events: <span className="text-slate-300 font-semibold ml-1">{filledEvents}</span> / {events.length}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-950/25 p-2">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Event Frame Orders</span>
            <span>{events.length} event(s)</span>
          </div>
          <div className="flex flex-col gap-2">
              {events.map((event, index) => {
                const candidate = event.selectedCandidate
                const candidateTime = candidate ? resolveTimestamp(candidate) : null

                return (
                  <div key={event.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                        Event {index + 1} - Frame Order
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTrakeEvent(event.id, 'up')}
                          disabled={index === 0}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors"
                          title="Move event up"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTrakeEvent(event.id, 'down')}
                          disabled={index === events.length - 1}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors"
                          title="Move event down"
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => clearTrakeEvent(event.id)}
                          disabled={!event.frameOrder}
                          className="text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors"
                          title="Clear event"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={event.frameOrder || ''}
                        onChange={(e) => setTrakeEventFrameOrder(event.id, e.target.value)}
                        placeholder={String(index === 0 ? 1200 : '')}
                        className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 outline-none focus:border-blue-500 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => removeTrakeEvent(event.id)}
                        disabled={events.length <= MIN_TRAKE_EVENTS}
                        className="w-8 flex items-center justify-center bg-red-950/20 hover:bg-red-900/50 text-red-400 rounded border border-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Remove event"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {candidate && (
                      <div className="flex gap-2 items-center border-t border-slate-800 pt-2">
                        <img
                          src={getImageUrl(candidate.img_link)}
                          alt={`Frame ${candidate.payload.frame_id}`}
                          className="w-16 h-9 object-cover rounded border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0 flex-1 text-[9px] font-mono text-slate-500">
                          <div className="text-blue-300">Frame Idx: {event.frameOrder}</div>
                          <div className="truncate">Internal Frame ID: {String(candidate.payload.frame_id)}</div>
                          <div>{formatSeconds(candidateTime)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>

        {events.some((event, index) => !event.frameOrder && events.slice(index + 1).some((next) => next.frameOrder)) && (
          <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded px-2 py-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-px" />
            <span>There is an empty event input before a filled event.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => addTrakeEvent()}
            disabled={events.length >= MAX_TRAKE_EVENTS}
            className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded py-1.5 text-[10px] font-semibold uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={12} />
            Add Event
          </button>
          <button
            type="button"
            onClick={handleRemoveLastEvent}
            disabled={events.length <= MIN_TRAKE_EVENTS}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded py-1.5 text-[10px] font-semibold uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Remove Last Event
          </button>
        </div>

        <button
          type="button"
          onClick={handleClearAll}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors border border-slate-800 hover:border-red-900/50 rounded py-1.5"
        >
          Clear TRAKE Result
        </button>
      </div>
    </div>
  )
}
