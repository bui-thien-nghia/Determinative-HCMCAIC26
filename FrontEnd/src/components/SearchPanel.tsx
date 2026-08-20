import { useMemo, useRef, useState } from 'react'
import { Search, Loader2, Type, Mic, FileQuestion, Trash, SlidersHorizontal, Database, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'

function formatFieldLabel(field: string) {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function inputTypeFor(dataType: string) {
  const normalized = dataType.toLowerCase()
  return normalized.includes('int') || normalized.includes('float') || normalized.includes('number')
    ? 'number'
    : 'text'
}

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const searchRequestIdRef = useRef(0)
	  const {
	    currentDataset, setDataset,
	    currentModel, setModel,
	    availableCollections,
	    collectionSchema,
	    schemaLoading,
	    schemaError,
	    filterValues,
	    metadataVisibility,
	    setFilterValue,
	    clearFilterValues,
	    setMetadataVisibility,
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
    displayMode,
    error, setError,
    addToast,
	    setSearchStatus
	  } = useStore()

  const indexedFields = useMemo(() => (
    Object.entries(collectionSchema)
      .filter(([, descriptor]) => descriptor.is_indexed)
      .sort(([a], [b]) => a.localeCompare(b))
  ), [collectionSchema])

  const displayFields = useMemo(() => (
    Object.entries(collectionSchema)
      .filter(([, descriptor]) => !descriptor.is_indexed)
      .sort(([a], [b]) => a.localeCompare(b))
  ), [collectionSchema])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const queryToSearch = query.trim()

	    if (!queryToSearch) return

	    if (!currentDataset) {
	      const msg = 'No collection selected'
	      setError(msg)
	      addToast(msg, 'error')
	      return
	    }

	    const collection = currentDataset
	    const modelId = currentModel || 'siglip2'
    const safeTopK = Math.min(100, Math.max(1, Number(topK) || 100))

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    setIsLoading(true)
    setError(null)
    setSearchStatus({ state: 'searching', latency: null })
    const startTime = performance.now()

    try {
      const rawResults = displayMode === 'full'
        ? await api.aggregatedSearch(queryToSearch, collection, modelId, safeTopK)
        : await api.search(queryToSearch, collection, modelId, safeTopK)
      if (searchRequestIdRef.current !== requestId) return
      const results = displayMode === 'full' ? rawResults.slice(0, safeTopK) : rawResults
      const latency = (performance.now() - startTime) / 1000
      setSearchStatus({ state: 'success', latency })
      setSearchResults(results || [])

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
        results: results || [],
        timestamp: Date.now()
      })
      addToast(`Search complete: ${results?.length || 0} result(s)`, 'success')
    } catch (err) {
      if (searchRequestIdRef.current !== requestId) return
      const msg = err instanceof Error ? err.message : 'Search failed'
      console.error(err)
      setError(msg)
      setSearchStatus({ state: 'error', latency: null })
      addToast(msg, 'error')
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
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
    { id: 'KIS', icon: Type, enabled: true },
    { id: 'QA', icon: FileQuestion, enabled: true },
    { id: 'TRAKE', icon: Mic, enabled: true }
  ]

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-sm overflow-y-auto custom-scrollbar">
      {/* KIS / QA / TRAKE mode selector */}
      <div className="flex shrink-0 border-b border-slate-800 bg-slate-950/50">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => tab.enabled && setMode(tab.id)}
              disabled={!tab.enabled}
              title={!tab.enabled ? 'Not implemented yet' : tab.id}
              className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 transition-colors border-b-2 ${
                !tab.enabled ? 'opacity-30 cursor-not-allowed text-slate-500 border-transparent' :
                mode === tab.id ? 'bg-blue-600/10 text-blue-400 border-blue-500' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300 border-transparent'
              }`}
            >
              <Icon size={14} />
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
            className="w-full bg-slate-950 text-slate-200 rounded p-3 text-sm border border-slate-800 focus:outline-none focus:border-blue-500 min-h-25 resize-y"
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
	            disabled={isLoading || !query.trim() || !currentDataset}
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
	            value={currentDataset || ''}
	            disabled={availableCollections.length === 0}
	            onChange={(e) => {
	              const ds = e.target.value
	              setDataset(ds)
	              setModel('siglip2')
	              addToast(`Collection changed to ${ds}`, 'info')
	            }}
	            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
	          >
	            {availableCollections.length === 0 ? (
	              <option value="">No collections loaded</option>
	            ) : (
	              availableCollections.map((collection) => (
	                <option key={collection} value={collection}>{collection}</option>
	              ))
	            )}
	          </select>
	          {schemaLoading && (
	            <div className="text-[9px] text-slate-500 mt-1">Loading collection schema...</div>
	          )}
	          {schemaError && (
	            <div className="text-[9px] text-red-400 mt-1">{schemaError}</div>
	          )}
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
	            <FilterBlock icon={<Database size={16} />} title="Schema Filters">
	              <div className="text-[10px] text-amber-400/90 leading-relaxed">
	                Filter fields come from the selected collection schema. The current backend accepts filter-shaped input but does not apply filters to retrieval yet, so values are stored locally only.
	              </div>
	              {indexedFields.length === 0 ? (
	                <div className="text-xs text-slate-600 italic">No indexed fields reported for this collection.</div>
	              ) : (
	                <div className="grid grid-cols-2 gap-2">
	                  {indexedFields.map(([field, descriptor]) => (
	                    <FilterInput
	                      key={field}
	                      label={formatFieldLabel(field)}
	                      type={inputTypeFor(descriptor.data_type)}
	                      value={filterValues[field] ?? ''}
	                      onChange={(value) => setFilterValue(field, value)}
	                    />
	                  ))}
	                </div>
	              )}
	              {Object.values(filterValues).some((value) => value.trim()) && (
	                <button
	                  type="button"
	                  onClick={clearFilterValues}
	                  className="self-start text-[10px] text-slate-500 hover:text-slate-300 border border-slate-800 rounded px-2 py-1"
	                >
	                  Clear filter values
	                </button>
	              )}
	            </FilterBlock>

	            <FilterBlock icon={<SlidersHorizontal size={16} />} title="Metadata Display">
	              {displayFields.length === 0 ? (
	                <div className="text-xs text-slate-600 italic">No display-only metadata fields reported for this collection.</div>
	              ) : (
	                <div className="grid grid-cols-2 gap-2">
	                  {displayFields.map(([field]) => (
	                    <label key={field} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-300">
	                      <input
	                        type="checkbox"
	                        checked={metadataVisibility[field] !== false}
	                        onChange={(event) => setMetadataVisibility(field, event.target.checked)}
	                        className="accent-blue-600"
	                      />
	                      <span className="truncate" title={field}>{formatFieldLabel(field)}</span>
	                    </label>
	                  ))}
	                </div>
	              )}
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
                  <div className="text-xs text-slate-300 font-medium truncate w-45" title={h.query}>{h.query}</div>
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

function FilterInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 font-semibold">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
      />
    </label>
  )
}
