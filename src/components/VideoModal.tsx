import { X } from 'lucide-react'
import { useEffect } from 'react'
import { getImageUrl } from '../utils/media'

type VideoModalProps = {
  isOpen: boolean
  onClose: () => void
  videoId: string
  timestamp: number
  result?: any
}

export default function VideoModal({
  isOpen,
  onClose,
  videoId,
  timestamp,
  result,
}: VideoModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const keyframeId = result?.keyframe_id ?? result?.payload?.keyframe_id
  const frameId = result?.frame_id ?? result?.payload?.frame_id
  const imagePath = result?.image_path ?? result?.payload?.img_link

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-xl font-bold text-white">{videoId}</div>
            <div className="text-sm text-slate-400">
              Frame: {frameId ?? 'N/A'} · Keyframe: {keyframeId ?? 'N/A'} · Time:{' '}
              {Number(timestamp || 0).toFixed(2)}s
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-red-600 hover:text-white"
            title="Close video"
          >
            <X size={24} />
          </button>
        </div>

        <div className="bg-black p-4 flex justify-center items-center">
          {imagePath ? (
            <img
              src={getImageUrl(imagePath)}
              alt="Video placeholder"
              className="max-h-[70vh] w-full object-contain rounded-xl bg-black"
            />
          ) : (
            <div className="h-[420px] w-full flex items-center justify-center text-slate-500">
              Video preview will be connected after backend is ready.
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          Prototype mode: this modal currently shows the keyframe image. Later replace with /api/media/video/{videoId}.
        </div>
      </div>
    </div>
  )
}
