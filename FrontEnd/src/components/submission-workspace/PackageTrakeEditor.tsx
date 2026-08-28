import { ChevronDown, ChevronUp, Copy, Plus, Trash2, X } from 'lucide-react'
import type { TrakeCandidate } from '../../utils/submission'
import { normalizePackageVideoId, parseFrameOrderInput, type CandidateMoveDirection } from './candidateEditorUtils'

const MIN_TRAKE_EVENTS = 1

type PackageTrakeEditorProps = {
  candidates: TrakeCandidate[]
  onUpdate: (candidateId: string, patch: Partial<Omit<TrakeCandidate, 'id' | 'type'>>) => void
  onRemove: (candidateId: string) => void
  onMove: (candidateId: string, direction: CandidateMoveDirection) => void
}

function copyCandidate(candidate: TrakeCandidate) {
  const text = [candidate.videoId, ...candidate.frameOrders].join(',')
  navigator.clipboard?.writeText(text).catch(() => undefined)
}

function moveValue<T>(values: T[], fromIdx: number, toIdx: number) {
  if (fromIdx < 0 || fromIdx >= values.length) return values
  if (toIdx < 0 || toIdx >= values.length) return values
  if (fromIdx === toIdx) return values
  const next = [...values]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

export default function PackageTrakeEditor({
  candidates,
  onUpdate,
  onRemove,
  onMove,
}: PackageTrakeEditorProps) {
  const updateEvent = (candidate: TrakeCandidate, eventIdx: number, value: string) => {
    const frameOrders = [...candidate.frameOrders]
    frameOrders[eventIdx] = parseFrameOrderInput(value)
    onUpdate(candidate.id, { frameOrders })
  }

  const addEvent = (candidate: TrakeCandidate) => {
    onUpdate(candidate.id, { frameOrders: [...candidate.frameOrders, ''] })
  }

  const removeEvent = (candidate: TrakeCandidate, eventIdx: number) => {
    if (candidate.frameOrders.length <= MIN_TRAKE_EVENTS) return
    onUpdate(candidate.id, {
      frameOrders: candidate.frameOrders.filter((_, index) => index !== eventIdx),
    })
  }

  const moveEvent = (candidate: TrakeCandidate, eventIdx: number, direction: CandidateMoveDirection) => {
    const toIdx = direction === 'up' ? eventIdx - 1 : eventIdx + 1
    onUpdate(candidate.id, { frameOrders: moveValue(candidate.frameOrders, eventIdx, toIdx) })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        TRAKE Candidate Sequences
      </div>

      {candidates.length === 0 ? (
        <div className="rounded border border-dashed border-slate-800 bg-slate-950/30 px-3 py-4 text-center text-[11px] text-slate-500">
          <div>No TRAKE sequences yet.</div>
          <div className="mt-1">Add a row or paste teammate answers.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {candidates.map((candidate, index) => (
            <div key={candidate.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-bold text-slate-400">Sequence #{index + 1}</div>
                  <div className="text-[9px] text-slate-600">{candidate.frameOrders.length} event(s)</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMove(candidate.id, 'up')}
                    disabled={index === 0}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move sequence up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(candidate.id, 'down')}
                    disabled={index === candidates.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move sequence down"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyCandidate(candidate)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200"
                    title="Copy row"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(candidate.id)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-red-900/40 bg-red-950/20 text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-200"
                    title="Delete sequence"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  Video ID
                </span>
                <input
                  type="text"
                  value={candidate.videoId}
                  onChange={(event) => onUpdate(candidate.id, { videoId: normalizePackageVideoId(event.target.value) })}
                  placeholder="LXX_VXXX"
                  className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
              </label>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>Ordered Events</span>
                  <button
                    type="button"
                    onClick={() => addEvent(candidate)}
                    className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    <Plus size={11} />
                    Event
                  </button>
                </div>

                {candidate.frameOrders.map((frameOrder, eventIdx) => (
                  <div key={`${candidate.id}-${eventIdx}`} className="grid grid-cols-[3.6rem_minmax(0,1fr)_5.7rem] items-end gap-2">
                    <div className="pb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                      Event {eventIdx + 1}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={frameOrder}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateEvent(candidate, eventIdx, event.target.value)}
                      placeholder={eventIdx === 0 ? 'e.g. 14403' : 'e.g. 15020'}
                      className="min-w-0 select-text rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                    <div className="flex items-center justify-end gap-1 pb-px">
                      <button
                        type="button"
                        onClick={() => moveEvent(candidate, eventIdx, 'up')}
                        disabled={eventIdx === 0}
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move event up"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEvent(candidate, eventIdx, 'down')}
                        disabled={eventIdx === candidate.frameOrders.length - 1}
                        className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move event down"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEvent(candidate, eventIdx)}
                        disabled={candidate.frameOrders.length <= MIN_TRAKE_EVENTS}
                        className="flex h-6 w-6 items-center justify-center rounded border border-red-900/40 bg-red-950/20 text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Remove event"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
