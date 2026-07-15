import { useState } from 'react'
import { Search, Loader2, Image, Type, Mic, FileQuestion, Trash, SlidersHorizontal, Eye, Hash, Settings2, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const {
    currentDataset, setDataset,
    currentModel, setModel,
    topK, setTopK,
    language, setLanguage,
    mode, setMode,
    setSearchResults,
    addToSearchHistory,
    removeSearchHistory,
    clearSearchHistory,
    searchHistory,
    setLastSearch,
    isLoading, setIsLoading,
    error, setError,
    addToast
  } = useStore()

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const queryToSearch = query.trim()

    if (!queryToSearch) return

    const collection = currentDataset || 'AIC2026_SIGLIP'
    const modelId = currentModel || 'siglip-so400m'
    const safeTopK = Math.min(100, Math.max(1, Number(topK) || 100))

    setIsLoading(true)
    setError(null)

    try {
      const res = await api.search(queryToSearch, collection, modelId, safeTopK)
      setSearchResults(res.results || [])

      setLastSearch({
        query: queryToSearch,
        collection,
        model_id: modelId,
        top_k: safeTopK,
        mode,
        language,
      })

      addToSearchHistory({
        query: queryToSearch,
        mode,
        language,
        top_k: safeTopK,
        collection,
        model_id: modelId,
        results: res.results || [],
        timestamp: Date.now()
      })
      addToast('Search complete', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed'
      console.error(err)
      setError(msg)
      addToast('Search failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = () => {
    setQuery('')
    setSearchResults([])
    setError(null)
  }

  const handleRestoreHistory = (h: any) => {
    setQuery(h.query)
    setMode(h.mode)
    setLanguage(h.language)
    setTopK(h.top_k)
    if (h.collection) setDataset(h.collection)
    if (h.model_id) setModel(h.model_id)
    setSearchResults(h.results)
    addToast('History restored', 'info')
  }

  const tabs = [
    { id: 'AUTO', icon: Image, enabled: true },
    { id: 'KIS', icon: Type, enabled: true },
    { id: 'QA', icon: FileQuestion, enabled: true },
    { id: 'TRAKE', icon: Mic, enabled: true }
  ]

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-sm overflow-y-auto custom-scrollbar">
      <div className="flex p-2 gap-1 border-b border-slate-800 bg-slate-950/50">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => tab.enabled && setMode(tab.id)}
              disabled={!tab.enabled}
              title={!tab.enabled ? 'Not implemented yet' : ''}
              className={`flex-1 py-2 flex flex-col items-center justify-center gap-1 rounded transition-colors ${
                !tab.enabled ? 'opacity-30 cursor-not-allowed text-slate-500' :
                mode === tab.id ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              <Icon size={16} />
              <span className="text-[10px] font-bold tracking-wider">{tab.id}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block uppercase tracking-wider">Query</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSearch()
              }
            }}
            placeholder="Search images, text, speech..."
            className="w-full bg-slate-950 text-slate-200 rounded p-3 text-sm border border-slate-800 focus:outline-none focus:border-blue-500 min-h-[100px] resize-y"
          />
          <div className="text-[9px] text-slate-500 mt-1 text-right">Press Cmd/Ctrl + Enter to search</div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800/50 text-red-400 p-2 rounded text-xs">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => handleSearch()}
            disabled={isLoading || !query.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            {isLoading ? 'SEARCHING...' : 'SEARCH'}
          </button>
          <button
            onClick={handleRefresh}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2.5 rounded transition-colors text-xs font-semibold uppercase flex items-center gap-2"
          >
            Refresh
          </button>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="AUTO">AUTO</option>
            <option value="English">English</option>
            <option value="Vietnamese">Vietnamese</option>
          </select>
          {language === 'Vietnamese' && (
            <div className="text-[9px] text-amber-500/80 mt-1 italic">
              Vietnamese search may be less accurate unless translation is enabled.
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1 flex justify-between uppercase tracking-wider">
            <span>Top K</span>
            <span className="text-slate-400">{topK}</span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="1"
              max="100"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10) || 100)}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500"
            />
            <div className="flex gap-1 flex-1">
              {[5, 10, 20, 50, 100].map(k => (
                <button
                  key={k}
                  onClick={() => setTopK(k)}
                  className={`flex-1 text-[10px] py-1 rounded transition-colors border ${topK === k ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">Collection</label>
          <select
            value={currentDataset || 'AIC2026_SIGLIP'}
            onChange={(e) => {
              const ds = e.target.value
              setDataset(ds)
              if (ds === 'AIC2026_SIGLIP') {
                setModel('siglip-so400m')
                addToast('Collection changed to AIC2026_SIGLIP', 'info')
              }
              if (ds === 'AIC2026') {
                setModel('clip-vit-b-32')
                addToast('Collection changed to AIC2026', 'info')
              }
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="AIC2026_SIGLIP">AIC2026_SIGLIP</option>
            <option value="AIC2026">AIC2026</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">Model</label>
          <select
            value={currentModel || 'siglip-so400m'}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="siglip-so400m">SigLIP SO400M</option>
            <option value="clip-vit-b-32">CLIP ViT-B/32</option>
          </select>
        </div>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300 hover:bg-slate-800 flex items-center justify-center gap-2 font-semibold"
        >
          <SlidersHorizontal size={16} />
          {showAdvanced ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
        </button>

        {showAdvanced && (
          <div className="bg-slate-950 border border-slate-800 rounded-md p-3 flex flex-col gap-3">
            <FilterBlock icon={<Search size={16} />} title="Semantic & Score">
              <FilterInput label="Min SigLIP Score" type="number" />
            </FilterBlock>
            <FilterBlock icon={<Settings2 size={16} />} title="Metadata & Temporal">
              <div className="grid grid-cols-2 gap-2">
                <FilterInput label="Video ID" />
                <FilterInput label="Frame ID/Idx" />
              </div>
            </FilterBlock>
            <FilterBlock icon={<Eye size={16} />} title="Visual Objects (YOLO)">
              <FilterInput label="Detected Objects" placeholder="e.g. car, dog, helmet" />
            </FilterBlock>
            <FilterBlock icon={<Hash size={16} />} title="People Counting">
              <div className="grid grid-cols-2 gap-2">
                <FilterInput label="Min People" type="number" />
                <FilterInput label="Max People" type="number" />
              </div>
            </FilterBlock>
            <FilterBlock icon={<Type size={16} />} title="OCR & ASR Text">
              <FilterInput label="OCR Contains" />
              <FilterInput label="ASR Transcript Contains" />
            </FilterBlock>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Recent Searches</label>
            {searchHistory.length > 0 && (
              <button
                onClick={() => {
                  clearSearchHistory()
                  addToast('History cleared', 'info')
                }}
                className="text-[9px] text-slate-500 hover:text-red-400 uppercase tracking-wider transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {searchHistory.length === 0 && (
              <div className="text-xs text-slate-600 italic">No history yet</div>
            )}
            {searchHistory.map((h, i) => (
              <div key={i} className="flex gap-1 items-start bg-slate-950 p-2 rounded border border-slate-800 group">
                <button
                  className="flex-1 cursor-pointer text-left"
                  onClick={() => handleRestoreHistory(h)}
                >
                  <div className="text-xs text-slate-300 font-medium truncate w-[180px]" title={h.query}>{h.query}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] px-1 py-0.5 bg-slate-800 text-slate-400 rounded uppercase tracking-wider">{h.mode}</span>
                    <span className="text-[9px] text-slate-500">{h.results?.length || 0} res</span>
                    <span className="text-[9px] text-slate-600 ml-auto">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      handleRestoreHistory(h)
                      handleSearch()
                    }}
                    className="p-1 hover:bg-slate-800 text-slate-500 hover:text-blue-400 rounded transition-colors"
                    title="Rerun"
                  >
                    <Search size={10} />
                  </button>
                  <button
                    onClick={() => {
                      removeSearchHistory(i)
                      addToast('History deleted', 'info')
                    }}
                    className="p-1 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <details open className="group">
      <summary className="list-none cursor-pointer bg-slate-900 rounded px-2 py-2 flex items-center gap-2 text-xs font-bold text-slate-300">
        <ChevronDown size={14} className="group-open:rotate-0 -rotate-90 transition" />
        <span className="text-red-400">{icon}</span>
        {title}
      </summary>
      <div className="border-l border-slate-700 ml-3 pl-3 py-2 flex flex-col gap-2">
        {children}
      </div>
    </details>
  )
}

function FilterInput({ label, type = 'text', placeholder }: { label: string; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 font-semibold">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
      />
    </label>
  )
}
