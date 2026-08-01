import { useMemo, memo } from 'react'
import { Search as SearchIcon, Loader2, Film, CheckCircle, Play } from 'lucide-react'
import { useStore } from '../store'
import type { SearchResult } from '../store'
import { ResultCard } from './ResultCard'
import { getImageUrl } from '../utils/media'

type TrakeVideoCandidate = {
  videoId: string
  bestScore: number
  evidenceCount: number
  representativeFrames: SearchResult[]
}

const TrakeVideoCandidateCard = memo(({
  candidate,
  rank,
  isSelected,
  onPreview,
  onSelect
}: {
  candidate: TrakeVideoCandidate
  rank: number
  isSelected: boolean
  onPreview: (result: SearchResult) => void
  onSelect: (videoId: string) => void
}) => {
  return (
    <div className={`flex flex-col bg-slate-900 border rounded-lg overflow-hidden transition-colors shadow-sm ${isSelected ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-800 hover:border-slate-600'}`}>
      <div className="p-3 flex justify-between items-start border-b border-slate-800/50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">#{rank}</span>
            <span className="font-mono text-sm font-semibold text-slate-200">{candidate.videoId}</span>
            {isSelected && <span className="text-[9px] font-bold text-cyan-400 border border-cyan-800 bg-cyan-900/30 px-1.5 py-0.5 rounded tracking-widest">SELECTED</span>}
          </div>
          <div className="flex gap-4 text-[10px] text-slate-400">
            <span>Best: <span className="font-mono text-emerald-400">{(candidate.bestScore || 0).toFixed(4)}</span></span>
            <span>Evidence: <strong className="text-slate-300">{candidate.evidenceCount}</strong> frames</span>
          </div>
        </div>
      </div>
      
      <div className="p-3 bg-slate-950/50 flex gap-2 overflow-x-auto custom-scrollbar flex-1">
        {candidate.representativeFrames.map((frame, i) => (
          <div key={i} className="relative aspect-video h-16 shrink-0 bg-slate-900 rounded overflow-hidden border border-slate-800 group cursor-pointer" onClick={() => onPreview(frame)}>
            <img src={getImageUrl(frame.image_path || frame.payload?.img_link)} alt={`Evidence ${i}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
              <Play size={16} className="text-white drop-shadow-md" />
            </div>
            <div className="absolute bottom-1 right-1 text-[8px] bg-black/70 px-1 rounded font-mono text-slate-300">{frame.payload.frame_id}</div>
          </div>
        ))}
      </div>
      
      <div className="p-2 border-t border-slate-800/50 grid grid-cols-2 gap-2 bg-slate-900">
        <button onClick={() => onPreview(candidate.representativeFrames[0])} className="py-1.5 px-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors flex items-center justify-center gap-1.5">
          <Film size={12} /> Preview
        </button>
        <button onClick={() => onSelect(candidate.videoId)} className={`py-1.5 px-2 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 ${isSelected ? 'bg-cyan-700/80 text-white cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          {isSelected ? <CheckCircle size={12} /> : 'Select'}
        </button>
      </div>
    </div>
  )
})

export default function ResultGrid() {
  const { searchResults, columns, isLoading, mode, trakeState, setTrakeSelectedVideo, setPlayingVideo } = useStore()

  const isTrakeStage1 = mode === 'TRAKE' && trakeState.stage === 1
  const isTrakeStage2 = mode === 'TRAKE' && trakeState.stage === 2

  const displayResults = useMemo(() => {
    if (isTrakeStage2 && trakeState.selectedVideoId) {
      return searchResults.filter(r => r.payload?.video_id === trakeState.selectedVideoId)
    }
    return searchResults
  }, [searchResults, isTrakeStage2, trakeState.selectedVideoId])

  const videoCandidates = useMemo(() => {
    if (!isTrakeStage1 || searchResults.length === 0) return []
    
    const groups = new Map<string, SearchResult[]>()
    for (const res of searchResults) {
      const vid = res.payload?.video_id
      if (!vid) continue
      const existing = groups.get(vid) || []
      existing.push(res)
      groups.set(vid, existing)
    }
    
    const candidates: TrakeVideoCandidate[] = []
    for (const [vid, frames] of Array.from(groups.entries())) {
      const bestScore = Math.max(...frames.map(f => f.score || 0))
      const sortedFrames = [...frames].sort((a, b) => (b.score || 0) - (a.score || 0))
      const rep = sortedFrames.slice(0, 3)
      candidates.push({
        videoId: vid,
        bestScore,
        evidenceCount: frames.length,
        representativeFrames: rep
      })
    }
    
    candidates.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore
      return b.evidenceCount - a.evidenceCount
    })
    
    return candidates
  }, [isTrakeStage1, searchResults])

  const gridClass = `grid gap-4 w-full ${
    isTrakeStage1 ? (columns <= 3 ? 'grid-cols-2' : 'grid-cols-3') :
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
        <p className="text-sm">Searching mock vector database...</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 custom-scrollbar flex flex-col">
      {isTrakeStage2 && (
        <div className="mb-4 px-4 py-2 bg-blue-900/20 border border-blue-500/30 rounded text-blue-300 text-sm flex items-center gap-2 shrink-0">
          <Film size={16} className="text-blue-400" />
          Showing retrieved frames from <strong>{trakeState.selectedVideoId}</strong>
        </div>
      )}

      <div className={gridClass}>
        {isTrakeStage1 ? (
          videoCandidates.map((candidate, idx) => (
            <TrakeVideoCandidateCard
              key={candidate.videoId}
              candidate={candidate}
              rank={idx + 1}
              isSelected={trakeState.selectedVideoId === candidate.videoId}
              onPreview={(res) => setPlayingVideo(res)}
              onSelect={(vid) => setTrakeSelectedVideo(vid)}
            />
          ))
        ) : (
          displayResults.map((result, idx) => (
            <ResultCard key={result.id || `${result.payload?.video_id}-${result.payload?.frame_id}-${idx}`} result={result} />
          ))
        )}
      </div>

      {!isTrakeStage1 && displayResults.length === 0 && searchResults.length > 0 && (
        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
            <Film size={24} className="text-slate-600" />
          </div>
          <p className="text-sm">No retrieved frames available for {trakeState.selectedVideoId}.</p>
        </div>
      )}

      {searchResults.length === 0 && (
        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
            <SearchIcon size={24} className="text-slate-600" />
          </div>
          <p className="text-sm">
            {isTrakeStage1 ? "No video candidates yet. Search for the event sequence first." : "No results to display. Enter a search query."}
          </p>
        </div>
      )}
    </div>
  )
}
