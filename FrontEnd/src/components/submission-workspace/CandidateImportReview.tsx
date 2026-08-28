import type { PackageQuery, ParsedPasteResult, ParsedPasteRow } from '../../utils/submission'

type CandidateImportReviewProps = {
  query: PackageQuery
  result: ParsedPasteResult
  sourceLabel?: string
  mode?: 'import' | 'review'
}

export function rowStatusClass(row: ParsedPasteRow) {
  switch (row.status) {
    case 'OK':
      return 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300'
    case 'DUPLICATE':
      return 'border-amber-700/50 bg-amber-950/20 text-amber-300'
    case 'LIMIT':
      return 'border-blue-700/50 bg-blue-950/20 text-blue-300'
    default:
      return 'border-red-800/60 bg-red-950/25 text-red-300'
  }
}

export function rowMessages(row: ParsedPasteRow) {
  return [...row.errors, ...row.warnings]
}

export default function CandidateImportReview({
  query,
  result,
  sourceLabel = 'Rows',
  mode = 'import',
}: CandidateImportReviewProps) {
  if (result.rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-800 bg-slate-900/40 px-3 py-8 text-center text-sm text-slate-500">
        {mode === 'review' ? 'No candidates yet.' : 'No non-empty rows were found.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        {mode === 'review' ? (
          <>
            <SummaryTile label="Candidates" value={result.rows.length} />
            <SummaryTile label="OK" value={result.rows.filter((row) => row.status === 'OK').length} />
            <SummaryTile label="Issues" value={result.rows.filter((row) => row.status !== 'OK' || row.warnings.length > 0).length} />
          </>
        ) : (
          <>
            <SummaryTile label="Existing" value={result.existingCandidateCount} />
            <SummaryTile label={sourceLabel} value={result.rows.length} />
            <SummaryTile label="Can Add" value={`${result.eligibleCandidates.length} / ${result.capacity}`} />
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-slate-800 custom-scrollbar">
        <table className="min-w-full border-collapse text-left text-[10px]">
          <thead className="bg-slate-900 text-[9px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-12 px-2 py-1.5">Line</th>
              <th className="px-2 py-1.5">Video ID</th>
              {query.type === 'TRAKE' ? (
                <>
                  <th className="px-2 py-1.5">Events</th>
                  <th className="w-14 px-2 py-1.5 text-right">Count</th>
                </>
              ) : (
                <th className="w-24 px-2 py-1.5">Frame Idx</th>
              )}
              {query.type === 'QA' && (
                <>
                  <th className="px-2 py-1.5">Answer</th>
                  <th className="w-14 px-2 py-1.5 text-right">Len</th>
                </>
              )}
              <th className="w-24 px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <PreviewRow key={`${row.lineNumber}-${row.raw}`} query={query} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewRow({ query, row }: { query: PackageQuery; row: ParsedPasteRow }) {
  const candidate = row.candidate
  const messages = rowMessages(row)
  const videoId = row.fields[0] || candidate?.videoId || '--'

  return (
    <tr className="border-t border-slate-800 bg-slate-950/50 align-top text-slate-300">
      <td className="px-2 py-2 font-mono text-slate-500">{row.lineNumber}</td>
      <td className="max-w-32 px-2 py-2 font-mono">
        <div className="truncate" title={videoId}>{videoId}</div>
        <div className="mt-1 truncate text-[9px] text-slate-600" title={row.raw}>{row.raw}</div>
        {messages.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            {messages.map((message) => (
              <span key={message} className="text-[9px] text-slate-500">{message}</span>
            ))}
          </div>
        )}
      </td>
      {query.type === 'TRAKE' ? (
        <>
          <td className="max-w-72 px-2 py-2 font-mono">
            <div className="truncate" title={candidate?.type === 'TRAKE' ? candidate.frameOrders.join(' -> ') : row.fields.slice(1).join(' -> ')}>
              {candidate?.type === 'TRAKE' ? candidate.frameOrders.join(' -> ') : row.fields.slice(1).join(' -> ') || '--'}
            </div>
          </td>
          <td className="px-2 py-2 text-right font-mono">
            {candidate?.type === 'TRAKE' ? candidate.frameOrders.length : '--'}
          </td>
        </>
      ) : (
        <td className="px-2 py-2 font-mono">
          {candidate?.type === 'KIS' || candidate?.type === 'QA' ? candidate.frameOrder : row.fields[1] || '--'}
        </td>
      )}
      {query.type === 'QA' && (
        <>
          <td className="max-w-56 px-2 py-2">
            <div className="truncate" title={candidate?.type === 'QA' ? candidate.answer : row.fields[2] || ''}>
              {candidate?.type === 'QA' ? candidate.answer : row.fields[2] || '--'}
            </div>
          </td>
          <td className="px-2 py-2 text-right font-mono">
            {candidate?.type === 'QA' ? candidate.answer.length : (row.fields[2] || '').length}
          </td>
        </>
      )}
      <td className="px-2 py-2">
        <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${rowStatusClass(row)}`}>
          {row.status}
        </span>
      </td>
    </tr>
  )
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 px-2 py-1.5">
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-bold text-slate-100">{value}</div>
    </div>
  )
}
