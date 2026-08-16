import { mockResults } from './data/mockResults'
import type { SearchResult } from './store'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase()
}

function localSearch(query: string, topK: number): SearchResult[] {
  const q = normalize(query)
  const words = q.split(/\s+/).filter(Boolean)

  const scored = mockResults.map((item) => {
    const text = normalize([
      item.payload.video_id,
      item.payload.frame_id,
      item.payload.caption,
      item.payload.ocr,
      item.payload.asr,
      item.payload.objects?.join(' '),
    ].join(' '))

    let bonus = 0
    for (const word of words) {
      if (text.includes(word)) bonus += 0.04
    }

    return {
      ...item,
      score: Math.min(0.99, item.score + bonus),
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(100, Math.max(1, topK || 20)))
}

export const api = {
  getModels: async () => [
    { id: 'siglip-so400m', name: 'SigLIP SO400M' },
    { id: 'clip-vit-b-32', name: 'CLIP ViT-B/32' },
  ],

  getDatasets: async () => [
    { id: 'AIC2026_SIGLIP', name: 'AIC2026_SIGLIP' },
    { id: 'AIC2026', name: 'AIC2026' },
  ],

  search: async (query: string, collection: string, modelId: string, topK: number) => {
    try {
      const response = await fetch('/api/search/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          mode: 'AUTO',
          collection: collection,
          model_id: modelId,
          top_k: topK,
          language: 'AUTO',
          filters: {},
        }),
      });

      if (!response.ok){
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.results;
    } catch (error){
      console.error("Error: ", error);
      return [];
    }
  },

  aggregatedSearch: async(query: string, collection: string, modelId: string, topK: number) => {
    try {
      const response = await fetch('/api/aggregatedsearch/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          mode: 'AUTO',
          collection: collection,
          model_id: modelId,
          top_k: topK,
          language: 'AUTO',
          filters: {},
        }),
      });

      if (!response.ok){
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.results;
    } catch (error){
      console.error("Error: ", error);
      return [];
    }
  },

  continuousSearch: async (_imgLink: string, _collection: string, _modelId: string) => {
    await sleep(250)
    return { results: mockResults.slice(0, 6) }
  },

  getRecheck: async () => [],
  addRecheck: async (item: unknown) => ({ ok: true, item }),
  removeRecheck: async (id: string) => ({ ok: true, id }),
}
