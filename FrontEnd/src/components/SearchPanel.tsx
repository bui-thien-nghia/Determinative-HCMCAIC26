import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, Type, Mic, FileQuestion, Trash, SlidersHorizontal, Database, ChevronDown, FolderOpen } from 'lucide-react'
import {
  buildSearchFilterRequest,
  describeSearchQuery,
  getRangeFilterValidationError,
  getSearchResultFilterSummary,
  MAX_TOP_K,
  useStore,
  validateTopKInput,
} from '../store'
import { api } from '../api'
import type { SearchModality } from '../api'

const DEFAULT_LANGUAGE = 'AUTO'
const retrievalModes = [
  {
    id: 'fast' as const,
    label: 'Fast',
    description: 'Standard retrieval for quick results.',
  },
  {
    id: 'full' as const,
    label: 'Deep',
    description: 'Aggregated retrieval and reranking for refined results.',
  },
]

const searchModalities: Array<{ id: SearchModality; label: string; description: string }> = [
  {
    id: 'visual',
    label: 'Visual',
    description: 'Placeholder for image/frame-only retrieval once backend support exists.',
  },
  {
    id: 'textual',
    label: 'Textual',
    description: 'Placeholder for text/transcript-only retrieval once backend support exists.',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Current backend behavior.',
  },
]

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

function datasetStatusLabel(status: string | null) {
  if (!status) return 'CHECKING'
  return status.replace(/_/g, ' ').toUpperCase()
}

