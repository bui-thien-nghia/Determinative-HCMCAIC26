import { useMemo, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import {
  MAX_PACKAGE_QUERY_COUNT,
  MAX_TRAKE_EVENT_COUNT,
  displaySubmissionQueryType,
  filenameForPackageQuery,
  getPackageQueryByNumber,
  packageQueryHasData,
  queryPlanFromPackage,
  validateFilenameTemplate,
  type PackageSetupConfig,
  type PackageSetupQueryPlan,
  type SubmissionQueryType,
  type TeamSubmissionPackage,
} from '../../utils/submission'

const queryTypes: SubmissionQueryType[] = ['KIS', 'QA', 'TRAKE']

type PackageSetupDialogProps = {
  teamPackage: TeamSubmissionPackage
  onClose: () => void
  onApply: (config: PackageSetupConfig) => void
}

function typeCounts(plan: PackageSetupQueryPlan[]) {
  return plan.reduce<Record<SubmissionQueryType, number>>((counts, query) => {
    counts[query.type] += 1
    return counts
  }, { KIS: 0, QA: 0, TRAKE: 0 })
}

function resizePlan(plan: PackageSetupQueryPlan[], queryCount: number) {
  return Array.from({ length: queryCount }, (_, index): PackageSetupQueryPlan => {
    const queryNumber = index + 1
    return plan[index] ?? { queryNumber, type: 'KIS' }
  }).map((query, index) => ({ ...query, queryNumber: index + 1 }))
}

function normalizeEventCount(value: string) {
  if (!value.trim()) return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(1, Math.min(MAX_TRAKE_EVENT_COUNT, Math.floor(numeric)))
}

function parseIntegerDraft(value: string) {
  if (!value.trim()) return null
  const numeric = Number(value)
  return Number.isInteger(numeric) ? numeric : null
}

function previewRows(queryCount: number, filenameTemplate: string) {
  const query15 = Math.min(15, queryCount)
  const query16 = Math.min(16, queryCount)
  const rows = [
    { label: 'Query 1 KIS', queryNumber: 1, type: 'KIS' as const },
    { label: `Query ${query15} Q&A`, queryNumber: query15, type: 'QA' as const },
    { label: `Query ${query16} TRAKE`, queryNumber: query16, type: 'TRAKE' as const },
    { label: 'Last query', queryNumber: queryCount, type: 'KIS' as const },
  ]

  return rows.filter((row, index, all) => (
    index === all.findIndex((item) => item.label === row.label && item.queryNumber === row.queryNumber && item.type === row.type)
  )).map((row) => ({
    ...row,
    filename: filenameForPackageQuery(row, filenameTemplate),
  }))
}

export default function PackageSetupDialog({
  teamPackage,
  onClose,
  onApply,
}: PackageSetupDialogProps) {
  const [queryCount, setQueryCount] = useState(String(teamPackage.queryCount))
  const [filenameTemplate, setFilenameTemplate] = useState(teamPackage.filenameTemplate)
  const [queryPlan, setQueryPlan] = useState(() => queryPlanFromPackage(teamPackage))
  const [rangeFrom, setRangeFrom] = useState('1')
  const [rangeTo, setRangeTo] = useState(String(teamPackage.queryCount))
  const [rangeType, setRangeType] = useState<SubmissionQueryType>('KIS')
  const [setAllType, setSetAllType] = useState<SubmissionQueryType>('KIS')

  const templateValidation = useMemo(() => validateFilenameTemplate(filenameTemplate), [filenameTemplate])
  const draftCounts = useMemo(() => typeCounts(queryPlan), [queryPlan])
  const currentCounts = useMemo(() => typeCounts(queryPlanFromPackage(teamPackage)), [teamPackage])
  const queryCountValue = Number(queryCount)
  const queryCountValid = queryCount.trim() !== ''
    && Number.isInteger(queryCountValue)
    && queryCountValue >= 1
    && queryCountValue <= MAX_PACKAGE_QUERY_COUNT
  const queryCountError = queryCountValid ? null : `Number of queries must be between 1 and ${MAX_PACKAGE_QUERY_COUNT}.`
  const draftQueryCount = queryPlan.length
  const parsedRangeFrom = parseIntegerDraft(rangeFrom)
  const parsedRangeTo = parseIntegerDraft(rangeTo)
  const rangeIncomplete = rangeFrom.trim() === '' || rangeTo.trim() === ''
  const rangeError = rangeIncomplete
    ? null
    : parsedRangeFrom == null || parsedRangeTo == null
      ? 'Quick Assign range must use whole query numbers.'
      : parsedRangeFrom < 1 || parsedRangeTo < 1 || parsedRangeFrom > draftQueryCount || parsedRangeTo > draftQueryCount
        ? `Quick Assign range must be within Query 1-${draftQueryCount}.`
        : parsedRangeFrom > parsedRangeTo
          ? 'From must be less than or equal to To.'
          : null
  const canApplyRange = !rangeIncomplete && !rangeError
  const preview = templateValidation.valid
    ? previewRows(draftQueryCount, templateValidation.template)
    : []

  const setDraftQueryCount = (value: string) => {
    const nextValue = value.trim()
    const numeric = Number(nextValue)
    setQueryCount(value)
    if (nextValue === '' || !Number.isInteger(numeric) || numeric < 1 || numeric > MAX_PACKAGE_QUERY_COUNT) return
    const nextCount = numeric
    setRangeTo(String(nextCount))
    setQueryPlan((current) => resizePlan(current, nextCount))
  }

  const updatePlanQuery = (queryNumber: number, patch: Partial<PackageSetupQueryPlan>) => {
    setQueryPlan((current) => current.map((query) => {
      if (query.queryNumber !== queryNumber) return query
      const type = patch.type ?? query.type
      return {
        ...query,
        ...patch,
        type,
        expectedEventCount: type === 'TRAKE'
          ? patch.expectedEventCount ?? query.expectedEventCount
          : undefined,
      }
    }))
  }

  const applyRange = () => {
    if (!canApplyRange || parsedRangeFrom == null || parsedRangeTo == null) return
    const start = parsedRangeFrom
    const end = parsedRangeTo
    setQueryPlan((current) => current.map((query) => (
      query.queryNumber >= start && query.queryNumber <= end
        ? {
            ...query,
            type: rangeType,
            expectedEventCount: rangeType === 'TRAKE' ? query.expectedEventCount : undefined,
          }
        : query
    )))
  }

  const applySetAll = () => {
    setQueryPlan((current) => current.map((query) => ({
      ...query,
      type: setAllType,
      expectedEventCount: setAllType === 'TRAKE' ? query.expectedEventCount : undefined,
    })))
  }

  const confirmDestructiveChanges = () => {
    if (draftQueryCount < teamPackage.queries.length) {
      const removed = teamPackage.queries.filter((query) => query.queryNumber > draftQueryCount)
      const removedWithData = removed.filter(packageQueryHasData)
      if (removedWithData.length > 0) {
        const labels = removedWithData.map((query) => `Query ${query.queryNumber}`).join('\n')
        if (!window.confirm(`Reducing the package to ${draftQueryCount} queries will remove answers from:\n${labels}\n\nContinue?`)) {
          return false
        }
      } else if (!window.confirm(`Reducing the package to ${draftQueryCount} queries will remove ${removed.length} empty query slot(s). Continue?`)) {
        return false
      }
    }

    const typeChangesWithData = queryPlan
      .map((draft) => {
        const existing = getPackageQueryByNumber(teamPackage, draft.queryNumber)
        return existing && existing.type !== draft.type && packageQueryHasData(existing)
          ? { existing, draft }
          : null
      })
      .filter((item): item is { existing: NonNullable<ReturnType<typeof getPackageQueryByNumber>>; draft: PackageSetupQueryPlan } => Boolean(item))

    if (typeChangesWithData.length > 0) {
      const labels = typeChangesWithData
        .map(({ existing, draft }) => `Query ${existing.queryNumber}: ${displaySubmissionQueryType(existing.type)} -> ${displaySubmissionQueryType(draft.type)}`)
        .join('\n')
      if (!window.confirm(`Changing query type will clear incompatible candidates:\n${labels}\n\nApply and clear?`)) {
        return false
      }
    }

    return true
  }

  const handleApply = () => {
    if (queryCountError) return
    if (!templateValidation.valid) return
    if (!confirmDestructiveChanges()) return
    onApply({
      queryCount: draftQueryCount,
      filenameTemplate: templateValidation.template,
      queryPlan,
    })
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-[min(900px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
              <Settings2 size={15} className="text-blue-300" />
              Package Setup
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Configure the round before solving queries.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-red-600 hover:text-white"
            title="Close package setup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="flex flex-col gap-3">
              <section className="rounded border border-slate-800 bg-slate-900/45 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Package</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <Info label="Queries" value={teamPackage.queryCount} />
                  <Info label="KIS" value={currentCounts.KIS} />
                  <Info label="Q&A" value={currentCounts.QA} />
                  <Info label="TRAKE" value={currentCounts.TRAKE} />
                </div>
                <div className="mt-2">
                  <Info label="Filename Format" value={`${teamPackage.filenameTemplate}.csv`} mono />
                </div>
              </section>

              <section className="rounded border border-slate-800 bg-slate-900/45 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Package Structure</div>
                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-slate-500">Number of queries</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PACKAGE_QUERY_COUNT}
                    value={queryCount}
                    onChange={(event) => setDraftQueryCount(event.target.value)}
                    className={`mt-1 h-8 w-full rounded border bg-slate-950 px-2 font-mono text-sm text-slate-100 outline-none ${
                      queryCountError ? 'border-red-800 focus:border-red-500' : 'border-slate-800 focus:border-blue-500'
                    }`}
                  />
                </label>
                {queryCountError && (
                  <div className="mt-2 rounded border border-red-900/50 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-300">
                    {queryCountError}
                  </div>
                )}
              </section>

              <section className="rounded border border-slate-800 bg-slate-900/45 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CSV Filename Format</div>
                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-slate-500">Filename format</span>
                  <div className="mt-1 flex items-center">
                    <input
                      type="text"
                      value={filenameTemplate}
                      onChange={(event) => setFilenameTemplate(event.target.value)}
                      className={`h-8 min-w-0 flex-1 rounded-l border bg-slate-950 px-2 font-mono text-xs text-slate-100 outline-none ${
                        templateValidation.valid ? 'border-slate-800 focus:border-blue-500' : 'border-red-800 focus:border-red-500'
                      }`}
                    />
                    <span className="h-8 rounded-r border border-l-0 border-slate-800 bg-slate-900 px-2 py-2 font-mono text-[10px] text-slate-400">
                      .csv
                    </span>
                  </div>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                  <span><span className="font-mono text-slate-300">{'{n}'}</span> Query number</span>
                  <span><span className="font-mono text-slate-300">{'{type}'}</span> kis / qa / trake</span>
                </div>
                {!templateValidation.valid && (
                  <div className="mt-2 rounded border border-red-900/50 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-300">
                    {templateValidation.errors.join(' ')}
                  </div>
                )}
                {preview.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 rounded border border-slate-800 bg-slate-950 p-2 text-[10px]">
                    <div className="font-bold uppercase tracking-wider text-slate-500">Preview</div>
                    {preview.map((row) => (
                      <div key={`${row.label}-${row.filename}`} className="flex gap-2">
                        <span className="w-24 shrink-0 text-slate-500">{row.label}</span>
                        <span className="min-w-0 truncate font-mono text-blue-300" title={row.filename}>{row.filename}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>

            <section className="flex min-h-0 flex-col rounded border border-slate-800 bg-slate-900/45">
              <div className="border-b border-slate-800 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Query Type Plan</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                  <Info label="Draft Queries" value={draftQueryCount} />
                  <Info label="KIS" value={draftCounts.KIS} />
                  <Info label="Q&A" value={draftCounts.QA} />
                  <Info label="TRAKE" value={draftCounts.TRAKE} />
                </div>

                <div className="mt-3 grid gap-2 xl:grid-cols-[1fr_1fr]">
                  <div className="rounded border border-slate-800 bg-slate-950 p-2">
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Quick assign</div>
                    <div className="grid grid-cols-[1fr_1fr_1.25fr_auto] gap-1.5">
                      <SmallNumber label="From" value={rangeFrom} max={draftQueryCount} onChange={setRangeFrom} />
                      <SmallNumber label="To" value={rangeTo} max={draftQueryCount} onChange={setRangeTo} />
                      <SmallTypeSelect value={rangeType} onChange={setRangeType} />
                      <button
                        type="button"
                        onClick={applyRange}
                        disabled={!canApplyRange}
                        className="self-end rounded bg-blue-600 px-2 py-1.5 text-[9px] font-bold uppercase text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Apply
                      </button>
                    </div>
                    {rangeError && (
                      <div className="mt-2 rounded border border-red-900/50 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-300">
                        {rangeError}
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-slate-800 bg-slate-950 p-2">
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Set all</div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <SmallTypeSelect value={setAllType} onChange={setSetAllType} />
                      <button
                        type="button"
                        onClick={applySetAll}
                        className="self-end rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[9px] font-bold uppercase text-slate-200 hover:bg-slate-800"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 max-h-[44vh] flex-1 overflow-y-auto p-2 custom-scrollbar">
                <div className="sticky top-0 z-10 grid grid-cols-[2.5rem_1fr_7rem] gap-2 border-b border-slate-800 bg-slate-900 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                  <span>#</span>
                  <span>Type</span>
                  <span>Required Events</span>
                </div>
                {queryPlan.map((query) => (
                  <div
                    key={query.queryNumber}
                    className="grid grid-cols-[2.5rem_1fr_7rem] items-center gap-2 border-b border-slate-800 px-2 py-1.5 text-[10px] last:border-b-0"
                  >
                    <span className="font-mono text-slate-400">{query.queryNumber}</span>
                    <select
                      value={query.type}
                      onChange={(event) => updatePlanQuery(query.queryNumber, { type: event.target.value as SubmissionQueryType })}
                      className="h-7 rounded border border-slate-800 bg-slate-950 px-2 text-[10px] font-bold text-slate-100 outline-none focus:border-blue-500"
                    >
                      {queryTypes.map((type) => (
                        <option key={type} value={type}>{displaySubmissionQueryType(type)}</option>
                      ))}
                    </select>
                    {query.type === 'TRAKE' ? (
                      <input
                        type="number"
                        min={1}
                        max={MAX_TRAKE_EVENT_COUNT}
                        value={query.expectedEventCount ?? ''}
                        onChange={(event) => updatePlanQuery(query.queryNumber, {
                          expectedEventCount: normalizeEventCount(event.target.value),
                        })}
                        placeholder="e.g. 4"
                        className="h-7 rounded border border-slate-800 bg-slate-950 px-2 font-mono text-[10px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                      />
                    ) : (
                      <span className="text-center text-slate-600">--</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0 text-[10px] text-slate-500">
            Apply commits the draft package setup. Cancel discards draft changes.
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-300 transition-colors hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!templateValidation.valid || Boolean(queryCountError)}
              className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply Package
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | number
  mono?: boolean
}) {
  return (
    <div className="min-w-0 rounded border border-slate-800 bg-slate-950 px-2 py-1">
      <div className="truncate text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-[10px] font-bold text-slate-100 ${mono ? 'font-mono' : ''}`} title={String(value)}>
        {value}
      </div>
    </div>
  )
}

function SmallNumber({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: string
  max: number
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full rounded border border-slate-800 bg-slate-900 px-2 font-mono text-[10px] text-slate-100 outline-none focus:border-blue-500"
      />
    </label>
  )
}

function SmallTypeSelect({
  value,
  onChange,
}: {
  value: SubmissionQueryType
  onChange: (value: SubmissionQueryType) => void
}) {
  return (
    <label>
      <span className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-slate-500">Type</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SubmissionQueryType)}
        className="h-7 w-full rounded border border-slate-800 bg-slate-900 px-2 text-[10px] font-bold text-slate-100 outline-none focus:border-blue-500"
      >
        {queryTypes.map((type) => (
          <option key={type} value={type}>{displaySubmissionQueryType(type)}</option>
        ))}
      </select>
    </label>
  )
}
