import { useMemo, useState } from 'react'
import { Archive, Check, Download, FilePlus2, PackageCheck, Trash } from 'lucide-react'
import { useStore } from '../store'

import KISBuilder from './answer-builder/KISBuilder'
import QABuilder from './answer-builder/QABuilder'
import TRAKEBuilder from './answer-builder/TRAKEBuilder'
import {
  MAX_SUBMISSION_ROWS,
  createSubmissionZip,
  detectQueryTypeFromName,
  downloadBlob,
  filenameForQuery,
  sanitizeQueryName,
  validateSubmission,
  type SubmissionQueryType,
} from '../utils/submission'

const queryTypes: SubmissionQueryType[] = ['KIS', 'QA', 'TRAKE']

function displayType(type: SubmissionQueryType) {
  return type === 'QA' ? 'Q&A' : type
}

function suffixFor(type: SubmissionQueryType) {
  return type === 'QA' ? 'qa' : type.toLowerCase()
}

function nameForType(currentName: string, nextType: SubmissionQueryType) {
  const cleaned = sanitizeQueryName(currentName) || 'query-1'
  const replaced = cleaned.replace(/-(kis|qa|trake)$/i, '')
  return `${replaced}-${suffixFor(nextType)}`
}

export default function RecheckPanel() {
  const {
    recheckList,
    trakeState,
    clearRecheckList,
    mode,
    setMode,
    searchResults,
    addToast,
    addCandidate,
    submissionQueryName,
    setSubmissionQueryName,
    submissionPackage,
    addSubmissionPackageFile,
    removeSubmissionPackageFile,
    clearSubmissionPackage,
  } = useStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const queryType = mode as SubmissionQueryType
  const filename = filenameForQuery(submissionQueryName, queryType)
  const validation = useMemo(
    () => validateSubmission(queryType, recheckList, trakeState),
    [queryType, recheckList, trakeState],
  )
  const rowsUsed = queryType === 'TRAKE' ? validation.rows : recheckList.length
  const selectedEvents = trakeState.events.filter((event) => String(event.frameOrder || '').trim()).length

  const handleTypeChange = (nextType: SubmissionQueryType) => {
    setMode(nextType)
    setSubmissionQueryName(nameForType(submissionQueryName, nextType))
  }

  const handleQueryNameChange = (value: string) => {
    const cleaned = value.replace(/\.csv$/i, '')
    setSubmissionQueryName(cleaned)
    const detected = detectQueryTypeFromName(cleaned)
    if (detected && detected !== queryType) {
      setMode(detected)
    }
  }

  const handleDownloadCsv = () => {
    if (!validation.valid) return
    downloadBlob(new Blob([`${validation.csv}\n`], { type: 'text/csv;charset=utf-8' }), filename)
    addToast(`Downloaded ${filename}`, 'success')
  }

  const handleSaveToPackage = () => {
    if (!validation.valid) return
    if (submissionPackage.some((file) => file.filename === filename)) {
      if (!window.confirm(`${filename} already exists in the package. Replace it?`)) return
    }
    addSubmissionPackageFile({
      filename,
      queryName: sanitizeQueryName(submissionQueryName),
      queryType,
      csv: validation.csv,
      rows: validation.rows,
      savedAt: Date.now(),
    })
    addToast(`${filename} saved to package`, 'success')
  }

  const handleValidateAll = () => {
    if (submissionPackage.length === 0) {
      addToast('Package is empty', 'error')
      return
    }
    addToast(`${submissionPackage.length} CSV file(s) valid for submission.zip`, 'success')
  }

  const handleDownloadZip = () => {
    if (submissionPackage.length === 0) return
    const zip = createSubmissionZip(submissionPackage)
    downloadBlob(zip, 'submission.zip')
    addToast('Downloaded submission.zip', 'success')
  }

  const handleClearCurrent = () => {
    if (!window.confirm('Clear the current submission query?')) return
    if (queryType === 'TRAKE') {
      useStore.getState().clearAllTrakeEvents()
    } else {
      clearRecheckList()
    }
    addToast('Current query cleared', 'info')
  }

  const handleClearPackage = () => {
    if (!window.confirm('Clear all saved CSV files from the submission package?')) return
    clearSubmissionPackage()
    addToast('Submission package cleared', 'info')
  }

  const handleBulkAdd = (count: number | 'all') => {
    if (queryType === 'TRAKE') return
    const available = Math.max(0, MAX_SUBMISSION_ROWS - recheckList.length)
    if (available === 0) {
      addToast('Maximum 100 rows allowed', 'error')
      return
    }

    const requested = count === 'all' ? searchResults.length : count
    const candidates = searchResults.slice(0, Math.min(requested, available))
    if (candidates.length === 0) {
      addToast('No search results to add', 'error')
      return
    }

    const before = useStore.getState().recheckList.length
    for (const result of candidates) {
      useStore.getState().addCandidate(result, { quiet: true })
    }
    const added = useStore.getState().recheckList.length - before
    addToast(added > 0 ? `Added ${added} row(s)` : 'No new valid rows added', added > 0 ? 'success' : 'error')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    try {
      const dataStr = e.dataTransfer.getData('application/json')
      if (!dataStr) return
      const result = JSON.parse(dataStr)
      addCandidate(result)
    } catch (err) {
      console.error(err)
      addToast('Drop failed', 'error')
    }
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-slate-900 border-l border-slate-800 text-sm overflow-y-auto overflow-x-hidden custom-scrollbar [scrollbar-gutter:stable] transition-colors ${isDragOver ? 'ring-2 ring-inset ring-blue-500 bg-slate-800/80' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex flex-col gap-3">
        <div>
          <h2 className="font-bold text-slate-100 tracking-wide text-xs uppercase">Submission Workspace</h2>
          <div className="text-[10px] text-slate-500 mt-0.5">BTC Frame Idx = payload.frame_order</div>
        </div>

        <div className="grid grid-cols-3 bg-slate-900 border border-slate-800 rounded overflow-hidden">
          {queryTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                queryType === type ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {displayType(type)}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[9px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">Query Name</label>
          <input
            type="text"
            value={submissionQueryName}
            onChange={(e) => handleQueryNameChange(e.target.value)}
            placeholder={`query-1-${suffixFor(queryType)}`}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500 text-xs"
          />
          <div className="text-[9px] text-slate-500 mt-1 font-mono truncate">{filename}</div>
        </div>

        {queryType !== 'TRAKE' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[9px] text-slate-500 uppercase tracking-wider">
              <span>Rows: {rowsUsed} / {MAX_SUBMISSION_ROWS}</span>
              <span>{searchResults.length} result(s) available</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                ['Top 5', 5],
                ['Top 10', 10],
                ['Top 20', 20],
                ['All', 'all'],
              ].map(([label, count]) => (
                <button
                  key={label}
                  onClick={() => handleBulkAdd(count as number | 'all')}
                  disabled={searchResults.length === 0 || rowsUsed >= MAX_SUBMISSION_ROWS}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-1 rounded text-[9px] font-semibold uppercase border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {queryType === 'TRAKE' && (
          <div className="text-[9px] text-slate-500 uppercase tracking-wider flex justify-between">
            <span>Events: {selectedEvents} / {trakeState.events.length}</span>
            <span>Rows: {validation.rows} / {MAX_SUBMISSION_ROWS}</span>
          </div>
        )}

        <div className={`rounded border px-2 py-1.5 text-[10px] ${
          validation.valid ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300' : 'border-red-900/50 bg-red-950/20 text-red-300'
        }`}>
          {validation.valid ? (
            <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider">
              <Check size={12} /> Ready to export
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {validation.errors.slice(0, 3).map((error) => <span key={error}>{error}</span>)}
              {validation.errors.length > 3 && <span>+ {validation.errors.length - 3} more error(s)</span>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleDownloadCsv}
            disabled={!validation.valid}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={12} /> CSV
          </button>
          <button
            onClick={handleSaveToPackage}
            disabled={!validation.valid}
            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FilePlus2 size={12} /> Save
          </button>
          <button
            onClick={handleClearCurrent}
            disabled={queryType === 'TRAKE'
              ? !trakeState.selectedVideoId && trakeState.events.every((event) => !String(event.frameOrder || '').trim())
              : recheckList.length === 0}
            className="bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash size={12} /> Clear
          </button>
        </div>
      </div>

      <div className={`relative ${queryType !== 'TRAKE' && recheckList.length === 0 ? 'min-h-48' : ''}`}>
        {queryType === 'KIS' && <KISBuilder />}
        {queryType === 'QA' && <QABuilder />}
        {queryType === 'TRAKE' && <TRAKEBuilder />}

        {queryType !== 'TRAKE' && recheckList.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3 pointer-events-none p-4">
            <div className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center transition-colors ${isDragOver ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-slate-700'}`}>
              <span className="text-xl font-light">{isDragOver ? '↓' : '+'}</span>
            </div>
            <p className="text-xs text-center max-w-50">
              {isDragOver ? 'Drop to add result' : queryType === 'QA' ? <>No Q&A rows. Add a frame, then enter an answer.</> : <>No KIS rows. Click <strong className="text-slate-400">+ Add</strong> or drag a frame here.</>}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Archive size={12} /> Submission Package
          </h3>
          <span className="text-[9px] text-slate-500">{submissionPackage.length} CSV</span>
        </div>

        <div className="min-h-12 max-h-22 overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {submissionPackage.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic">No completed CSVs saved.</div>
          ) : (
            submissionPackage.map((file) => (
              <div key={file.filename} className="flex items-center gap-2 text-[10px] bg-slate-900 border border-slate-800 rounded px-2 py-1">
                <span className="text-emerald-400">✓</span>
                <span className="flex-1 truncate font-mono text-slate-300" title={file.filename}>{file.filename}</span>
                <span className="text-slate-600">{file.rows}r</span>
                <button
                  onClick={() => removeSubmissionPackageFile(file.filename)}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                  title="Remove from package"
                >
                  <Trash size={10} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleValidateAll}
            disabled={submissionPackage.length === 0}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[9px] font-semibold uppercase border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <PackageCheck size={11} /> Validate
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={submissionPackage.length === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1.5 rounded text-[9px] font-semibold uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <Download size={11} /> ZIP
          </button>
          <button
            onClick={handleClearPackage}
            disabled={submissionPackage.length === 0}
            className="bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-1.5 rounded text-[9px] font-semibold uppercase border border-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
