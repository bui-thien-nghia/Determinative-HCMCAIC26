import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Radio, Users, Timer, Loader2 } from 'lucide-react'
import { useStore } from '../store'

export default function SystemStatus() {
  const [apiStatus, setApiStatus] = useState({ online: true, ping: 0, host: window.location.host })
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  const searchStatus = useStore(state => state.searchStatus)

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const top = rect.bottom + 8
      const right = Math.max(12, window.innerWidth - rect.right)
      setPopoverPos({ top, right })
    }
  }

  // Popover click outside
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
      window.addEventListener('scroll', updatePosition, true) // capture phase for scroll inside divs
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

  // API Ping interval
  useEffect(() => {
    const pingApi = async () => {
      const start = performance.now()
      try {
        await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        const latency = Math.round(performance.now() - start)
        setApiStatus({ online: true, ping: latency, host: window.location.host })
      } catch (e) {
        setApiStatus({ online: false, ping: 0, host: window.location.host })
      }
      setLastUpdate(new Date())
    }
    pingApi()
    const apiInt = setInterval(pingApi, 15000)

    return () => clearInterval(apiInt)
  }, [])

  const getApiColor = () => {
    if (!apiStatus.online) return "text-red-400"
    if (apiStatus.ping < 80) return "text-emerald-400"
    if (apiStatus.ping < 200) return "text-amber-400"
    return "text-red-400"
  }

  const getSearchColor = () => {
    if (searchStatus.state === 'error') return "text-red-400"
    if (searchStatus.state === 'searching') return "text-blue-400"
    if (!searchStatus.latency) return "text-slate-500"
    if (searchStatus.latency < 2) return "text-emerald-400"
    if (searchStatus.latency < 5) return "text-amber-400"
    return "text-red-400"
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
        {/* API Ping */}
        <div className="flex items-center gap-1">
          <Activity size={12} className={getApiColor()} />
          <span className={`font-mono uppercase tracking-wider ${apiStatus.online ? 'text-slate-300' : 'text-red-400 font-bold'}`}>
            {apiStatus.online ? `API ${apiStatus.ping}ms` : 'API OFFLINE'}
          </span>
        </div>
        
        <div className="w-px h-3 bg-slate-700" />
        
        {/* SYNC Live */}
        <div className="hidden sm:flex items-center gap-1">
          <Radio size={12} className="text-slate-500" />
          <span className="text-slate-400 font-mono uppercase tracking-wider">
            SYNC --
          </span>
        </div>

        <div className="w-px h-3 bg-slate-700 hidden sm:block" />

        {/* TEAM Members */}
        <div className="hidden lg:flex items-center gap-1">
          <Users size={12} className="text-slate-500" />
          <span className="text-slate-400 font-mono uppercase tracking-wider">
            TEAM --
          </span>
        </div>

        <div className="w-px h-3 bg-slate-700 hidden lg:block" />

        {/* SEARCH Latency */}
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

      {/* Popover */}
      {showPopover && createPortal(
        <div 
          id="system-status-popover"
          style={{ 
            top: popoverPos.top, 
            right: popoverPos.right, 
            maxWidth: 'min(360px, calc(100vw - 24px))' 
          }}
          className="fixed w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl shadow-black/50 p-4 z-1200 text-sm flex flex-col gap-3"
        >
          <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2">System Status</h3>
          
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-xs">
            <span className="text-slate-500">Host:</span>
            <span className="text-slate-300 font-mono">{apiStatus.host}</span>
            
            <span className="text-slate-500">API:</span>
            <span className={getApiColor()}>{apiStatus.online ? 'Online' : 'Offline'}</span>
            
            <span className="text-slate-500">Ping:</span>
            <span className={getApiColor()}>{apiStatus.ping} ms</span>
            
            <span className="text-slate-500">Realtime:</span>
            <span className="text-slate-500">Unavailable</span>
            
            <span className="text-slate-500">Members:</span>
            <span className="text-slate-500">--</span>
            
            <span className="text-slate-500">Last Search:</span>
            <span className={getSearchColor()}>
              {searchStatus.latency ? `${searchStatus.latency.toFixed(2)}s` : '--'}
            </span>
            
            <span className="text-slate-500">Host RAM:</span>
            <span className="text-slate-500">Unavailable</span>
            
            <span className="text-slate-500">Host CPU:</span>
            <span className="text-slate-500">Unavailable</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-700 opacity-80 group-hover:opacity-100 transition-opacity text-[10px] text-slate-600">
            Last checked: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

