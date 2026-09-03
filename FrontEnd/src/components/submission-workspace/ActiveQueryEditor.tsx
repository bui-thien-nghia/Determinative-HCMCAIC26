import { useEffect, useState } from 'react'
import { ClipboardPaste, Plus } from 'lucide-react'
import {
  MAX_TRAKE_EVENT_COUNT,
  filenameForPackageQuery,
  getPackageQueryCandidateCount,
  type KisCandidate,
  type PackageQuery,
  type QaCandidate,
  type QueryCandidate,
  type QueryCandidatePatch,
  type TrakeCandidate,
} from '../../utils/submission'
import PackageKisEditor from './PackageKisEditor'
import PackageQaEditor from './PackageQaEditor'
import PackageTrakeEditor from './PackageTrakeEditor'
import PasteAnswersDialog from './PasteAnswersDialog'
import type { CandidateMoveDirection } from './candidateEditorUtils'

type ActiveQueryEditorProps = {
  query: PackageQuery | null
  filenameTemplate: string
  onAddCandidate: (queryId: string, candidate: QueryCandidate) => void
  onUpdateCandidate: (queryId: string, candidateId: string, patch: QueryCandidatePatch) => void
  onRemoveCandidate: (queryId: string, candidateId: string) => void
  onReorderCandidate: (queryId: string, fromIdx: number, toIdx: number) => void
  onAddCandidates: (queryId: string, candidates: QueryCandidate[]) => number
  onSetExpectedEventCount: (queryId: string, expectedEventCount: number | undefined) => void
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void
}

function createCandidateId(type: QueryCandidate['type']) {
  const random = Math.random().toString(36).slice(2, 9)
  return `pkg-${type.toLowerCase()}-${Date.now()}-${random}`
}

function displayType(type: PackageQuery['type']) {
  return type === 'QA' ? 'Q&A' : type
}

function candidateIndex(query: PackageQuery, candidateId: string) {
  return query.candidates.findIndex((candidate) => candidate.id === candidateId)
}

export default function ActiveQueryEditor({
  query,
  filenameTemplate,
  onAddCandidate,
  onUpdateCandidate,
  onRemoveCandidate,
  onReorderCandidate,
  onAddCandidates,
  onSetExpectedEventCount,
  onNotify,
}: ActiveQueryEditorProps) {
  const [pasteOpen, setPasteOpen] = useState(false)

  useEffect(() => {
    setPasteOpen(false)
  }, [query?.id, query?.type])

  if (!query) {
    return (
      <div className="p-3 text-[11px] text-red-300">
        No active package query is available.
      </div>
    )
  }

  const queryName = filenameForPackageQuery(query, filenameTemplate).replace(/\.csv$/i, '')
  const candidateCount = getPackageQueryCandidateCount(query)
  const kisCandidates = query.candidates.filter((candidate): candidate is KisCandidate => candidate.type === 'KIS')
  const qaCandidates = query.candidates.filter((candidate): candidate is QaCandidate => candidate.type === 'QA')
  const trakeCandidates = query.candidates.filter((candidate): candidate is TrakeCandidate => candidate.type === 'TRAKE')

  const handleMoveCandidate = (candidateId: string, direction: CandidateMoveDirection) => {
    const fromIdx = candidateIndex(query, candidateId)
    if (fromIdx < 0) return
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
    if (toIdx < 0 || toIdx >= query.candidates.length) return
    onReorderCandidate(query.id, fromIdx, toIdx)
  }

  const handleAddKisRow = () => {
    onAddCandidate(query.id, {
      id: createCandidateId('KIS'),
      type: 'KIS',
      videoId: '',
      frameOrder: '',
    })
  }

  const handleAddQaRow = () => {
    onAddCandidate(query.id, {
      id: createCandidateId('QA'),
      type: 'QA',
      videoId: '',
      frameOrder: '',
      answer: '',
    })
  }

  const handleAddTrakeRow = () => {
    onAddCandidate(query.id, {
      id: createCandidateId('TRAKE'),
      type: 'TRAKE',
      videoId: '',
      frameOrders: [''],
    })
  }

  const handleAddRow = () => {
    if (query.type === 'QA') {
      handleAddQaRow()
    } else if (query.type === 'TRAKE') {
      handleAddTrakeRow()
    } else {
      handleAddKisRow()
    }
  }

  const handleExpectedEventCountChange = (value: string) => {
    if (!value.trim()) {
      onSetExpectedEventCount(query.id, undefined)
      return
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      onSetExpectedEventCount(query.id, undefined)
      return
    }
    const clamped = Math.max(1, Math.min(MAX_TRAKE_EVENT_COUNT, Math.floor(numeric)))
    onSetExpectedEventCount(query.id, clamped)
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="border-y border-slate-800 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100">Query {query.queryNumber}</div>
            <div className="truncate font-mono text-[10px] text-blue-300" title={queryName}>{queryName}</div>
            <div className="mt-1 text-[10px] text-slate-500">
              {candidateCount} candidate{candidateCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="shrink-0 text-[9px] uppercase tracking-wider">
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-bold text-slate-200">
              {displayType(query.type)}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleAddRow}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-500"
          >
            <Plus size={12} />
            Add Row
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-blue-950/30 hover:text-blue-200"
          >
            <ClipboardPaste size={12} />
            Paste Answers
          </button>
        </div>
        {query.type === 'TRAKE' && (
          <label className="mt-3 flex max-w-48 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="shrink-0">Required events</span>
            <input
              type="number"
              min={1}
              max={MAX_TRAKE_EVENT_COUNT}
              value={query.expectedEventCount ?? ''}
              onChange={(event) => handleExpectedEventCountChange(event.target.value)}
              placeholder="e.g. 4"
              className="h-7 w-20 rounded border border-slate-800 bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
              aria-label="Required events for TRAKE query"
            />
          </label>
        )}
      </div>

      {query.type === 'KIS' && (
        <PackageKisEditor
          candidates={kisCandidates}
          onUpdate={(candidateId, patch) => onUpdateCandidate(query.id, candidateId, patch)}
          onRemove={(candidateId) => onRemoveCandidate(query.id, candidateId)}
          onMove={handleMoveCandidate}
        />
      )}

      {query.type === 'QA' && (
        <PackageQaEditor
          candidates={qaCandidates}
          onUpdate={(candidateId, patch) => onUpdateCandidate(query.id, candidateId, patch)}
          onRemove={(candidateId) => onRemoveCandidate(query.id, candidateId)}
          onMove={handleMoveCandidate}
        />
      )}

      {query.type === 'TRAKE' && (
        <PackageTrakeEditor
          candidates={trakeCandidates}
          onUpdate={(candidateId, patch) => onUpdateCandidate(query.id, candidateId, patch)}
          onRemove={(candidateId) => onRemoveCandidate(query.id, candidateId)}
          onMove={handleMoveCandidate}
        />
      )}

      {pasteOpen && (
        <PasteAnswersDialog
          query={query}
          filenameTemplate={filenameTemplate}
          onClose={() => setPasteOpen(false)}
          onApply={onAddCandidates}
          onNotify={onNotify}
        />
      )}
    </div>
  )
}
