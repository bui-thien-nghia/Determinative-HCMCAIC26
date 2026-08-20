import type { CollectionSchema, SearchResult } from './store'

interface SearchApiResponse {
  results: SearchResult[]
}

interface CollectionsApiResponse {
  collections: string[]
}

interface DescribeSchemaApiResponse {
  schema: CollectionSchema
}

type DatasetOption = {
  id: string
  name: string
}

const ACTIVE_COLLECTION = 'aic2026_v2'

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  getModels: async () => [
    { id: 'siglip2', name: 'SigLIP2' },
  ],

  getDatasets: async (): Promise<DatasetOption[]> => {
    const collections = await api.getCollections()
    return collections.map((name) => ({ id: name, name }))
  },

  search: async (query: string, collection: string, modelId: string, topK: number): Promise<SearchResult[]> => {
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
        }),
      })

      const data = await readJson<SearchApiResponse>(response)
      return Array.isArray(data.results) ? data.results : []
    } catch (error){
      console.error("Error: ", error)
      return []
    }
  },

  aggregatedSearch: async(query: string, collection: string, modelId: string, topK: number): Promise<SearchResult[]> => {
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
        }),
      })

      const data = await readJson<SearchApiResponse>(response)
      return Array.isArray(data.results) ? data.results : []
    } catch (error){
      console.error("Error: ", error)
      return []
    }
  },

  continuousSearch: async (collection: string, video_id: string, frame_id: string) => {
    try {
      const response = await fetch('/api/continuoussearch/', {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection: collection,
          video_id: video_id,
          frame_id: frame_id,
        }),
      })

      const data = await readJson<SearchApiResponse>(response)
      return Array.isArray(data.results) ? data.results : []
    } catch (error){
      console.error("Error: ", error)
      return []
    }
  },

  getCollections: async (): Promise<string[]> => {
    const response = await fetch('/api/collections/', {
      method: 'GET',
    })

    const data = await readJson<CollectionsApiResponse>(response)
    return Array.isArray(data.collections)
      ? data.collections.filter((collection) => collection === ACTIVE_COLLECTION)
      : []
  },

  describeSchema: async (collection: string): Promise<CollectionSchema> => {
    const response = await fetch('/api/describeschema/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection: collection,
      }),
    })

    const data = await readJson<DescribeSchemaApiResponse>(response)
    return data.schema ?? {}
  },

  doFilter: async (collection: string, key: string, value: string) => {
    try {
      const response = await fetch ('/api/filter/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection: collection,
          key: key,
          value: value,
        }),
      });

      if (!response.ok){
        throw new Error(`HTTP errot! status: ${response.status}`);
      }

      const data = await response.json();
      return data.results;
    } catch (error){
      console.error("Error: ", error);
      return [];
    }
  },

  getRecheck: async () => [],
  addRecheck: async (item: unknown) => ({ ok: true, item }),
  removeRecheck: async (id: string) => ({ ok: true, id }),
}
