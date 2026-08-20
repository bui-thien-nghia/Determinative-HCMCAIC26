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

  continuousSearch: async (imgLink: string, collection: string) => {
    try {
      const response = await fetch('/api/continuoussearch/', {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection: collection,
          frame_path: imgLink,
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
    return Array.isArray(data.collections) ? data.collections : []
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

  getRecheck: async () => [],
  addRecheck: async (item: unknown) => ({ ok: true, item }),
  removeRecheck: async (id: string) => ({ ok: true, id }),
}
