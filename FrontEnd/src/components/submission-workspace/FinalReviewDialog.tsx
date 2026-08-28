import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Download, XCircle } from 'lucide-react'
import {
  MAX_SUBMISSION_ROWS,
  createTeamSubmissionZip,
  downloadBlob,
  validateTeamSubmissionPackage,
  type PackageQuery,
  type PackageQueryStatus,
  type PackageValidationResult,
  type ParsedPasteResult,
  type ParsedPasteRow,
  type QueryCandidate,
  type QueryValidationIssue,
  type QueryValidationResult,
  type TeamSubmissionPackage,
} from '../../utils/submission'
import CandidateImportReview from './CandidateImportReview'

type FinalReviewDialogProps = {
  teamPackage: TeamSubmissionPackage
  validation: PackageValidationResult
  onClose: () => void
  onEditQuery: (queryId: string) => void
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void
}

function displayType(type: PackageQuery['type']) {
  return type === 'QA' ? 'Q&A' : type
}

function statusClass(status: PackageQueryStatus) {
  return {
    READY: 'border-emerald-700/50 bg-emerald-950/25 text-emerald-300',
    ERROR: 'border-red-800/60 bg-red-950/30 text-red-300',
    UNANSWERED: 'border-slate-700 bg-slate-900 text-slate-400',
  }[status]
}

function statusIcon(status: PackageQueryStatus) {
  if (status === 'READY') return <CheckCircle2 size={13} />
  if (status === 'ERROR') return <XCircle size={13} />
  return <ClipboardCheck size={13} />
}

function candidateFields(candidate: QueryCandidate) {
  if (candidate.type === 'TRAKE') {
    return [candidate.videoId, ...candidate.frameOrders.map((frameOrder) => String(frameOrder))]
  }
  if (candidate.type === 'QA') {
    return [candidate.videoId, String(candidate.frameOrder), candidate.answer]
  }
  return [candidate.videoId, String(candidate.frameOrder)]
}

function issuesForCandidate(
  validation: QueryValidationResult,
  candidate: QueryCandidate,
  candidateIndex: number,
  severity: QueryValidationIssue['severity'],
) {
  return [...validation.errors, ...validation.warnings]
    .filter((issue) => issue.severity === severity)
    .filter((issue) => issue.candidateId === candidate.id || issue.candidateIndex === candidateIndex)
    .map((issue) => issue.message)
}

function validationToReviewRows(query: PackageQuery, validation: QueryValidationResult): ParsedPasteResult {
  const rows: ParsedPasteRow[] = query.candidates.map((candidate, index) => {
    const errors = issuesForCandidate(validation, candidate, index, 'error')
    const warnings = issuesForCandidate(validation, candidate, index, 'warning')
    const candidateMatchesQuery = candidate.type === query.type
    const fields = candidateFields(candidate)
    return {
      lineNumber: index + 1,
      raw: fields.join(','),
      fields,
      candidate: candidateMatchesQuery ? candidate : undefined,
      errors,
      warnings,
      status: errors.length > 0 ? 'ERROR' : 'OK',
      eligible: false,
    }
  })

  return {
    queryId: query.id,
    queryType: query.type,
    existingCandidateCount: query.candidates.length,
    capacity: Math.max(0, MAX_SUBMISSION_ROWS - query.candidates.length),
    rows,
    eligibleCandidates: [],
  }
}

function queryLevelIssues(validation: QueryValidationResult) {
  return [...validation.errors, ...validation.warnings].filter((issue) => (
    issue.candidateId == null && issue.candidateIndex == null
  ))
}

