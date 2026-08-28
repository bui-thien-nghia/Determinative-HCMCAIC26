import { useRef, useState } from 'react'
import { FileUp, RotateCcw, X } from 'lucide-react'
import {
  DEFAULT_TEAM_QUERY_COUNT,
  MAX_SUBMISSION_ROWS,
  filenameForPackageQuery,
  parsePastedCandidates,
  parseSubmissionFilename,
  splitSubmissionCsvRecords,
  type PackageQuery,
  type ParsedPasteResult,
  type ParsedSubmissionFilename,
  type QueryCandidate,
} from '../../utils/submission'
import CandidateImportReview from './CandidateImportReview'

type CsvImportDialogProps = {
  activeQuery: PackageQuery
  onClose: () => void
  onApply: (queryId: string, candidates: QueryCandidate[]) => number
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void
}

type CsvReviewState = {
  filename: string
  text: string
  fileErrors: string[]
  metadata: ParsedSubmissionFilename
  parseQuery?: PackageQuery
  result?: ParsedPasteResult
  activeMatches: boolean
  importBlockReason?: string
}

function displayType(type?: PackageQuery['type']) {
  if (!type) return '--'
  return type === 'QA' ? 'Q&A' : type
}

function queryName(query: Pick<PackageQuery, 'queryNumber' | 'type'>) {
  return filenameForPackageQuery(query).replace(/\.csv$/i, '')
}

function nonEmptyLineCount(text: string) {
  return splitSubmissionCsvRecords(text).length
}

function buildParseQuery(activeQuery: PackageQuery, metadata: ParsedSubmissionFilename, activeMatches: boolean): PackageQuery | undefined {
  if (!metadata.queryNumber || !metadata.type) return undefined
  if (activeMatches) return activeQuery
  return {
    id: `csv-review-query-${metadata.queryNumber}`,
    queryNumber: metadata.queryNumber,
    type: metadata.type,
    candidates: [],
    reviewed: false,
    notes: '',
    updatedAt: 0,
  }
}

