import SearchPanel from './components/SearchPanel'
import ResultGrid from './components/ResultGrid'
import RecheckPanel from './components/RecheckPanel'
import PreviewModal from './components/PreviewModal'
import VideoModal from './components/VideoModal'
import { useStore } from './store'
import SystemStatus from './components/SystemStatus'
import { LayoutGrid, X } from 'lucide-react'

function App() {
  const { columns, setColumns, previewResult, playingVideo, setPlayingVideo, toasts, removeToast, displayMode, setDisplayMode } = useStore()

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden font-sans select-none relative">
      <div className="fixed bottom-4 right-4 z-1500 flex flex-col-reverse gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md shadow-lg border text-xs font-medium transition-all ${
              toast.type === 'error' ? 'bg-red-900/90 border-red-700/80 text-red-100' :
              toast.type === 'success' ? 'bg-slate-800/95 border-slate-700 text-slate-100' :
              'bg-slate-800/95 border-slate-700 text-slate-300'
            }`}
          >
            {toast.type === 'success' && <span className="text-emerald-400 shrink-0">✓</span>}
            {toast.type === 'error' && <span className="text-red-400 shrink-0">✕</span>}
            {toast.type === 'info' && <span className="text-blue-400 shrink-0">·</span>}
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-1 opacity-50 hover:opacity-100 shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <header className="bg-slate-900 border-b border-slate-800 h-14 flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            <img
              src="/img/logo.jpg"
              alt="Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="font-semibold text-lg tracking-tight">Determinatives - AIC2026</h1>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
            <LayoutGrid size={16} className="text-slate-400" />
            <span className="text-slate-300 font-medium mr-1">COLS:</span>
            {[2, 3, 4, 5, 6].map(c => (
              <button
                key={c}
                onClick={() => setColumns(c)}
                className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${columns === c ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <SystemStatus />
            <div className="flex items-center bg-slate-800 rounded-md border border-slate-700 overflow-hidden ml-2">
              <div className="relative group/fast">
                <button
                  onClick={() => setDisplayMode('fast')}
                  aria-label="Fast Mode: standard retrieval for quick results."
                  aria-pressed={displayMode === 'fast'}
                  className={`px-3 py-1 text-[11px] font-bold tracking-wider transition-colors ${
                    displayMode === 'fast' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  Fast
                </button>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <div className="relative group/full">
                <button
                  onClick={() => setDisplayMode('full')}
                  aria-label="Deep Mode: aggregated retrieval and reranking for more refined results."
                  aria-pressed={displayMode === 'full'}
                  className={`px-3 py-1 text-[11px] font-bold tracking-wider transition-colors ${
                    displayMode === 'full' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  Deep
                </button>
              </div>
            </div>

            {/* Info button */}
            <div className="relative group/modeinfo">
              <button
                aria-label="Display mode information: Fast Mode and Deep Mode explained"
                className="w-5 h-5 rounded-full border border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0"
              >
                i
              </button>
              <div
                className="pointer-events-none fixed top-16 right-4 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 text-[10px] leading-relaxed shadow-2xl opacity-0 group-hover/modeinfo:opacity-100 transition-opacity duration-150 z-50 overflow-hidden"
                style={{ maxWidth: 'min(640px, calc(100vw - 2rem)', wordBreak: 'break-word' }}
              >
                <div className="grid grid-cols-2 divide-x divide-slate-700">
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                      Fast
                    </div>
                    <p className="text-slate-400">Standard retrieval for quick results.</p>
                    <p className="text-slate-500 italic">Uses POST /api/search/.</p>
                  </div>
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></span>
                      Deep
                    </div>
                    <p className="text-slate-400">Aggregated retrieval and reranking for more refined results.</p>
                    <p className="text-slate-500 italic">Uses POST /api/aggregatedsearch/.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-75 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-10">
          <SearchPanel />
        </aside>

        <main className="flex-1 min-w-0 bg-slate-950 relative">
          <ResultGrid />
        </main>

        <aside className="w-85 shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col z-10">
          <RecheckPanel />
        </aside>
      </div>

      {previewResult && <PreviewModal />}
      <VideoModal
        isOpen={!!playingVideo}
        onClose={() => setPlayingVideo(null)}
        videoId={playingVideo?.video_id || playingVideo?.payload?.video_id || ''}
        timestamp={playingVideo?.timestamp ?? playingVideo?.payload?.timestamp ?? 0}
        result={playingVideo}
      />
    </div>
  )
}

export default App