export default function FinalReviewDialog({
  teamPackage,
  validation,
  onClose,
  onEditQuery,
  onNotify,
}: FinalReviewDialogProps) {
  const firstProblemQuery = validation.queries.find((query) => query.status === 'ERROR')
    ?? validation.queries.find((query) => query.status === 'UNANSWERED')
    ?? validation.queries[0]
  const [selectedQueryId, setSelectedQueryId] = useState(firstProblemQuery?.queryId ?? null)

  useEffect(() => {
    if (!selectedQueryId || !validation.queries.some((query) => query.queryId === selectedQueryId)) {
      setSelectedQueryId(firstProblemQuery?.queryId ?? null)
    }
  }, [firstProblemQuery?.queryId, selectedQueryId, validation.queries])

  const selectedValidation = validation.queries.find((query) => query.queryId === selectedQueryId)
    ?? firstProblemQuery
    ?? null
  const selectedQuery = teamPackage.queries.find((query) => query.id === selectedValidation?.queryId) ?? null
  const reviewRows = useMemo(() => (
    selectedQuery && selectedValidation
      ? validationToReviewRows(selectedQuery, selectedValidation)
      : null
  ), [selectedQuery, selectedValidation])
  const selectedIssues = selectedValidation ? queryLevelIssues(selectedValidation) : []
  const packageIssues = [...validation.packageErrors, ...validation.packageWarnings]

  const gateLabel = validation.packageErrors.length > 0 || validation.errorCount > 0 || validation.unansweredCount > 0
    ? 'NOT READY FOR EXPORT'
    : 'READY FOR FINAL EXPORT'
  const gateDetail = validation.packageErrors.length > 0 || validation.errorCount > 0
    ? 'Fix all validation errors before final submission.'
    : validation.unansweredCount > 0
      ? 'Add at least one candidate to every query before final submission.'
      : 'All 25 queries are answered and structurally valid.'
  const canDownload = validation.canProceedToFinalExport

  const handleDownloadSubmission = () => {
    const currentValidation = validateTeamSubmissionPackage(teamPackage)
    if (!currentValidation.canProceedToFinalExport) {
      onNotify('Cannot export submission. Fix all validation errors first.', 'error')
      return
    }

    try {
      const result = createTeamSubmissionZip(teamPackage)
      downloadBlob(result.blob, 'submission.zip')
      onNotify(`submission.zip generated successfully. ${result.files.length} query CSV files.`, 'success')
    } catch (error) {
      console.error(error)
      onNotify('Failed to generate submission.zip.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-[min(980px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
              <ClipboardCheck size={15} className="text-blue-300" />
              Final Submission Review
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Check the 25-query team package before downloading submission.zip.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-red-600 hover:text-white"
            title="Close final review"
          >
            <XCircle size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-slate-800 bg-slate-950/70 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-3 gap-2 border-b border-slate-800 p-3 text-[10px]">
              <Metric label="Ready" value={validation.readyCount} tone="ready" />
              <Metric label="Unanswered" value={validation.unansweredCount} tone="unanswered" />
              <Metric label="Error" value={validation.errorCount} tone="error" />
              <Metric label="Queries" value={validation.totalQueries} />
              <Metric label="CSV Files" value={validation.totalQueries} />
              <Metric label="Package" value="submission.zip" />
            </div>

            {packageIssues.length > 0 && (
              <div className="border-b border-red-900/40 bg-red-950/15 p-3 text-[10px] text-red-300">
                <div className="mb-1 font-bold uppercase tracking-wider">Package Issues</div>
                <div className="flex flex-col gap-1">
                  {packageIssues.map((issue) => <span key={`${issue.code}-${issue.message}`}>{issue.message}</span>)}
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
              {validation.queries.map((query) => (
                <button
                  key={query.queryId}
                  type="button"
                  onClick={() => setSelectedQueryId(query.queryId)}
                  className={`mb-1 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-[10px] transition-colors ${
                    selectedQueryId === query.queryId
                      ? 'border-blue-500/50 bg-blue-950/30'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900'
                  }`}
                >
                  <span className="w-5 shrink-0 font-mono text-slate-500">{query.queryNumber}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-200" title={query.filename}>
                    {query.filename.replace(/\.csv$/i, '')}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase ${statusClass(query.status)}`}>
                    {query.status}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {selectedQuery && selectedValidation && reviewRows ? (
              <div className="flex flex-col gap-4">
                <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Query {selectedQuery.queryNumber}
                      </div>
                      <div className="mt-1 truncate font-mono text-sm font-bold text-slate-100" title={selectedValidation.filename}>
                        {selectedValidation.filename.replace(/\.csv$/i, '')}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-bold uppercase ${statusClass(selectedValidation.status)}`}>
                      {statusIcon(selectedValidation.status)}
                      {selectedValidation.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                    <Info label="Type" value={displayType(selectedQuery.type)} />
                    <Info label="Candidates" value={selectedValidation.candidateCount} />
                    <Info label="Can Export" value={selectedValidation.status === 'READY' ? 'Yes' : 'No'} />
                  </div>

                  {selectedIssues.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-2 text-[10px] text-slate-300">
                      <div className="font-bold uppercase tracking-wider text-slate-500">Issues</div>
                      {selectedIssues.map((issue) => (
                        <span
                          key={`${issue.code}-${issue.message}`}
                          className={issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'}
                        >
                          {issue.message}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onEditQuery(selectedQuery.id)}
                      className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500"
                    >
                      Edit Query
                    </button>
                  </div>
                </div>

                <CandidateImportReview query={selectedQuery} result={reviewRows} sourceLabel="Candidates" mode="review" />
              </div>
            ) : (
              <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-8 text-center text-sm text-slate-500">
                No query selected.
              </div>
            )}
          </main>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className={`text-[10px] font-bold uppercase tracking-wider ${
              validation.canProceedToFinalExport ? 'text-emerald-300' : 'text-red-300'
            }`}>
              {gateLabel}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {gateDetail} Final package: submission.zip.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownloadSubmission}
              disabled={!canDownload}
              title={canDownload ? 'Download submission.zip' : 'Fix all validation errors before export'}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={12} />
              Download Submission.zip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'ready' | 'unanswered' | 'error'
}) {
  const toneClass = {
    neutral: 'border-slate-800 bg-slate-900 text-slate-100',
    ready: 'border-emerald-900/60 bg-emerald-950/20 text-emerald-200',
    unanswered: 'border-slate-700 bg-slate-900 text-slate-300',
    error: 'border-red-900/60 bg-red-950/20 text-red-200',
  }[tone]

  return (
    <div className={`min-w-0 rounded border px-2 py-1.5 ${toneClass}`}>
      <div className="truncate text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-bold">{value}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded border border-slate-800 bg-slate-950 px-2 py-1.5">
      <div className="truncate text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-bold text-slate-100" title={String(value)}>{value}</div>
    </div>
  )
}
