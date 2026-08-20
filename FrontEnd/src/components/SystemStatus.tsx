import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Database, HardDrive, Timer, Loader2, Cpu } from 'lucide-react'
import { useStore } from '../store'

export default function SystemStatus() {
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  const searchStatus = useStore(state => state.searchStatus)
  const currentDataset = useStore(state => state.currentDataset)

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const top = rect.bottom + 8
      const right = Math.max(12, window.innerWidth - rect.right)
      setPopoverPos({ top, right })
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const popoverEl = document.getElementById('system-status-popover')
      if (
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node) &&
        (!popoverEl || !popoverEl.contains(event.target as Node))
      ) {
        setShowPopover(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPopover(false)
    }

    if (showPopover) {
      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showPopover])

  useEffect(() => {
    setLastUpdate(new Date())
  }, [searchStatus])

  const apiOnline: boolean | null = null
  const datasetOnline: boolean | null = null
  const qdrantOnline: boolean | null = null
  const modelsLoaded: boolean | null = null

  const statusColor = (ok: boolean | null) => {
    if (ok === null) return 'text-slate-500'
    return ok ? 'text-emerald-400' : 'text-red-400'
  }

  const getSearchColor = () => {
    if (searchStatus.state === 'error') return 'text-red-400'
    if (searchStatus.state === 'searching') return 'text-blue-400'
    if (!searchStatus.latency) return 'text-slate-500'
    if (searchStatus.latency < 2) return 'text-emerald-400'
    if (searchStatus.latency < 5) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <>
      <button 
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        aria-label="System Status"
        title="Click to view detailed system status"
        className="flex items-center gap-2 text-[10px] sm:text-xs font-mono font-semibold h-6.5 px-2.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500 group relative"
      >
        <div className="flex items-center gap-1">
          <Activity size={12} className={statusColor(apiOnline)} />
          <span className={`font-mono uppercase tracking-wider ${statusColor(apiOnline)}`}>
            API --
          </span>
        </div>
        
        <div className="w-px h-3 bg-slate-700" />
        
        <div className="hidden sm:flex items-center gap-1">
          <HardDrive size={12} className={statusColor(datasetOnline)} />
          <span className={`font-mono uppercase tracking-wider ${statusColor(datasetOnline)}`}>
            DATA --
          </span>
        </div>

        <div className="w-px h-3 bg-slate-700 hidden sm:block" />

        <div className="hidden lg:flex items-center gap-1">
          <Database size={12} className={statusColor(qdrantOnline)} />
          <span className={`font-mono uppercase tracking-wider ${statusColor(qdrantOnline)}`}>
            QDRANT --
          </span>
        </div>

        <div className="w-px h-3 bg-slate-700 hidden lg:block" />

        <div className="flex items-center gap-1">
          {searchStatus.state === 'searching' ? (
            <Loader2 size={12} className="animate-spin text-blue-400" />
          ) : (
            <Timer size={12} className={getSearchColor()} />
          )}
          <span className={`font-mono uppercase tracking-wider ${getSearchColor()} ${searchStatus.state === 'error' ? 'font-bold' : ''}`}>
            {searchStatus.state === 'searching' ? 'SEARCHING' : 
             searchStatus.state === 'error' ? 'SEARCH ERROR' : 
             searchStatus.latency ? `SEARCH ${searchStatus.latency.toFixed(1)}s` : 'SEARCH --'}
          </span>
        </div>
      </button>

      {showPopover && createPortal(
        <div 
          id="system-status-popover"
          style={{ 
            top: popoverPos.top, 
            right: popoverPos.right, 
            maxWidth: 'min(420px, calc(100vw - 24px))' 
          }}
          className="fixed w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl shadow-black/50 p-4 z-1200 text-sm flex flex-col gap-3"
        >
          <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2">System Status</h3>
          
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-xs">
            <span className="text-slate-500">Backend:</span>
            <span className={statusColor(apiOnline)}>--</span>
            
            <span className="text-slate-500">API Transport:</span>
            <span className="text-slate-300 font-mono truncate" title="Django same-origin API">Django same-origin API</span>
            
            <span className="text-slate-500">Search Endpoint:</span>
            <span className="text-slate-300 font-mono">POST /api/search/</span>
            
            <span className="text-slate-500">Dataset:</span>
            <span className={statusColor(datasetOnline)}>--</span>
            
            <span className="text-slate-500">Qdrant:</span>
            <span className={statusColor(qdrantOnline)}>--</span>

	            <span className="text-slate-500">Collection:</span>
	            <span className="text-slate-300 font-mono truncate" title={currentDataset || undefined}>
	              {currentDataset || '--'}
	            </span>

            <span className="text-slate-500">Models:</span>
            <span className={statusColor(modelsLoaded)}>--</span>
            
            <span className="text-slate-500">Last Search:</span>
            <span className={getSearchColor()}>
              {searchStatus.latency ? `${searchStatus.latency.toFixed(2)}s` : '--'}
            </span>
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-400">
            The current Django API does not expose a health endpoint, so backend, dataset, Qdrant, and model health are not measured here.
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-700 opacity-80 text-[10px] text-slate-600">
            <Cpu size={10} />
            Last checked: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
