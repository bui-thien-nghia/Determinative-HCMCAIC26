import type { PackageValidationResult, TeamSubmissionPackage } from '../../utils/submission'

type PackageSummaryProps = {
  teamPackage: TeamSubmissionPackage
  validation?: PackageValidationResult
}

export default function PackageSummary({ teamPackage, validation }: PackageSummaryProps) {
  const total = teamPackage.queries.length

  return (
    <div className="grid grid-cols-2 gap-2">
      <SummaryTile label="Queries" value={total} />
      <SummaryTile label="Ready" value={validation?.readyCount ?? 0} tone="ready" />
      <SummaryTile label="Empty" value={validation?.unansweredCount ?? total} tone="unanswered" />
      <SummaryTile label="Error" value={validation?.errorCount ?? 0} tone="error" />
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'ready' | 'unanswered' | 'error'
}) {
  const toneClass = {
    neutral: 'border-slate-800 bg-slate-950 text-slate-100',
    ready: 'border-emerald-900/60 bg-emerald-950/20 text-emerald-200',
    unanswered: 'border-slate-700 bg-slate-900 text-slate-300',
    error: 'border-red-900/60 bg-red-950/20 text-red-200',
  }[tone]

  return (
    <div className={`min-w-0 rounded border px-2 py-1 ${toneClass}`}>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className="mt-0.5 text-xs font-bold truncate">{value}</div>
    </div>
  )
}
