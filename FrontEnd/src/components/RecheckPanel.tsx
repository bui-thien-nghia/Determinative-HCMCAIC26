import { useState } from 'react'
import { Download, Copy, Trash } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'

import KISBuilder from './answer-builder/KISBuilder'
import QABuilder from './answer-builder/QABuilder'
import TRAKEBuilder from './answer-builder/TRAKEBuilder'

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const mustQuote = text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')
  const escaped = text.replace(/"/g, '""')
  return mustQuote ? `"${escaped}"` : escaped
}

export default function RecheckPanel() {
  const { recheckList, trakeState, clearRecheckList, mode, addToast, addCandidate } = useStore()
  const [isDragOver, setIsDragOver] = useState(false)

  const handleClearAll = async () => {
    if (mode === 'TRAKE') {
      if (!window.confirm('Clear all TRAKE events?')) return
      useStore.getState().clearAllTrakeEvents()
      addToast('All TRAKE events cleared', 'info')
      return
    }

    if (!window.confirm('Clear all candidates?')) return
    for (const item of recheckList) {
      api.removeRecheck(item.id).catch(console.error)
    }
    clearRecheckList()
    addToast('All candidates cleared', 'info')
  }

  const generateExportData = () => {
    let data = ''

    if (mode === 'TRAKE') {
      const vid = trakeState.selectedVideoId
      if (!vid) return { data: '', exportMode: mode }
      
      const frames = trakeState.events
        .filter(e => e.selectedCandidate)
        .map(e => e.selectedCandidate!.payload.frame_id)
        
      const rows = [[vid, ...frames].map(escapeCsvCell).join(',')]
      data = rows.join('\n')
    } else if (mode === 'QA') {
      const items = recheckList.slice(0, 100)
      
      const missingAnswers = items.filter(i => !i.answer || !i.answer.trim())
      if (missingAnswers.length > 0) {
        addToast(`${missingAnswers.length} candidates are missing answers`, 'error')
        return { data: '', exportMode: mode, error: true }
      }
      
      data = items.map(item =>
        [item.payload.video_id, item.payload.frame_id, item.answer || ''].map(escapeCsvCell).join(',')
      ).join('\n')
    } else {
      const items = recheckList.slice(0, 100)
      data = items.map(item =>
        [item.payload.video_id, item.payload.frame_id].map(escapeCsvCell).join(',')
      ).join('\n')
    }

    return { data, exportMode: mode }
  }

  const handleExport = () => {
    if (mode !== 'TRAKE' && recheckList.length === 0) return
    if (mode === 'TRAKE' && trakeState.events.every(e => !e.selectedCandidate)) return
    
    const { data, exportMode, error } = generateExportData()
    if (error || !data) return
    
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(data)

    const a = document.createElement('a')
    a.href = csvContent
    a.download = `answer-${exportMode.toLowerCase()}.csv`
    a.click()
    addToast('CSV exported', 'success')
  }

  const handleCopy = () => {
    if (mode !== 'TRAKE' && recheckList.length === 0) return
    if (mode === 'TRAKE' && trakeState.events.every(e => !e.selectedCandidate)) return
    
    const { data, error } = generateExportData()
    if (error || !data) return
    
    navigator.clipboard.writeText(data)
    addToast('Copied answer', 'success')
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
    }
  }
  
  const getHeaderContent = () => {
    if (mode === 'TRAKE') {
      const { stage, selectedVideoId, events } = trakeState
      const selectedCount = events.filter(e => e.selectedCandidate).length
      const totalCount = events.length

      return (
        <>
          <h2 className="font-bold text-slate-100 flex items-center gap-2 tracking-wide text-xs">
            TRAKE
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest">
              <span className={`px-1.5 py-0.5 rounded ${stage === 1 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>1 Retrieval</span>
              <span className="text-slate-600">→</span>
              <span className={`px-1.5 py-0.5 rounded ${stage === 2 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>2 Alignment</span>
            </span>
          </h2>
          {stage === 2 && selectedVideoId && (
            <span className="text-[10px] text-blue-400 font-mono truncate max-w-25" title={selectedVideoId}>
              {selectedVideoId}
            </span>
          )}
          {stage === 2 && totalCount > 0 && (
            <span className="bg-blue-600/20 text-blue-400 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-500/30 shrink-0">
              {selectedCount}/{totalCount}
            </span>
          )}
        </>
      )
    }

    return (
      <>
        <h2 className="font-bold text-slate-100 flex items-center gap-2 tracking-wide text-xs">
          ANSWER BUILDER
          <span className="bg-blue-600/20 text-blue-400 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-500/30">
            {recheckList.length} / 100
          </span>
        </h2>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{mode} Mode</span>
      </>
    )
  }

  const getValidationSummary = () => {
    if (mode === 'TRAKE') {
      const { stage, events } = trakeState
      if (stage === 1) {
        return (
          <div className="text-[9px] text-slate-500 uppercase flex justify-between">
            <span>Stage 1 — Select video</span>
          </div>
        )
      }
      const selectedCount = events.filter(e => e.selectedCandidate).length
      let hasTemporalError = false
      let lastFrame = -1
      for (const evt of events) {
        if (!evt.selectedCandidate) continue
        const f = parseInt(String(evt.selectedCandidate.payload.frame_id).replace(/\D/g, ''), 10) || 0
        if (lastFrame !== -1 && f <= lastFrame) { hasTemporalError = true; break }
        lastFrame = f
      }
      return (
        <div className="text-[9px] text-slate-500 uppercase flex justify-between">
          <span>{selectedCount} / {events.length} events</span>
          {selectedCount > 1 && (
            <span className={hasTemporalError ? 'text-red-400' : 'text-emerald-400'}>
              Temporal order {hasTemporalError ? 'invalid' : 'valid'}
            </span>
          )}
        </div>
      )
    }
    
    if (mode === 'QA') {
      const missingCount = recheckList.filter(i => !i.answer || !i.answer.trim()).length
      return (
        <div className="text-[9px] text-slate-500 uppercase flex justify-between">
          <span>{recheckList.length} candidates</span>
          {missingCount > 0 && <span className="text-red-400">{missingCount} missing answers</span>}
        </div>
      )
    }
    
    return (
      <div className="text-[9px] text-slate-500 uppercase flex justify-between">
        <span>{recheckList.length} candidates</span>
      </div>
    )
  }

  const isExportDisabled = () => {
    if (mode === 'TRAKE') {
      const { stage, events } = trakeState
      if (stage === 1) return true
      return events.length === 0 || events.every(e => !e.selectedCandidate)
    }
    return recheckList.length === 0
  }

  return (
    <div 
      className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 text-sm overflow-hidden transition-colors ${isDragOver ? 'ring-2 ring-inset ring-blue-500 bg-slate-800/80' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-center">
          {getHeaderContent()}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={isExportDisabled()}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={12} /> CSV
          </button>
          <button
            onClick={handleCopy}
            disabled={isExportDisabled()}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy size={12} /> Copy
          </button>
          <button
            onClick={handleClearAll}
            disabled={isExportDisabled()}
            className="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash size={12} /> Clear
          </button>
        </div>
        
        {getValidationSummary()}
      </div>

      {/* Builder content area — position: relative so empty states are scoped here */}
      <div className="relative flex-1 overflow-hidden">
        {mode === 'KIS' && <KISBuilder />}
        {mode === 'QA' && <QABuilder />}
        {mode === 'TRAKE' && <TRAKEBuilder />}

        {mode !== 'TRAKE' && recheckList.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3 pointer-events-none p-4">
            <div className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center transition-colors ${isDragOver ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-slate-700'}`}>
              <span className="text-xl font-light">{isDragOver ? '↓' : '+'}</span>
            </div>
            <p className="text-xs text-center max-w-50">
              {isDragOver ? 'Drop to add candidate' : mode === 'QA' ? <>No Q&A candidates added. Add a frame, then enter an answer.</> : <>No candidates added. Press <strong className="text-slate-400">'+'</strong> or drag a frame here.</>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