export default function CsvImportDialog({
  activeQuery,
  onClose,
  onApply,
  onNotify,
}: CsvImportDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [review, setReview] = useState<CsvReviewState | null>(null)
  const [loading, setLoading] = useState(false)
  const activeQueryName = queryName(activeQuery)
  const eligibleCount = review?.result?.eligibleCandidates.length ?? 0
  const rowCount = review?.result?.rows.length ?? 0
  const errorCount = (review?.result?.rows.filter((row) => row.status === 'ERROR').length ?? 0) + (review?.fileErrors.length ?? 0)
  const warningCount = review?.result?.rows.filter((row) => row.warnings.length > 0).length ?? 0
  const alreadyExistsCount = review?.result?.rows.filter((row) => (
    row.warnings.some((warning) => warning.includes('already exists'))
  )).length ?? 0
  const validCount = review?.result?.rows.filter((row) => row.errors.length === 0).length ?? 0
  const hasAnyErrors = errorCount > 0
  const importDisabled = !review
    || !review.activeMatches
    || review.fileErrors.length > 0
    || eligibleCount === 0
  const detectedName = review?.metadata.queryNumber && review.metadata.type
    ? `query-${review.metadata.queryNumber}-${review.metadata.type === 'QA' ? 'qa' : review.metadata.type.toLowerCase()}`
    : '--'

  const chooseFile = () => {
    inputRef.current?.click()
  }

  const clearReview = () => {
    setReview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)

    try {
      const text = await file.text()
      const metadata = parseSubmissionFilename(file.name, DEFAULT_TEAM_QUERY_COUNT)
      const fileErrors = [...metadata.errors]
      const rows = nonEmptyLineCount(text)
      if (metadata.errors.length === 0) {
        if (rows === 0) fileErrors.push('File is empty.')
        if (rows > MAX_SUBMISSION_ROWS) {
          fileErrors.push(`CSV contains ${rows} non-empty rows; maximum ${MAX_SUBMISSION_ROWS} rows allowed.`)
        }
      }

      const activeMatches = metadata.queryNumber === activeQuery.queryNumber && metadata.type === activeQuery.type
      const parseQuery = buildParseQuery(activeQuery, metadata, activeMatches)
      const result = parseQuery
        ? parsePastedCandidates(parseQuery, text, {
            strictOfficialVideoId: true,
            expectedEventCount: activeMatches ? activeQuery.expectedEventCount : undefined,
          })
        : undefined
      const importBlockReason = !activeMatches && metadata.queryNumber && metadata.type
        ? `This file belongs to ${detectedNameFromMetadata(metadata)}.`
        : fileErrors.length > 0
          ? 'Official filename and file-level validation must pass before import.'
          : undefined

      setReview({
        filename: file.name,
        text,
        fileErrors,
        metadata,
        parseQuery,
        result,
        activeMatches,
        importBlockReason,
      })
    } catch (error) {
      setReview({
        filename: file.name,
        text: '',
        fileErrors: [error instanceof Error ? error.message : 'Unable to read CSV file.'],
        metadata: { filename: file.name, errors: [] },
        activeMatches: false,
        importBlockReason: 'File could not be read.',
      })
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  const handleImport = () => {
    if (!review?.result || importDisabled) return
    const added = onApply(activeQuery.id, review.result.eligibleCandidates)
    if (added > 0) {
      onNotify(`Imported ${added} row(s) into ${activeQueryName}`, 'success')
      onClose()
    } else {
      onNotify('No CSV rows were imported.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(820px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
              <FileUp size={15} className="text-blue-300" />
              CSV Review
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span>Active target:</span>
              <span className="truncate font-mono text-blue-300" title={activeQueryName}>{activeQueryName}</span>
              <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-bold text-slate-300">
                {displayType(activeQuery.type)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-red-600 hover:text-white"
            title="Close CSV review"
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {!review ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={chooseFile}
                disabled={loading}
                className="flex min-h-36 flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-blue-950/20 disabled:cursor-wait disabled:opacity-60"
              >
                <FileUp size={26} className="text-blue-300" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {loading ? 'Reading CSV...' : 'Choose CSV File'}
                </span>
                <span className="text-[11px] text-slate-500">One official query CSV at a time.</span>
              </button>
              <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
                Validation uses the same parser as Paste Answers. Import is enabled only when the filename matches the active query.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <CsvSummary
                review={review}
                activeQueryName={activeQueryName}
                detectedName={detectedName}
                rowCount={rowCount}
                validCount={validCount}
                warningCount={warningCount}
                errorCount={errorCount}
                alreadyExistsCount={alreadyExistsCount}
                importableCount={eligibleCount}
              />
              {review.result && review.parseQuery ? (
                <CandidateImportReview query={review.parseQuery} result={review.result} sourceLabel="File Rows" />
              ) : (
                <div className="rounded border border-red-900/50 bg-red-950/20 px-3 py-4 text-sm text-red-300">
                  Official CSV validation could not run for this filename.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0 text-[10px] text-slate-500">
            {review ? (
              hasAnyErrors
                ? 'FILE HAS ERRORS'
                : 'VALIDATION COMPLETE'
            ) : (
              'Select an individual .csv file'
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={clearReview}
              disabled={!review}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={12} />
              Clear
            </button>
            <button
              type="button"
              onClick={chooseFile}
              disabled={loading}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
            >
              Choose Another
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importDisabled}
              title={review?.importBlockReason || undefined}
              className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {eligibleCount} Row{eligibleCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function detectedNameFromMetadata(metadata: ParsedSubmissionFilename) {
  if (!metadata.queryNumber || !metadata.type) return '--'
  return `query-${metadata.queryNumber}-${metadata.type === 'QA' ? 'qa' : metadata.type.toLowerCase()}`
}

function CsvSummary({
  review,
  activeQueryName,
  detectedName,
  rowCount,
  validCount,
  warningCount,
  errorCount,
  alreadyExistsCount,
  importableCount,
}: {
  review: CsvReviewState
  activeQueryName: string
  detectedName: string
  rowCount: number
  validCount: number
  warningCount: number
  errorCount: number
  alreadyExistsCount: number
  importableCount: number
}) {
  const fileValid = review.fileErrors.length === 0 && errorCount === 0

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-800 bg-slate-900/50 p-3">
      <div className="grid grid-cols-2 gap-2 text-[10px] md:grid-cols-4">
        <Info label="File" value={review.filename} mono />
        <Info label="Detected" value={detectedName} mono />
        <Info label="Type" value={displayType(review.metadata.type)} />
        <Info label="Target" value={activeQueryName} mono />
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] md:grid-cols-6">
        <Info label="File Rows" value={rowCount} />
        <Info label="Valid" value={validCount} />
        <Info label="Warnings" value={warningCount} />
        <Info label="Errors" value={errorCount} />
        <Info label="Already Exists" value={alreadyExistsCount} />
        <Info label="Importable" value={importableCount} />
      </div>

      <div className={`rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
        fileValid ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300' : 'border-red-900/50 bg-red-950/20 text-red-300'
      }`}>
        {fileValid ? 'File format valid' : 'File has errors'}
      </div>

      {review.fileErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded border border-red-900/50 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-300">
          {review.fileErrors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}

      {review.importBlockReason && (
        <div className="rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-300">
          {review.importBlockReason}
        </div>
      )}
    </div>
  )
}

function Info({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded border border-slate-800 bg-slate-950 px-2 py-1.5">
      <div className="truncate text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-xs font-bold text-slate-100 ${mono ? 'font-mono' : ''}`} title={String(value)}>
        {value}
      </div>
    </div>
  )
}
