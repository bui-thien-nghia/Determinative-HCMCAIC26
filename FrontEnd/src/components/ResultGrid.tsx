import { Search as SearchIcon, Loader2 } from 'lucide-react'
import { getSearchResultFilterSummary, useStore } from '../store'
import { ResultCard } from './ResultCard'

export default function ResultGrid() {
  const { searchResults, filterValues, columns, isLoading } = useStore()
  const filterSummary = getSearchResultFilterSummary(searchResults, filterValues)
  const visibleResults = filterSummary.results

  const gridClass = `grid gap-4 w-full ${
    columns === 2 ? 'grid-cols-2' :
    columns === 3 ? 'grid-cols-3' :
    columns === 4 ? 'grid-cols-4' :
    columns === 5 ? 'grid-cols-5' :
    'grid-cols-6'
  }`

  if (isLoading) {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
          <Loader2 size={24} className="text-blue-500 animate-spin" />
        </div>
        <p className="text-sm">Searching Qdrant...</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 custom-scrollbar flex flex-col">
      <div className={gridClass}>
        {visibleResults.map((result, idx) => (
          <ResultCard key={result.id || `${result.payload?.video_id}-${result.payload?.frame_id}-${idx}`} result={result} />
        ))}
      </div>

      {visibleResults.length === 0 && (
        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
            <SearchIcon size={24} className="text-slate-600" />
          </div>
          <p className="text-sm">
            {searchResults.length > 0 && filterSummary.activeFilterCount > 0
              ? 'No current search results match the active Schema Filters.'
              : 'No results to display. Enter a search query.'}
          </p>
        </div>
      )}
    </div>
  )
}
