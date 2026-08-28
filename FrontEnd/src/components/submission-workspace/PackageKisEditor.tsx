import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'
import type { KisCandidate } from '../../utils/submission'
import { normalizePackageVideoId, parseFrameOrderInput, type CandidateMoveDirection } from './candidateEditorUtils'

type PackageKisEditorProps = {
  candidates: KisCandidate[]
  onUpdate: (candidateId: string, patch: Partial<Omit<KisCandidate, 'id' | 'type'>>) => void
  onRemove: (candidateId: string) => void
  onMove: (candidateId: string, direction: CandidateMoveDirection) => void
}

function copyCandidate(candidate: KisCandidate) {
  const text = `${candidate.videoId},${candidate.frameOrder}`
  navigator.clipboard?.writeText(text).catch(() => undefined)
}

export default function PackageKisEditor({
  candidates,
  onUpdate,
  onRemove,
  onMove,
}: PackageKisEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        KIS Candidates
      </div>

      {candidates.length === 0 ? (
        <div className="rounded border border-dashed border-slate-800 bg-slate-950/30 px-3 py-4 text-center text-[11px] text-slate-500">
          <div>No KIS candidates yet.</div>
          <div className="mt-1">Add a row or paste teammate answers.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {candidates.map((candidate, index) => (
            <div key={candidate.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="font-mono text-[10px] font-bold text-slate-400">#{index + 1}</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMove(candidate.id, 'up')}
                    disabled={index === 0}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move candidate up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(candidate.id, 'down')}
                    disabled={index === candidates.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move candidate down"
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
                    title="Delete candidate"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                    Video ID
                  </span>
                  <input
                    type="text"
                    value={candidate.videoId}
                    onChange={(event) => onUpdate(candidate.id, { videoId: normalizePackageVideoId(event.target.value) })}
                    placeholder="L22_V024"
                    className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                    Frame Idx
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={candidate.frameOrder}
                    onChange={(event) => onUpdate(candidate.id, { frameOrder: parseFrameOrderInput(event.target.value) })}
                    placeholder="27435"
                    className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