function datasetStatusClass(status: string | null) {
  if (status === 'ready') return 'bg-emerald-400'
  if (status === 'images_missing' || status === 'videos_missing' || status === 'partial') return 'bg-amber-400'
  if (status === 'path_not_found' || status === 'no_permission') return 'bg-red-400'
  return 'bg-slate-500'
}

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [topKInput, setTopKInput] = useState('100')
  const [topKInteracted, setTopKInteracted] = useState(false)
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
	    mode, setMode,
	    searchResults,
	    setSearchResults,
    addToSearchHistory,
    removeSearchHistory,
    clearSearchHistory,
    searchHistory,
    setLastSearch,
    isLoading, setIsLoading,
	    displayMode, setDisplayMode,
      searchModality, setSearchModality,
	    error, setError,
	    addToast,
		    setSearchStatus,
		    datasetRoot,
		    datasetStatus,
		    datasetStatusMessage,
		    imagesAvailable,
		    videosAvailable,
			    canChangeDatasetRoot,
			    datasetConfigLoading,
			    datasetConfigError,
			    loadDatasetConfig,
			    chooseDatasetRoot
			  } = useStore()

  useEffect(() => {
    loadDatasetConfig()
  }, [loadDatasetConfig])

  useEffect(() => {
    setTopKInput(String(topK))
  }, [topK])

  const indexedFields = useMemo(() => (
    Object.entries(collectionSchema)
      .filter(([, descriptor]) => descriptor.is_indexed)
      .sort(([a], [b]) => a.localeCompare(b))
  ), [collectionSchema])

  const indexedFieldNames = useMemo(() => new Set(indexedFields.map(([field]) => field)), [indexedFields])
  const transcriptFilterField = indexedFieldNames.has('transcript')
    ? 'transcript'
    : indexedFieldNames.has('caption')
      ? 'caption'
      : null
  const videoIdFilterField = indexedFieldNames.has('video_id')
    ? 'video_id'
    : indexedFieldNames.has('vid_id')
      ? 'vid_id'
      : null
  const timeOrderFilterField = indexedFieldNames.has('time_order')
    ? 'time_order'
    : indexedFieldNames.has('timestamp')
      ? 'timestamp'
      : null
  const primaryFilterFields = useMemo(() => new Set([
    'frame_id',
    'frame_order',
    'time_order',
    'timestamp',
    'transcript',
    'caption',
    'video_id',
    'vid_id',
  ]), [])
  const remainingIndexedFields = useMemo(
    () => indexedFields.filter(([field]) => !primaryFilterFields.has(field)),
    [indexedFields, primaryFilterFields],
  )

  const displayFields = useMemo(() => (
    Object.entries(collectionSchema)
      .filter(([, descriptor]) => !descriptor.is_indexed)
      .sort(([a], [b]) => a.localeCompare(b))
  ), [collectionSchema])

  const filterSummary = useMemo(
    () => getSearchResultFilterSummary(searchResults, filterValues),
    [filterValues, searchResults],
  )
  const searchFilterRequest = useMemo(
    () => buildSearchFilterRequest(filterValues, collectionSchema),
    [collectionSchema, filterValues],
  )
  const topKValidation = useMemo(() => validateTopKInput(topKInput), [topKInput])
  const topKError = topKValidation.valid ? null : topKValidation.error
  const showTopKError = topKInteracted && Boolean(topKError)
  const frameIdRangeError = getRangeFilterValidationError(filterValues, 'frame_id')
  const frameOrderRangeError = getRangeFilterValidationError(filterValues, 'frame_order')
  const timeOrderRangeError = getRangeFilterValidationError(filterValues, 'time_order')
  const queryToSearch = query.trim()
  const canSearch = Boolean(
    currentDataset
      && !isLoading
      && searchFilterRequest.errors.length === 0
      && topKValidation.valid
      && (queryToSearch || searchFilterRequest.hasBackendFilters),
  )

  const commitTopKInput = (input: string) => {
    const validation = validateTopKInput(input)
    if (validation.valid) {
      setTopK(validation.value)
    }
    return validation.valid
  }

  const handleTopKInputChange = (value: string) => {
    setTopKInput(value)
    setTopKInteracted(true)

    const validation = validateTopKInput(value)
    if (validation.valid) {
      setTopK(validation.value)
    }
  }

  const handleTopKIncrement = (amount: number) => {
    const nextTopK = Math.min(MAX_TOP_K, topK + amount)
    setTopK(nextTopK)
    setTopKInput(String(nextTopK))
    setTopKInteracted(false)
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (!topKValidation.valid) {
      setTopKInteracted(true)
      const msg = topKValidation.error
      setError(msg)
      addToast(msg, 'error')
      return
    }

    if (searchFilterRequest.errors.length > 0) {
      const msg = searchFilterRequest.errors.join(' ')
      setError(msg)
      addToast(msg, 'error')
      return
    }

	    if (!queryToSearch && !searchFilterRequest.hasBackendFilters) {
	      const msg = 'Enter a query or at least one filter.'
	      setError(msg)
	      addToast(msg, 'error')
	      return
	    }

	    if (!currentDataset) {
	      const msg = 'No collection selected'
	      setError(msg)
	      addToast(msg, 'error')
	      return
	    }

	    const collection = currentDataset
	    const modelId = currentModel || 'siglip2'
    const safeTopK = topKValidation.value

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    setIsLoading(true)
    setError(null)
    setSearchStatus({ state: 'searching', latency: null })
    const startTime = performance.now()

    try {
      const rawResults = !queryToSearch
        ? await api.filterSearch(collection, searchFilterRequest.filters, safeTopK)
        : displayMode === 'full'
          ? await api.aggregatedSearch(queryToSearch, collection, modelId, safeTopK, searchFilterRequest.filters, searchModality)
          : await api.search(queryToSearch, collection, modelId, safeTopK, searchFilterRequest.filters, searchModality)
      if (searchRequestIdRef.current !== requestId) return
      const results = displayMode === 'full' ? rawResults.slice(0, safeTopK) : rawResults
      const latency = (performance.now() - startTime) / 1000
      const historyQuery = describeSearchQuery(queryToSearch, searchFilterRequest)
      setSearchStatus({ state: 'success', latency })
      setSearchResults(results || [])

      setLastSearch({
        query: historyQuery,
        collection,
        model_id: modelId,
        top_k: safeTopK,
        mode,
        searchModality,
        language: DEFAULT_LANGUAGE,
      })

      addToSearchHistory({
        query: historyQuery,
        queryText: queryToSearch,
        mode,
        searchModality,
        language: DEFAULT_LANGUAGE,
        top_k: safeTopK,
        collection,
        model_id: modelId,
        results: results || [],
        filterValues: { ...filterValues },
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
    setQuery(typeof h.queryText === 'string' ? h.queryText : h.query)
    setMode(h.mode)
    if (h.searchModality) setSearchModality(h.searchModality)
    setTopK(h.top_k)
    setTopKInput(String(h.top_k))
    setTopKInteracted(false)
    const restoredCollection = h.collection && availableCollections.includes(h.collection)
      ? h.collection
      : availableCollections[0]
    if (restoredCollection) setDataset(restoredCollection)
    if (h.model_id) setModel(h.model_id)
    clearFilterValues()
    Object.entries(h.filterValues || {}).forEach(([field, value]) => {
      if (typeof value === 'string') setFilterValue(field, value)
    })
    setSearchResults(h.results)
    addToast('History restored', 'info')
  }

  const handleChooseDatasetRoot = () => {
    if (!canChangeDatasetRoot) {
      addToast('Dataset folder is configured on the Vite host', 'info')
      return
    }
    chooseDatasetRoot()
  }

  const tabs = [
    { id: 'KIS', icon: Type, enabled: true },
    { id: 'QA', icon: FileQuestion, enabled: true },
    { id: 'TRAKE', icon: Mic, enabled: true }
  ]

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-sm overflow-y-auto custom-scrollbar">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retrieval</div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {retrievalModes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDisplayMode(item.id)}
              aria-label={`${item.label} Mode: ${item.description}`}
              aria-pressed={displayMode === item.id}
              title={item.description}
              className={`rounded border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                displayMode === item.id
                  ? 'border-blue-500/70 bg-blue-600/20 text-blue-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Search modality</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {searchModalities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSearchModality(item.id)}
              aria-pressed={searchModality === item.id}
              title={item.description}
              className={`rounded border px-1.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                searchModality === item.id
                  ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

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
	            disabled={!canSearch}
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
          <label htmlFor="top-k-input" className="text-[10px] font-semibold text-slate-500 mb-1 flex justify-between uppercase tracking-wider">
            <span>Top K</span>
            <span className="text-slate-400">{topK}</span>
          </label>
          <input
            id="top-k-input"
            type="text"
            inputMode="numeric"
            value={topKInput}
            onChange={(event) => handleTopKInputChange(event.target.value)}
            onBlur={() => {
              setTopKInteracted(true)
              commitTopKInput(topKInput)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                setTopKInteracted(true)
                commitTopKInput(topKInput)
              }
            }}
            aria-invalid={showTopKError}
            aria-describedby={showTopKError ? 'top-k-error' : undefined}
            className={`w-full bg-slate-950 border rounded px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500 ${
              showTopKError ? 'border-red-700/70' : 'border-slate-800'
            }`}
          />
          {showTopKError && (
            <div id="top-k-error" className="mt-1 text-[10px] text-red-400">
              {topKError}
            </div>
          )}
          <div className="mt-2 grid grid-cols-5 gap-1">
            {[5, 10, 20, 50, 100].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleTopKIncrement(amount)}
                disabled={topK >= MAX_TOP_K}
                aria-label={`Increase Top K by ${amount}`}
                title={`Add ${amount} to Top K`}
                className="min-w-0 rounded border border-slate-800 bg-slate-950 px-1 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:text-slate-400"
              >
                +{amount}
              </button>
            ))}
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

	        <div>
	          <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider">Dataset Folder</label>
		          <button
		            type="button"
		            onClick={handleChooseDatasetRoot}
		            disabled={!canChangeDatasetRoot || datasetConfigLoading}
		            className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${
		              canChangeDatasetRoot
		                ? 'bg-slate-950 border-slate-800 hover:border-blue-500 hover:bg-slate-900'
		                : 'bg-slate-950/70 border-slate-800 text-slate-500 cursor-default'
		            }`}
		          >
	            <div className="flex items-center gap-2 min-w-0">
	              <FolderOpen size={15} className={canChangeDatasetRoot ? 'text-blue-400 shrink-0' : 'text-slate-500 shrink-0'} />
	              <span className="truncate text-xs text-slate-200" title={datasetRoot || 'Dataset root not loaded'}>
	                {datasetConfigLoading && !datasetRoot ? 'Loading dataset folder...' : datasetRoot || 'Dataset root not loaded'}
	              </span>
		              {canChangeDatasetRoot ? (
		                <span className="ml-auto text-[9px] font-bold text-blue-400 uppercase tracking-wider">
		                  {datasetConfigLoading ? 'Choosing...' : 'Change'}
		                </span>
		              ) : (
	                <span className="ml-auto text-[9px] font-bold text-slate-500 uppercase tracking-wider">Read only</span>
	              )}
	            </div>
	          </button>
	          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-500">
	            <span className="flex items-center gap-1 font-bold text-slate-300">
	              <span className={`h-1.5 w-1.5 rounded-full ${datasetStatusClass(datasetStatus)}`} />
	              {datasetStatusLabel(datasetStatus)}
	            </span>
	            <span className={imagesAvailable ? 'text-emerald-400' : 'text-slate-500'}>Images {imagesAvailable ? '✓' : '×'}</span>
	            <span className={videosAvailable ? 'text-emerald-400' : 'text-slate-500'}>Videos {videosAvailable ? '✓' : '×'}</span>
	          </div>
	          {!canChangeDatasetRoot && (
	            <div className="text-[9px] text-slate-500 mt-1">Dataset configured on host</div>
	          )}
	          {datasetConfigError && (
	            <div className="text-[9px] text-red-400 mt-1">{datasetConfigError}</div>
	          )}
	          {!datasetConfigError && datasetStatusMessage && datasetStatus !== 'ready' && (
	            <div className="text-[9px] text-amber-400 mt-1">{datasetStatusMessage}</div>
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
	          <div className="bg-slate-950 border border-slate-800 rounded-md p-3 flex flex-col">
		            <FilterBlock icon={<Database size={16} />} title="Schema Filters">
		              <div className="flex items-start justify-between gap-3">
		                <div className="text-[10px] text-amber-400/90 leading-relaxed">
		                  Search filters constrain results in the current collection.
		                </div>
		                {filterSummary.activeFilterCount > 0 && (
		                  <button
		                    type="button"
		                    onClick={clearFilterValues}
		                    className="shrink-0 text-[9px] text-slate-500 hover:text-slate-300 border border-slate-800 rounded px-2 py-1 uppercase tracking-wider"
		                  >
		                    Clear
		                  </button>
		                )}
		              </div>
		              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
		                {filterSummary.activeFilterCount > 0
		                  ? `${filterSummary.activeFilterCount} active · ${searchResults.length} results`
		                  : `${searchResults.length} results`}
		              </div>
		              {filterSummary.invalidFilters.length > 0 && (
		                <div className="rounded border border-red-900/50 bg-red-950/30 p-2 text-[10px] text-red-300">
		                  {filterSummary.invalidFilters.join(' ')}
		                </div>
		              )}
              {indexedFields.length === 0 ? (
                <div className="text-xs text-slate-600 italic">No indexed fields reported for this collection.</div>
              ) : (
		                <div className="flex flex-col gap-2">
		                  {indexedFieldNames.has('frame_id') && (
		                    <RangeFilterInput
		                      label="Frame Id"
		                      fromValue={filterValues.frame_id_from ?? ''}
		                      toValue={filterValues.frame_id_to ?? ''}
		                      onFromChange={(value) => setFilterValue('frame_id_from', value)}
		                      onToChange={(value) => setFilterValue('frame_id_to', value)}
		                      error={frameIdRangeError}
		                      inputMode="numeric"
		                    />
		                  )}
		                  {indexedFieldNames.has('frame_order') && (
		                    <RangeFilterInput
		                      label="Frame Order"
		                      fromValue={filterValues.frame_order_from ?? ''}
		                      toValue={filterValues.frame_order_to ?? ''}
		                      onFromChange={(value) => setFilterValue('frame_order_from', value)}
		                      onToChange={(value) => setFilterValue('frame_order_to', value)}
		                      error={frameOrderRangeError}
		                      inputMode="numeric"
		                    />
		                  )}
		                  {timeOrderFilterField && (
		                    <RangeFilterInput
		                      label="Time Order"
		                      fromValue={filterValues[`${timeOrderFilterField}_from`] ?? ''}
		                      toValue={filterValues[`${timeOrderFilterField}_to`] ?? ''}
		                      onFromChange={(value) => setFilterValue(`${timeOrderFilterField}_from`, value)}
		                      onToChange={(value) => setFilterValue(`${timeOrderFilterField}_to`, value)}
		                      error={timeOrderRangeError}
		                      inputMode="decimal"
		                    />
		                  )}
		                  {(transcriptFilterField || videoIdFilterField) && (
		                    <div className="grid grid-cols-2 gap-2">
		                      {transcriptFilterField && (
		                        <FilterInput
		                          label="Transcript"
		                          value={filterValues[transcriptFilterField] ?? ''}
		                          onChange={(value) => setFilterValue(transcriptFilterField, value)}
		                        />
		                      )}
		                      {videoIdFilterField && (
		                        <FilterInput
		                          label="Video Id"
		                          value={filterValues[videoIdFilterField] ?? ''}
		                          onChange={(value) => setFilterValue(videoIdFilterField, value)}
		                        />
		                      )}
		                    </div>
		                  )}
		                  {remainingIndexedFields.length > 0 && (
		                    <div className="grid grid-cols-2 gap-2">
		                      {remainingIndexedFields.map(([field, descriptor]) => (
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
		                </div>
		              )}
		            </FilterBlock>

	            <div className="my-2 border-t border-slate-800" />

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
      <summary className="list-none cursor-pointer rounded px-1 py-1.5 flex items-center gap-2 text-xs font-bold text-slate-300 hover:bg-slate-900/70">
        <ChevronDown size={14} className="group-open:rotate-0 -rotate-90 transition" />
        <span className="text-red-400">{icon}</span>
        {title}
      </summary>
      <div className="border-l border-slate-800 ml-3 pl-3 pt-1.5 pb-2 flex flex-col gap-2">
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

function RangeFilterInput({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  error,
  inputMode,
}: {
  label: string
  fromValue: string
  toValue: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  error: string | null
  inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  const inputClass = `w-full bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 outline-none ${
    error ? 'border-red-800 focus:border-red-500' : 'border-slate-800 focus:border-blue-500'
  }`

  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 font-semibold">{label}</span>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <input
          type="text"
          inputMode={inputMode}
          placeholder="From"
          value={fromValue}
          onChange={(event) => onFromChange(event.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          inputMode={inputMode}
          placeholder="To"
          value={toValue}
          onChange={(event) => onToChange(event.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <div className="mt-1 text-[9px] text-red-300">{error}</div>
      )}
    </label>
  )
}
