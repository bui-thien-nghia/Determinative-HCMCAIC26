import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SearchResult } from '../../store'
import {
  MAX_QA_ANSWER_LENGTH,
  filenameForPackageQuery,
  type PackageQuery,
  type QueryCandidate,
} from '../../utils/submission'
import {
  buildSpawnRangePreview,
  createSpawnRangeCandidates,
  findSpawnRangeVideoMetadata,
  type SpawnRangeMode,
} from '../../utils/rangeSpawner'

type SpawnRangeDialogProps = {
  query: PackageQuery
  filenameTemplate: string
  searchResults: SearchResult[]
  onClose: () => void
  onApply: (queryId: string, candidates: QueryCandidate[]) => number
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void
}

function displayType(type: PackageQuery['type']) {
  return type === 'QA' ? 'Q&A' : type
}

function lastVideoId(query: PackageQuery) {
  for (let index = query.candidates.length - 1; index >= 0; index -= 1) {
    const candidate = query.candidates[index]
    if ((candidate.type === 'KIS' || candidate.type === 'QA') && candidate.videoId) {
      return candidate.videoId
    }
  }
  return ''
}

function previewEdges(values: number[]) {
  if (values.length <= 6) return { first: values, last: [] }
  return { first: values.slice(0, 3), last: values.slice(-3) }
}

