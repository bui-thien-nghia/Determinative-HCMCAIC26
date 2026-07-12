import { useState } from 'react'
import { Trash2, Download, Copy, Trash, ChevronUp, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'
import { getImageUrl } from '../utils/media'

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const mustQuote = text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')
  const escaped = text.replace(/"/g, '""')
  return mustQuote ? `"${escaped}"` : escaped
}

export default function RecheckPanel() {
  const { recheckList, currentDataset, removeFromRecheckList, clearRecheckList, moveRecheckItem, mode, updateRecheckItemAnswer, addToast, addToRecheckList } = useStore()
  const [isDragOver, setIsDragOver] = useState(false)

  const handleRemove = async (id: string) => {
    try {
      api.removeRecheck(id).catch(console.error)
      removeFromRecheckList(id)
      addToast('Removed candidate', 'info')
    } catch (err) {
      console.error(err)
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear all items?')) return
    for (const item of recheckList) {
      api.removeRecheck(item.id).catch(console.error)
    }
    clearRecheckList()
    addToast('All items cleared', 'info')
  }

  const generateExportData = () => {
    let exportMode = mode
    if (exportMode === 'AUTO') {
      const types = new Set(recheckList.map(i => i.answerType))
      exportMode = types.size === 1 ? Array.from(types)[0] : 'KIS'
    }

    const items = recheckList.slice(0, 100)
    let data = ''

    if (exportMode === 'TRAKE') {
      const grouped: Record<string, Array<string | number>> = {}
      items.forEach(item => {
        const vid = item.payload.video_id
        if (!grouped[vid]) grouped[vid] = []
        grouped[vid].push(item.payload.frame_id)
      })
      const rows = Object.entries(grouped).map(([vid, frames]) => {
        return [vid, ...frames].map(escapeCsvCell).join(',')
      })
      data = rows.join('\n')
    } else if (exportMode === 'QA') {
      data = items.map(item =>
        [item.payload.video_id, item.payload.frame_id, item.answer || ''].map(escapeCsvCell).join(',')
      ).join('\n')
    } else {
      data = items.map(item =>
        [item.payload.video_id, item.payload.frame_id].map(escapeCsvCell).join(',')
      ).join('\n')
    }

    return { data, exportMode }
  }

  const handleExport = () => {
    if (recheckList.length === 0) return
    const { data, exportMode } = generateExportData()
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(data)

    const a = document.createElement('a')
    a.href = csvContent
    a.download = `answer-${exportMode.toLowerCase()}.csv`
    a.click()
    addToast('CSV exported', 'success')
  }

  const handleCopy = () => {
    if (recheckList.length === 0) return
    const { data } = generateExportData()
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

      if (recheckList.some((r) => r.id === result.id)) {
        addToast('Candidate already added', 'error')
        return
      }

      if (recheckList.length >= 100) {
        addToast('Maximum 100 candidates allowed', 'error')
        return
      }

      const answerType = mode === 'AUTO' ? 'KIS' : mode

      if (answerType === 'TRAKE') {
        const currentTrakeVideo = recheckList.length > 0 ? recheckList[0].payload.video_id : result.payload.video_id
        if (result.payload.video_id !== currentTrakeVideo) {
          addToast('TRAKE sequence must be from the same video', 'error')
          return
        }

        if (recheckList.length > 0) {
          const lastFrameStr = recheckList[recheckList.length - 1].payload.frame_id
          const currentFrameStr = result.payload.frame_id
          const lastFrame = parseInt(String(lastFrameStr).replace(/\D/g, ''), 10) || 0
          const currentFrame = parseInt(String(currentFrameStr).replace(/\D/g, ''), 10) || 0
          if (currentFrame <= lastFrame) {
            addToast('TRAKE frames must be in increasing order', 'error')
          }
        }
      }

      const item = {
        id: result.id || `${result.payload?.video_id}_${result.payload?.frame_id}_${Date.now()}`,
        img_link: result.image_path || result.payload?.img_link || '',
        payload: result.payload,
        answerType: answerType as any,
        answer: '' 
      }

      api.addRecheck(item).catch(console.error)
      addToRecheckList(item)

      if (answerType === 'QA') {
        addToast('Added. Answer required.', 'info')
      } else {
        addToast('Added candidate via drag', 'success')
      }
    } catch (err) {
      console.error(err)
    }
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
          <h2 className="font-bold text-slate-100 flex items-center gap-2 tracking-wide text-xs">
            ANSWER BUILDER
            <span className="bg-blue-600/20 text-blue-400 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-500/30">
              {recheckList.length} / 100
            </span>
          </h2>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{mode} Mode</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={recheckList.length === 0}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Download size={12} /> CSV
          </button>
          <button
            onClick={handleCopy}
            disabled={recheckList.length === 0}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Copy size={12} /> Copy
          </button>
          <button
            onClick={handleClearAll}
            disabled={recheckList.length === 0}
            className="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-1.5 rounded text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 transition-colors border border-red-900/30 disabled:opacity-50"
          >
            <Trash size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
        {recheckList.map((item, idx) => (
          <div key={item.id} className="bg-slate-950 p-2 rounded flex flex-col gap-2 border border-slate-800 group relative shadow-sm">
            <div className="flex gap-3">
              <div className="absolute -left-2 -top-2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm shadow-md">
                #{idx + 1}
              </div>

              <img
                src={getImageUrl(item.img_link)}
                alt={`Frame ${item.payload.frame_id}`}
                className="w-24 h-[54px] object-cover rounded bg-slate-900 border border-slate-700 shrink-0"
              />

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-xs font-semibold text-slate-200 truncate" title={item.payload.video_id}>
                  {item.payload.video_id}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {item.payload.frame_id}
                </div>
                <div className="mt-1 flex gap-1">
                  <span className="bg-slate-800 text-slate-400 text-[8px] px-1 rounded uppercase tracking-wider border border-slate-700">
                    {item.answerType}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    onClick={() => moveRecheckItem(item.id, 'up')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-400 p-1 rounded"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveRecheckItem(item.id, 'down')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-400 p-1 rounded"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="bg-red-900/20 hover:bg-red-500 text-red-400 hover:text-white p-1 rounded"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>

            {item.answerType === 'QA' && (
              <div className="mt-1">
                <input
                  type="text"
                  value={item.answer || ''}
                  onChange={(e) => updateRecheckItemAnswer(item.id, e.target.value)}
                  placeholder="Enter text answer..."
                  maxLength={100}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
        ))}

        {recheckList.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 pointer-events-none">
            <div className={`w-12 h-12 rounded-full border border-dashed flex items-center justify-center transition-colors ${isDragOver ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-slate-700'}`}>
              <span className="text-xl font-light">{isDragOver ? '↓' : '+'}</span>
            </div>
            <p className="text-xs text-center max-w-[200px]">
              {isDragOver ? 'Drop to add candidate' : <>No candidates added. Press <strong className="text-slate-400">'+'</strong> or drag a frame here.</>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
