import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, Map, MessageSquare, Type, FileVideo } from 'lucide-react'
import { useStore } from '../store'
import { getImageUrl } from '../utils/media'

export default function PreviewModal() {
  const { previewResult, setPreviewResult, searchResults, addToRecheckList, setPlayingVideo, addToast } = useStore()
  const [activeTab, setActiveTab] = useState('Overview')

  const currentIndex = searchResults.findIndex(r => r.id === previewResult?.id)

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex > 0) setPreviewResult(searchResults[currentIndex - 1])
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex < searchResults.length - 1) setPreviewResult(searchResults[currentIndex + 1])
  }

  const handleClose = () => setPreviewResult(null)

  const handleAddToBuilder = async () => {
    if (!previewResult) return
    try {
      const item = {
        id: previewResult.id || `${previewResult.payload?.video_id}_${previewResult.payload?.frame_id}_${Date.now()}`,
        img_link: previewResult.payload.img_link || previewResult.image_path || '',
        payload: previewResult.payload,
        answerType: useStore.getState().mode as any
      }

      const { api } = await import('../api')
      api.addRecheck(item).catch(console.error)

      addToRecheckList(item)
      addToast('Added to Answer Builder', 'success')
    } catch (err) {
      console.error(err)
      addToast('Add failed', 'error')
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) setPreviewResult(searchResults[currentIndex - 1])
      if (e.key === 'ArrowRight' && currentIndex < searchResults.length - 1) setPreviewResult(searchResults[currentIndex + 1])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, searchResults, setPreviewResult])

  if (!previewResult) return null

  const tabs = [
    { id: 'Overview', icon: ImageIcon, enabled: true },
    { id: 'Neighbors', icon: Map, enabled: true },
    { id: 'Q&A Answer', icon: MessageSquare, enabled: true },
    { id: 'OCR', icon: Type, enabled: true }
  ]

  const imagePath = previewResult.payload.img_link || previewResult.image_path || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8" onClick={handleClose}>
      <button
        onClick={handlePrevious}
        disabled={currentIndex <= 0}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 transition-colors bg-slate-900/50 hover:bg-slate-800 rounded-full border border-slate-700 backdrop-blur-md"
      >
        <ChevronLeft size={32} />
      </button>

      <button
        onClick={handleNext}
        disabled={currentIndex >= searchResults.length - 1}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 transition-colors bg-slate-900/50 hover:bg-slate-800 rounded-full border border-slate-700 backdrop-blur-md"
      >
        <ChevronRight size={32} />
      </button>

      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex w-full max-w-7xl h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-1 bg-black relative flex items-center justify-center group overflow-hidden">
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded border border-white/10 text-sm font-mono z-10 shadow-lg">
            Result {currentIndex + 1} of {searchResults.length}
          </div>
          <img
            src={getImageUrl(imagePath)}
            alt="Preview"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="w-[450px] bg-slate-950 flex flex-col shrink-0 border-l border-slate-800">
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
            <div>
              <div className="text-sm font-bold text-slate-200 truncate pr-4" title={previewResult.payload.video_id}>
                {previewResult.payload.video_id}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Frame: {previewResult.payload.frame_id}
                {previewResult.payload.timestamp && ` • ${previewResult.payload.timestamp}s`}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex border-b border-slate-800 bg-slate-900/50 px-2 pt-2 gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => tab.enabled && setActiveTab(tab.id)}
                  disabled={!tab.enabled}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                    !tab.enabled ? 'opacity-30 cursor-not-allowed border-transparent text-slate-500' :
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t'
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-t'
                  }`}
                >
                  <Icon size={14} />
                  {tab.id}
                </button>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {activeTab === 'Overview' && (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-3 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Final Score</div>
                    <div className="text-lg font-mono text-white">{previewResult.score.toFixed(4)}</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Image Path</div>
                    <div className="text-xs font-mono text-slate-300 truncate" title={imagePath}>{imagePath}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Extracted Context</div>
                  <div className="bg-slate-900 p-4 rounded border border-slate-800 text-sm text-slate-300 italic leading-relaxed">
                    {previewResult.payload.caption || 'No visual caption available for this frame.'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={handleAddToBuilder}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                  >
                    <Plus size={18} />
                    ADD TO BUILDER
                  </button>
                  <button
                    onClick={() => {
                      handleClose()
                      setPlayingVideo(previewResult)
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded flex items-center justify-center gap-2 transition-colors border border-slate-700"
                  >
                    <FileVideo size={18} />
                    WATCH VIDEO
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'Neighbors' && (
              <div className="text-sm text-slate-500 flex flex-col items-center justify-center h-40 gap-3">
                <Map size={24} className="text-slate-700" />
                <p>Temporal neighbors will appear here.</p>
              </div>
            )}

            {activeTab === 'Q&A Answer' && (
              <div className="text-sm text-slate-500 flex flex-col items-center justify-center h-40 gap-3">
                <MessageSquare size={24} className="text-slate-700" />
                <p>Q&A extraction tools coming soon.</p>
              </div>
            )}

            {activeTab === 'OCR' && (
              <div className="text-sm text-slate-400 flex flex-col gap-3">
                <Type size={24} className="text-slate-700" />
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">OCR</div>
                  <p>{previewResult.payload.ocr ? previewResult.payload.ocr : 'No OCR text detected.'}</p>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-bold mb-1">ASR</div>
                  <p>{previewResult.payload.asr ? previewResult.payload.asr : 'No ASR transcript.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
