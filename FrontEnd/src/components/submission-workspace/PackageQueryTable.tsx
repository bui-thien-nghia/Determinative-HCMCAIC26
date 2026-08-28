import { useEffect, useRef } from 'react'
import {
  filenameForPackageQuery,
  getPackageQueryCandidateCount,
  type PackageQuery,
  type PackageValidationResult,
  type PackageQueryStatus,
  type SubmissionQueryType,
  type TeamSubmissionPackage,
} from '../../utils/submission'

const queryTypes: SubmissionQueryType[] = ['KIS', 'QA', 'TRAKE']
const tableGridColumns = 'grid-cols-[1.25rem_minmax(0,1fr)_3.35rem_2rem_3.65rem]'

type PackageQueryTableProps = {
  teamPackage: TeamSubmissionPackage
  onSelectQuery: (queryId: string) => void
  onChangeType: (queryId: string, type: SubmissionQueryType) => void
  validation?: PackageValidationResult
}

export default function PackageQueryTable({
  teamPackage,
  onSelectQuery,
  onChangeType,
  validation,
}: PackageQueryTableProps) {
  const validationById = new Map(validation?.queries.map((query) => [query.queryId, query]))

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden rounded border border-slate-800 bg-slate-950/60">
      <div className="max-h-76 w-full max-w-full overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className={`sticky top-0 z-10 grid ${tableGridColumns} w-full max-w-full gap-1 border-b border-slate-800 bg-slate-950 px-1.5 py-1.5 text-[7px] font-bold uppercase tracking-wider text-slate-500`}>
          <span>#</span>
          <span>Query</span>
          <span className="text-center">Type</span>
          <span className="text-center">Cand.</span>
          <span className="text-center">Status</span>
        </div>
        <div className="flex w-full max-w-full min-w-0 flex-col">
          {teamPackage.queries.map((query) => (
            <PackageQueryRow
              key={query.id}
              query={query}
              active={teamPackage.activeQueryId === query.id}
              status={validationById.get(query.id)?.status}
              validation={validationById.get(query.id)}
              onSelect={() => onSelectQuery(query.id)}
              onChangeType={(type) => onChangeType(query.id, type)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PackageQueryRow({
  query,
  active,
  status,
  validation,
  onSelect,
  onChangeType,
}: {
  query: PackageQuery
  active: boolean
  status?: PackageQueryStatus
  validation?: PackageValidationResult['queries'][number]
  onSelect: () => void
  onChangeType: (type: SubmissionQueryType) => void
}) {
  const filename = filenameForPackageQuery(query)
  const queryName = filename.replace(/\.csv$/i, '')
  const candidateCount = getPackageQueryCandidateCount(query)
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active || !rowRef.current) return
    const container = rowRef.current.parentElement?.parentElement
    if (!container) return
    const rowBounds = rowRef.current.getBoundingClientRect()
    const containerBounds = container.getBoundingClientRect()
    if (rowBounds.top < containerBounds.top || rowBounds.bottom > containerBounds.bottom) {
      rowRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  const handleTypeChange = (nextType: SubmissionQueryType) => {
    if (nextType === query.type) return
    if (candidateCount > 0) {
      const confirmed = window.confirm('Changing query type will clear existing candidates. Change type?')
      if (!confirmed) return
    }
    onChangeType(nextType)
  }

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`grid ${tableGridColumns} w-full max-w-full items-center gap-1 border-b px-1.5 py-1.5 text-[10px] outline-none transition-colors last:border-b-0 ${
        active
          ? 'border-blue-500/40 bg-blue-950/35 ring-1 ring-inset ring-blue-500/40'
          : 'border-slate-800 hover:bg-slate-900/80 focus-visible:bg-slate-900'
      }`}
    >
      <div className={`font-mono ${active ? 'font-bold text-blue-200' : 'text-slate-500'}`}>{query.queryNumber}</div>
      <div className="min-w-0">
        <span className={`block truncate font-mono ${active ? 'font-bold text-blue-100' : 'text-slate-200'}`} title={queryName}>
          {queryName}
        </span>
      </div>
      <select
        value={query.type}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => handleTypeChange(event.target.value as SubmissionQueryType)}
        className="h-6 w-full min-w-0 rounded border border-slate-700 bg-slate-950 px-0.5 text-[8px] font-bold text-slate-200 outline-none focus:border-blue-500"
        aria-label={`Query ${query.queryNumber} type`}
      >
        {queryTypes.map((type) => (
          <option key={type} value={type}>{type === 'QA' ? 'Q&A' : type}</option>
        ))}
      </select>
      <div className="text-center font-mono text-slate-300" title={`${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`}>
        {candidateCount}
      </div>
      <div className="flex min-w-0 justify-center">
        {status && <StatusBadge status={status} validation={validation} />}
      </div>
    </div>
  )
}

function tooltipMessage(message: string) {
  if (message.toLowerCase().includes('duplicate candidate')) return 'Duplicate candidate.'
  return message
}

function errorTooltipLines(validation?: PackageValidationResult['queries'][number]) {
  if (!validation) return []
  return validation.errors.slice(0, 5).map((issue) => {
    const message = tooltipMessage(issue.message)
    return issue.candidateIndex == null
      ? message
      : `Candidate ${issue.candidateIndex + 1}: ${message}`
  })
}

function StatusBadge({
  status,
  validation,
}: {
  status: PackageQueryStatus
  validation?: PackageValidationResult['queries'][number]
}) {
  const label = status === 'UNANSWERED' ? 'EMPTY' : status
  const className = {
    READY: 'border-emerald-700/50 bg-emerald-950/25 text-emerald-300',
    ERROR: 'border-red-800/60 bg-red-950/30 text-red-300',
    UNANSWERED: 'border-slate-700 bg-slate-900 text-slate-400',
  }[status]
  const tooltipLines = status === 'ERROR' ? errorTooltipLines(validation) : []
  const remainingErrorCount = status === 'ERROR' && validation
    ? Math.max(0, validation.errors.length - tooltipLines.length)
    : 0

  return (
    <span className="group/status relative flex w-full max-w-full justify-center">
      <span
        className={`inline-flex w-full max-w-full justify-center rounded border px-0.5 py-0.5 text-[7px] font-bold uppercase leading-none tracking-normal ${className} ${
          status === 'ERROR' ? 'cursor-help focus:outline-none focus:ring-1 focus:ring-red-500/60' : ''
        }`}
        tabIndex={status === 'ERROR' ? 0 : undefined}
        aria-label={status === 'ERROR' && tooltipLines.length > 0 ? `Error: ${tooltipLines.join(' ')}` : undefined}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {label}
      </span>
      {tooltipLines.length > 0 && (
        <div className="pointer-events-none invisible absolute right-full top-1/2 z-[10001] mr-2 w-64 max-w-[calc(100vw-2rem)] -translate-y-1/2 rounded border border-red-800/70 bg-slate-950 px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-100 opacity-0 shadow-2xl transition-opacity group-hover/status:visible group-hover/status:opacity-100 group-focus-within/status:visible group-focus-within/status:opacity-100">
          <div className="flex flex-col gap-1">
            {tooltipLines.map((line, index) => (
              <div key={`${line}-${index}`} className="flex gap-1.5">
                <span className="text-red-400">•</span>
                <span>{line}</span>
              </div>
            ))}
            {remainingErrorCount > 0 && (
              <div className="pl-3.5 text-slate-400">+{remainingErrorCount} more errors</div>
            )}
          </div>
        </div>
      )}
    </span>
  )
}
