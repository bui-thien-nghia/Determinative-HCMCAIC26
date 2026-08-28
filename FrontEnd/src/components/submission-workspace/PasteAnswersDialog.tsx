import { useEffect, useState } from 'react'
import { ClipboardPaste, RotateCcw, X } from 'lucide-react'
import {
  filenameForPackageQuery,
  parsePastedCandidates,
  type PackageQuery,
  type ParsedPasteResult,
  type QueryCandidate,
} from '../../utils/submission'
import CandidateImportReview from './CandidateImportReview'

type PasteAnswersDialogProps = {
  query: PackageQuery
  onClose: () => void
  onApply: (queryId: string, candidates: QueryCandidate[]) => number
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void
}

function displayType(type: PackageQuery['type']) {
  return type === 'QA' ? 'Q&A' : type
}

export default function PasteAnswersDialog({
  query,
  onClose,
  onApply,
  onNotify,
}: PasteAnswersDialogProps) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ParsedPasteResult | null>(null)
  const queryName = filenameForPackageQuery(query).replace(/\.csv$/i, '')
  const eligibleCount = result?.eligibleCandidates.length ?? 0
  const errorCount = result?.rows.filter((row) => row.status === 'ERROR').length ?? 0
  const duplicateCount = result?.rows.filter((row) => row.status === 'DUPLICATE').length ?? 0
  const limitCount = result?.rows.filter((row) => row.status === 'LIMIT').length ?? 0

  useEffect(() => {
    setText('')
    setResult(null)
  }, [query.id, query.type])

  const handleParse = () => {
    setResult(parsePastedCandidates(query, text))
  }

  const handleClear = () => {
    setText('')
    setResult(null)
  }

  const handleApply = () => {
    if (!result || result.queryId !== query.id || result.queryType !== query.type) {
      onNotify('Paste target changed. Parse the rows again.', 'error')
      return
    }
    if (result.eligibleCandidates.length === 0) return
    const added = onApply(query.id, result.eligibleCandidates)
    if (added > 0) {
      onNotify(`Added ${added} pasted row(s) to ${queryName}`, 'success')
      onClose()
    } else {
      onNotify('No pasted rows were added.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(760px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
              <ClipboardPaste size={15} className="text-blue-300" />
              Paste Answers
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span>Target:</span>
              <span className="truncate font-mono text-blue-300" title={queryName}>{queryName}</span>
              <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-bold text-slate-300">
                {displayType(query.type)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-red-600 hover:text-white"
            title="Close paste answers"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {!result ? (
            <div className="flex flex-col gap-3">
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Paste one or more competition-format rows
                </span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={10}
                  autoFocus
                  spellCheck={false}
                  placeholder={
                    query.type === 'QA'
                      ? 'L21_V003,26174,"Năm người"'
                      : query.type === 'TRAKE'
                        ? 'L24_V031,5315,5623,5700'
                        : 'L30_V046,6683'
                  }
                  className="w-full resize-y rounded border border-slate-800 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
                />
              </label>
              <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
                Blank lines are ignored. Q&A answers may contain commas and escaped quotes inside double quotes.
              </div>
            </div>
          ) : (
            <CandidateImportReview query={query} result={result} sourceLabel="Pasted Rows" />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0 text-[10px] text-slate-500">
            {result ? (
              <span>
                {eligibleCount} eligible
                {errorCount > 0 && <span> / {errorCount} error</span>}
                {duplicateCount > 0 && <span> / {duplicateCount} duplicate</span>}
                {limitCount > 0 && <span> / {limitCount} over limit</span>}
              </span>
            ) : (
              <span>{query.candidates.length} existing candidate(s)</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={!text && !result}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={12} />
              Clear
            </button>
            {result ? (
              <>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={eligibleCount === 0}
                  className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add {eligibleCount} Valid Row{eligibleCount === 1 ? '' : 's'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!text.trim()}
                  className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Parse
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
