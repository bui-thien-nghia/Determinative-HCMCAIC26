import { useState } from 'react'
import { Trash2, GripVertical, AlertTriangle, CopyCheck } from 'lucide-react'
import { useStore } from '../../store'
import type { RecheckItem } from '../../store'
import { api } from '../../api'
import { getImageUrl } from '../../utils/media'

export default function QABuilder() {
  const { recheckList, removeFromRecheckList, reorderRecheckItem, addToast, updateRecheckItemAnswer } = useStore()
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const handleRemove = async (id: string) => {
    try {
      api.removeRecheck(id).catch(console.error)
      removeFromRecheckList(id)
      addToast('Removed candidate', 'info')
    } catch (err) {
      console.error(err)
    }
  }

  const handleApplyToSameVideo = (videoId: string, answer: string) => {
    if (!answer.trim()) {
      addToast('Answer cannot be empty', 'error')
      return
    }
    
    let count = 0
    recheckList.forEach(item => {
      if (item.payload.video_id === videoId && item.answer !== answer) {
        updateRecheckItemAnswer(item.id, answer)
        count++
      }
    })
    
    addToast(`Answer applied to ${count} candidates from ${videoId}`, 'success')
  }
  
  const getValidationWarnings = (item: RecheckItem) => {
    const warnings = []
    if (!item.answer || !item.answer.trim()) {
      warnings.push({ type: 'error', msg: 'ANSWER REQUIRED' })
    }
    return warnings
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
      {recheckList.map((item, idx) => {
        const warnings = getValidationWarnings(item)
        const hasError = warnings.some(w => w.type === 'error')
        
        return (
          <div 
            key={item.id} 
            draggable
            onDragStart={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') {
                e.preventDefault()
                return
              }
              setDraggedIdx(idx)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (draggedIdx !== null) {
                e.preventDefault()
                e.stopPropagation()
                setDragOverIdx(idx)
              }
            }}
            onDragEnd={() => {
              setDraggedIdx(null)
              setDragOverIdx(null)
            }}
            onDrop={(e) => {
              if (draggedIdx !== null) {
                e.preventDefault()
                e.stopPropagation()
                reorderRecheckItem(draggedIdx, idx)
                setDraggedIdx(null)
                setDragOverIdx(null)
              }
            }}
            className={`p-2 rounded flex flex-col gap-2 border group relative transition-all ${
              draggedIdx === idx ? 'bg-slate-900 opacity-50 scale-[0.98]' : 'bg-slate-950 opacity-100 scale-100'
            } ${
              dragOverIdx === idx && draggedIdx !== idx 
                ? 'border-blue-500 ring-1 ring-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.3)]' 
                : idx === 0 
                  ? 'border-blue-500/80 bg-blue-900/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/50' 
                  : hasError 
                    ? 'border-red-900/50 shadow-sm'
                    : 'border-slate-800 shadow-sm'
            }`}
          >
            <div className="flex gap-3">
              <div className={`absolute -left-2 -top-2 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm shadow-md z-10 transition-transform flex items-center gap-1 ${idx === 0 ? 'bg-amber-600 shadow-amber-600/30 scale-110' : 'bg-blue-600'}`}>
                #{idx + 1}
                {idx === 0 && <span className="text-[8px] tracking-wider uppercase ml-0.5">Best</span>}
              </div>

              <img
                src={getImageUrl(item.img_link)}
                alt={`Frame ${item.payload.frame_id}`}
                className="w-24 h-13.5 object-cover rounded bg-slate-900 border border-slate-700 shrink-0 pointer-events-none"
              />

              <div className="flex-1 min-w-0 flex flex-col justify-center cursor-default">
                <div className="text-xs font-semibold text-slate-200 truncate" title={item.payload.video_id}>
                  {item.payload.video_id}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                  <span>{item.payload.frame_id}</span>
                </div>
                
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="bg-slate-800 text-slate-400 text-[8px] px-1 rounded uppercase tracking-wider border border-slate-700">
                    QA
                  </span>
                  {item.payload.score != null && (
                    <span className="bg-slate-800 text-slate-400 text-[8px] px-1 rounded uppercase tracking-wider border border-slate-700">
                      Score: {Number(item.payload.score).toFixed(4)}
                    </span>
                  )}
                  {warnings.map((w, i) => (
                    <span key={i} className={`text-[8px] px-1 rounded uppercase tracking-wider border flex items-center gap-0.5 bg-red-900/30 text-red-400 border-red-800/50`}>
                      <AlertTriangle size={8} /> {w.msg}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity items-center shrink-0 justify-center gap-2 pl-2 border-l border-slate-800/50">
                <div 
                  className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </div>
                
                <div className="w-4 border-t border-slate-800"></div>
                
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  title="Remove from Answer Builder"
                  aria-label="Remove item"
                  className="w-7 h-7 flex items-center justify-center bg-red-950/20 hover:bg-red-900/60 text-red-400 hover:text-red-200 rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <div className="mt-1 flex gap-2 items-center">
              <input
                type="text"
                value={item.answer || ''}
                onChange={(e) => updateRecheckItemAnswer(item.id, e.target.value)}
                placeholder="Answer (EN/VN)..."
                maxLength={200}
                className={`flex-1 bg-slate-900 border rounded px-2 py-1 text-xs text-white focus:outline-none transition-colors ${
                  hasError ? 'border-red-500/50 focus:border-red-500' : 'border-slate-700 focus:border-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={() => handleApplyToSameVideo(item.payload.video_id, item.answer || '')}
                disabled={!item.answer?.trim()}
                title="Apply answer to same video"
                className="w-7 h-7 flex items-center justify-center bg-blue-900/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-blue-900/30"
              >
                <CopyCheck size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
