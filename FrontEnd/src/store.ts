import { create } from 'zustand'

export interface SearchResult {
  id: string
  score: number
  image_path?: string
  video_id?: string
  timestamp?: number
  payload: {
    video_id: string
    frame_id: string | number
    img_link?: string
    timestamp?: number
    caption?: string
    ocr?: string
    asr?: string
    objects?: string[]
    people_count?: number
    keyframe_id?: string | number
    [key: string]: unknown
  }
}

export interface RecheckItem {
  id: string
  img_link: string
  payload: SearchResult['payload']
  addedAt: number
  answerType: 'KIS' | 'QA' | 'TRAKE'
  answer?: string
}

export interface TrakeEvent {
  id: string
  order: number
  label: string
  description?: string
  selectedCandidate?: RecheckItem
}

export interface TrakeState {
  selectedVideoId: string | null
  stage: 1 | 2
  activeEventId: string | null
  events: TrakeEvent[]
}

export interface SearchHistoryItem {
  query: string
  mode: string
  language: string
  top_k: number
  collection: string | null
  model_id: string | null
  results: SearchResult[]
  timestamp: number
}

export interface Toast {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
}
export interface SearchStatus {
  state: 'idle' | 'searching' | 'success' | 'error'
  latency: number | null
}


interface AppState {
  currentDataset: string | null
  currentModel: string | null
  searchResults: SearchResult[]
  recheckList: RecheckItem[]
  trakeState: TrakeState
  searchHistory: SearchHistoryItem[]
  toasts: Toast[]
  searchStatus: SearchStatus

  columns: number
  topK: number
  language: string
  mode: string
  lastSearch: {
    query: string
    collection: string
    model_id: string
    top_k: number
    mode?: string
    language?: string
  } | null
  previewResult: SearchResult | null
  playingVideo: SearchResult | null

  isLoading: boolean
  error: string | null
  displayMode: 'fast' | 'full'

  setDataset: (dataset: string) => void
  setModel: (model: string) => void
  setSearchResults: (results: SearchResult[]) => void
  setRecheckList: (list: RecheckItem[]) => void
  addToSearchHistory: (item: SearchHistoryItem) => void
  removeSearchHistory: (index: number) => void
  clearSearchHistory: () => void

  setColumns: (cols: number) => void
  setTopK: (k: number) => void
  setLanguage: (lang: string) => void
  setMode: (mode: string) => void
  setLastSearch: (lastSearch: AppState['lastSearch']) => void
  setPreviewResult: (res: SearchResult | null) => void
  setPlayingVideo: (video: SearchResult | null) => void
  setIsLoading: (loading: boolean) => void
  setError: (err: string | null) => void
  setDisplayMode: (mode: 'fast' | 'full') => void
  setSearchStatus: (status: SearchStatus) => void

  addToRecheckList: (item: Omit<RecheckItem, 'addedAt'>) => void
  removeFromRecheckList: (id: string) => void
  clearRecheckList: () => void
  moveRecheckItem: (id: string, direction: 'up' | 'down') => void
  reorderRecheckItem: (fromIdx: number, toIdx: number) => void
  updateRecheckItemAnswer: (id: string, answer: string) => void
  
  addCandidate: (result: SearchResult) => void
  