export default function SpawnRangeDialog({
  query,
  filenameTemplate,
  searchResults,
  onClose,
  onApply,
  onNotify,
}: SpawnRangeDialogProps) {
  const [mode, setMode] = useState<SpawnRangeMode>('frame')
  const [videoId, setVideoId] = useState('')
  const [startFrame, setStartFrame] = useState('')
  const [endFrame, setEndFrame] = useState('')
  const [frameSpacing, setFrameSpacing] = useState('25')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [timeSpacing, setTimeSpacing] = useState('1')
  const [answer, setAnswer] = useState('')

  const queryName = filenameForPackageQuery(query, filenameTemplate).replace(/\.csv$/i, '')
  const videoMetadata = useMemo(
    () => findSpawnRangeVideoMetadata(videoId, searchResults),
    [searchResults, videoId],
  )
  const preview = useMemo(
    () => buildSpawnRangePreview({
      query,
      mode,
      videoId,
      startFrame,
      endFrame,
      frameSpacing,
      startTime,
      endTime,
      timeSpacing,
      answer,
      videoMetadata,
    }),
    [answer, endFrame, endTime, frameSpacing, mode, query, startFrame, startTime, timeSpacing, videoId, videoMetadata],
  )
  const canSpawn = preview.errors.length === 0 && preview.newFrameOrders.length > 0
  const answerLength = answer.length
  const previewFrames = previewEdges(preview.newFrameOrders)

  useEffect(() => {
    setMode('frame')
    setVideoId(lastVideoId(query))
    setStartFrame('')
    setEndFrame('')
    setFrameSpacing('25')
    setStartTime('')
    setEndTime('')
    setTimeSpacing('1')
    setAnswer('')
  }, [query.id, query.type])

  const handleSpawn = () => {
    if (!canSpawn) return
    const candidates = createSpawnRangeCandidates(query, videoId, preview.newFrameOrders, answer)
    if (candidates.length === 0) return
    const added = onApply(query.id, candidates)
    if (added > 0) {
      const duplicateText = preview.duplicateCount > 0
        ? ` ${preview.duplicateCount} duplicate${preview.duplicateCount === 1 ? '' : 's'} skipped.`
        : ''
      onNotify(`Added ${added} range candidate${added === 1 ? '' : 's'}.${duplicateText}`, 'success')
      onClose()
    } else {
      onNotify('No range candidates were added.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[min(620px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-100">
              <Plus size={15} className="text-blue-300" />
              Spawn Answer Range
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
            title="Close spawn range"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)]">
            <div className="flex flex-col gap-3">
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Video ID
                </span>
                <input
                  type="text"
                  value={videoId}
                  onChange={(event) => setVideoId(event.target.value)}
                  placeholder="L23_V021"
                  className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
              </label>

              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Range By</div>
                <div className="grid grid-cols-2 gap-1.5 rounded border border-slate-800 bg-slate-950 p-1">
                  {[
                    ['frame', 'Frame Idx'],
                    ['time', 'Time'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value as SpawnRangeMode)}
                      aria-pressed={mode === value}
                      className={`rounded px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        mode === value
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'frame' ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
                    Frame mode uses BTC Frame Idx (frame_order).
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Start Frame
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={startFrame}
                        onChange={(event) => setStartFrame(event.target.value)}
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        End Frame
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={endFrame}
                        onChange={(event) => setEndFrame(event.target.value)}
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                  <SpacingInput
                    label="Spacing"
                    value={frameSpacing}
                    onChange={setFrameSpacing}
                    inputMode="numeric"
                    presets={[
                      ['25', '25'],
                      ['50', '50'],
                    ]}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className={`rounded border px-3 py-2 text-[11px] ${
                    videoMetadata
                      ? 'border-emerald-800/50 bg-emerald-950/20 text-emerald-300'
                      : 'border-amber-800/50 bg-amber-950/20 text-amber-300'
                  }`}>
                    {videoMetadata
                      ? 'Video metadata found in current results.'
                      : 'Video metadata is required for time-based spawning.'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Start Time
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        End Time
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                  <SpacingInput
                    label="Spacing"
                    value={timeSpacing}
                    onChange={setTimeSpacing}
                    inputMode="decimal"
                    presets={[
                      ['1', '1s'],
                      ['2', '2s'],
                    ]}
                  />
                </div>
              )}

              {query.type === 'QA' && (
                <label>
                  <span className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Answer</span>
                    <span className={answerLength > MAX_QA_ANSWER_LENGTH ? 'text-red-400' : 'text-slate-500'}>
                      {answerLength} / {MAX_QA_ANSWER_LENGTH}
                    </span>
                  </span>
                  <input
                    type="text"
                    value={answer}
                    maxLength={MAX_QA_ANSWER_LENGTH}
                    onChange={(event) => setAnswer(event.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                  />
                </label>
              )}
            </div>

            <div className="rounded border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>Generated</span>
                <span className="text-right font-mono text-slate-300">{preview.generatedFrameOrders.length}</span>
                <span>Duplicates</span>
                <span className="text-right font-mono text-slate-300">{preview.duplicateCount}</span>
                <span>Rows to add</span>
                <span className="text-right font-mono text-blue-300">{preview.newFrameOrders.length}</span>
              </div>

              {preview.wouldExceedLimit && (
                <div className="mt-2 rounded border border-red-900/50 bg-red-950/30 p-2 text-[10px] text-red-300">
                  <div>This range would exceed the 100-row limit.</div>
                  <div>Current: {preview.currentCount}</div>
                  <div>New unique rows: {preview.newFrameOrders.length}</div>
                  <div>Maximum: {preview.maxRows}</div>
                  <div className="mt-1">Increase spacing or reduce the range.</div>
                </div>
              )}

              {preview.errors.filter((error) => error !== 'This range would exceed the 100-row limit.').length > 0 && (
                <div className="mt-2 flex flex-col gap-1 rounded border border-red-900/50 bg-red-950/30 p-2 text-[10px] text-red-300">
                  {preview.errors
                    .filter((error) => error !== 'This range would exceed the 100-row limit.')
                    .map((error) => <span key={error}>{error}</span>)}
                </div>
              )}

              {preview.newFrameOrders.length > 0 && (
                <div className="mt-3 text-[11px] text-slate-500">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Frame Idx</div>
                  <div className="font-mono text-slate-300">
                    {previewFrames.first.map((frameOrder) => <div key={`first-${frameOrder}`}>{frameOrder}</div>)}
                    {previewFrames.last.length > 0 && <div className="text-slate-600">...</div>}
                    {previewFrames.last.map((frameOrder) => <div key={`last-${frameOrder}`}>{frameOrder}</div>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="min-w-0 text-[10px] text-slate-500">
            {query.candidates.length} existing candidate{query.candidates.length === 1 ? '' : 's'}
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
              onClick={handleSpawn}
              disabled={!canSpawn}
              className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {canSpawn ? `Spawn ${preview.newFrameOrders.length} Row${preview.newFrameOrders.length === 1 ? '' : 's'}` : 'Spawn Rows'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpacingInput({
  label,
  value,
  onChange,
  inputMode,
  presets,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputMode: 'numeric' | 'decimal'
  presets: Array<[string, string]>
}) {
  return (
    <div>
      <label>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </label>
      <div className="mt-1.5 flex gap-1">
        {presets.map(([presetValue, presetLabel]) => (
          <button
            key={presetValue}
            type="button"
            onClick={() => onChange(presetValue)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-blue-950/30 hover:text-blue-200"
          >
            {presetLabel}
          </button>
        ))}
      </div>
    </div>
  )
}