  setTrakeSelectedVideo: (videoId: string | null) => void
  setTrakeStage: (stage: 1 | 2) => void
  setTrakeActiveEvent: (eventId: string | null) => void
  setTrakeEventCandidate: (eventId: string, candidate: RecheckItem | undefined) => void
  clearTrakeEvent: (eventId: string) => void
  clearAllTrakeEvents: () => void
  addTrakeEvent: () => void
  removeTrakeEvent: (eventId: string) => void

  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

const loadHistory = (): SearchHistoryItem[] => {
  try {
    const data = localStorage.getItem('aic_history')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const useStore = create<AppState>((set) => ({
  currentDataset: 'AIC2026_SIGLIP',
  currentModel: 'siglip-so400m',
  searchResults: [],
  recheckList: [],
  trakeState: {
    selectedVideoId: null,
    stage: 1 as const,
    activeEventId: null,
    events: []
  },
  searchHistory: loadHistory(),
  toasts: [],
  searchStatus: { state: 'idle', latency: null },

  columns: 4,
  topK: 100,
  language: 'AUTO',
  mode: 'KIS',
  lastSearch: null,
  previewResult: null,
  playingVideo: null,

  isLoading: false,
  error: null,
  displayMode: 'fast',

  setDataset: (dataset) => set({ currentDataset: dataset }),
  setModel: (model) => set({ currentModel: model }),
  setSearchResults: (results) => set({ searchResults: results }),
  setRecheckList: (list) => set({ recheckList: list }),
  setSearchStatus: (status) => set({ searchStatus: status }),

  addToSearchHistory: (item) => set((state) => {
    if (state.searchHistory.length > 0 && state.searchHistory[0].query === item.query && state.searchHistory[0].mode === item.mode) {
      return state
    }
    const newHistory = [item, ...state.searchHistory].slice(0, 20)
    localStorage.setItem('aic_history', JSON.stringify(newHistory))
    return { searchHistory: newHistory }
  }),

  removeSearchHistory: (index) => set((state) => {
    const newHistory = [...state.searchHistory]
    newHistory.splice(index, 1)
    localStorage.setItem('aic_history', JSON.stringify(newHistory))
    return { searchHistory: newHistory }
  }),

  clearSearchHistory: () => {
    localStorage.removeItem('aic_history')
    set({ searchHistory: [] })
  },

  setColumns: (cols) => set({ columns: cols }),
  setTopK: (k) => set({ topK: k }),
  setLanguage: (lang) => set({ language: lang }),
  setMode: (mode) => set({ mode }),
  setLastSearch: (lastSearch) => set({ lastSearch }),
  setPreviewResult: (res) => set({ previewResult: res }),
  setPlayingVideo: (video) => set({ playingVideo: video }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (err) => set({ error: err }),
  setDisplayMode: (displayMode) => set({ displayMode }),

  addToRecheckList: (item) => set((state) => {
    if (state.recheckList.length >= 100) return state
    if (state.recheckList.some((x) => x.id === item.id)) return state
    return {
      recheckList: [...state.recheckList, { ...item, addedAt: Date.now() }]
    }
  }),

  removeFromRecheckList: (id) => set((state) => ({
    recheckList: state.recheckList.filter(item => item.id !== id)
  })),

  clearRecheckList: () => set({ recheckList: [] }),

  updateRecheckItemAnswer: (id, answer) => set((state) => ({
    recheckList: state.recheckList.map(item => item.id === id ? { ...item, answer } : item)
  })),

  moveRecheckItem: (id, direction) => set((state) => {
    const idx = state.recheckList.findIndex(item => item.id === id)
    if (idx < 0) return state
    if (direction === 'up' && idx > 0) {
      const newList = [...state.recheckList]
      ;[newList[idx - 1], newList[idx]] = [newList[idx], newList[idx - 1]]
      return { recheckList: newList }
    }
    if (direction === 'down' && idx < state.recheckList.length - 1) {
      const newList = [...state.recheckList]
      ;[newList[idx + 1], newList[idx]] = [newList[idx], newList[idx + 1]]
      return { recheckList: newList }
    }
    return state
  }),

  reorderRecheckItem: (fromIdx, toIdx) => set((state) => {
    if (fromIdx < 0 || fromIdx >= state.recheckList.length) return state
    if (toIdx < 0 || toIdx >= state.recheckList.length) return state
    if (fromIdx === toIdx) return state
    
    const newList = [...state.recheckList]
    const [moved] = newList.splice(fromIdx, 1)
    newList.splice(toIdx, 0, moved)
    
    return { recheckList: newList }
  }),

  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2, 11)
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, 3000)
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  setTrakeSelectedVideo: (videoId) => set((state) => ({
    trakeState: { ...state.trakeState, selectedVideoId: videoId }
  })),

  setTrakeStage: (stage) => set((state) => ({
    trakeState: { ...state.trakeState, stage }
  })),

  setTrakeActiveEvent: (eventId) => set((state) => ({
    trakeState: { ...state.trakeState, activeEventId: eventId }
  })),

  setTrakeEventCandidate: (eventId, candidate) => set((state) => {
    const newEvents = state.trakeState.events.map(evt => 
      evt.id === eventId ? { ...evt, selectedCandidate: candidate } : evt
    )
    return {
      trakeState: { ...state.trakeState, events: newEvents }
    }
  }),

  clearTrakeEvent: (eventId) => set((state) => {
    const newEvents = state.trakeState.events.map(evt => 
      evt.id === eventId ? { ...evt, selectedCandidate: undefined } : evt
    )
    return {
      trakeState: { ...state.trakeState, events: newEvents }
    }
  }),
  
  clearAllTrakeEvents: () => set((state) => ({
    trakeState: {
      selectedVideoId: null,
      stage: 1 as const,
      activeEventId: null,
      events: state.trakeState.events.map(evt => ({ ...evt, selectedCandidate: undefined }))
    }
  })),

  addTrakeEvent: () => set((state) => {
    const n = state.trakeState.events.length + 1
    const newId = `evt-${Date.now()}`
    return {
      trakeState: {
        ...state.trakeState,
        events: [...state.trakeState.events, { id: newId, order: n, label: `Event ${n}` }]
      }
    }
  }),

  removeTrakeEvent: (eventId) => set((state) => {
    const newEvents = state.trakeState.events
      .filter(e => e.id !== eventId)
      .map((e, i) => ({ ...e, order: i + 1, label: `Event ${i + 1}` }))
    return {
      trakeState: {
        ...state.trakeState,
        activeEventId: state.trakeState.activeEventId === eventId ? null : state.trakeState.activeEventId,
        events: newEvents
      }
    }
  }),

  addCandidate: (result) => set((state) => {
    const mode = state.mode
    const item = {
      id: result.id || `${result.payload?.video_id}_${result.payload?.frame_id}_${Date.now()}`,
      img_link: result.image_path || result.payload?.img_link || '',
      payload: result.payload,
      answerType: mode as any,
      addedAt: Date.now(),
      answer: ''
    }

    if (mode === 'KIS' || mode === 'QA') {
      if (state.recheckList.length >= 100) {
        state.addToast('Maximum 100 candidates allowed', 'error')
        return state
      }
      if (state.recheckList.some((x) => x.id === item.id)) {
        state.addToast('Candidate already added', 'error')
        return state
      }
      
      if (mode === 'QA') {
        state.addToast('Added. Answer required.', 'info')
      } else {
        state.addToast('Added candidate via click', 'success')
      }
      
      return {
        recheckList: [...state.recheckList, item]
      }
    } else if (mode === 'TRAKE') {
      const { stage, selectedVideoId, activeEventId, events } = state.trakeState
      const newVideoId = result.payload.video_id

      // ── STAGE 1: video selection ────────────────────────────
      if (stage === 1) {
        // Just set the selected video; do NOT assign to any event yet
        state.addToast(`Video selected: ${newVideoId}`, 'success')
        return {
          trakeState: { ...state.trakeState, selectedVideoId: newVideoId }
        }
      }

      // ── STAGE 2: frame assignment ───────────────────────────
      if (selectedVideoId && selectedVideoId !== newVideoId) {
        state.addToast(
          `Frame belongs to ${newVideoId} — TRAKE is locked to ${selectedVideoId}`,
          'error'
        )
        return state
      }

      if (events.length === 0) {
        state.addToast('Add at least one event first', 'error')
        return state
      }

      // Determine target event: active or first empty
      const targetIdx = activeEventId
        ? events.findIndex(e => e.id === activeEventId)
        : events.findIndex(e => !e.selectedCandidate)

      if (targetIdx === -1) {
        state.addToast('All TRAKE events are full', 'error')
        return state
      }

      const newEvents = [...events]
      newEvents[targetIdx] = { ...newEvents[targetIdx], selectedCandidate: item }

      // Auto-advance active event to next empty slot
      const nextEmptyIdx = newEvents.findIndex((e, i) => i > targetIdx && !e.selectedCandidate)
      const nextActiveId = nextEmptyIdx !== -1 ? newEvents[nextEmptyIdx].id : null

      state.addToast(`Assigned to ${newEvents[targetIdx].label}`, 'success')

      return {
        trakeState: {
          ...state.trakeState,
          selectedVideoId: selectedVideoId || newVideoId,
          activeEventId: nextActiveId,
          events: newEvents
        }
      }
    }
    return state
  })
}))
