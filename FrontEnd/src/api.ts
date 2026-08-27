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

export type DatasetConfigStatus = 'ready' | 'path_not_found' | 'no_permission' | 'images_missing' | 'videos_missing' | 'partial'

export interface DatasetConfigResponse {
  status: DatasetConfigStatus
  imagesAvailable: boolean
  videosAvailable: boolean
  canChangeDatasetRoot: boolean
  datasetRoot: string
  message?: string
  error?: string
  attemptedDatasetRoot?: string
  cancelled?: boolean
  version?: number
  videoCount?: number
}

export class DatasetConfigRequestError extends Error {
  statusCode: number
  config?: DatasetConfigResponse

  constructor(message: string, statusCode: number, config?: DatasetConfigResponse) {
    super(message)
    this.name = 'DatasetConfigRequestError'
    this.statusCode = statusCode
    this.config = config
  }
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

  search: async (query: string, collection: string, modelId: string, topK: number, filters: any): Promise<SearchResult[]> => {
    try {
      const response = await fetch('/api/search/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          collection: collection,
          model_id: modelId,
          top_k: topK,
          filters: filters,
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

  continuousSearch: async (collection: string, video_id: string, frame_id: string): Promise<SearchResult[]> => {
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

    const data = await response.json().catch(() => undefined) as (SearchApiResponse & { error?: string }) | undefined
    if (!response.ok) {
      throw new Error(data?.error || `HTTP error! status: ${response.status}`)
    }

    return Array.isArray(data?.results) ? data.results : []
  },

  getCollections: async (): Promise<string[]> => {
    const response = await fetch('/api/collections/', {
      method: 'GET',
    })

    const data = await readJson<CollectionsApiResponse>(response)
    return Array.isArray(data.collections)
      ? data.collections
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

  getDatasetConfig: async (): Promise<DatasetConfigResponse> => {
    const response = await fetch('/__aic_config__', {
      method: 'GET',
    })

    return readJson<DatasetConfigResponse>(response)
  },

  setDatasetRoot: async (datasetRoot: string): Promise<DatasetConfigResponse> => {
    const response = await fetch('/__aic_config__/dataset-root', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ datasetRoot }),
    })

    const data = await response.json().catch(() => undefined) as DatasetConfigResponse | undefined
    if (!response.ok) {
      throw new DatasetConfigRequestError(
        data?.error || data?.message || `HTTP error! status: ${response.status}`,
        response.status,
        data,
      )
    }

    if (!data) {
      throw new DatasetConfigRequestError('Dataset config response was empty.', response.status)
    }

    return data
  },

  chooseDatasetRoot: async (): Promise<DatasetConfigResponse> => {
    const response = await fetch('/__aic_config__/choose-dataset-root', {
      method: 'POST',
    })

    const data = await response.json().catch(() => undefined) as DatasetConfigResponse | undefined
    if (!response.ok) {
      throw new DatasetConfigRequestError(
        data?.error || data?.message || `HTTP error! status: ${response.status}`,
        response.status,
        data,
      )
    }

    if (!data) {
      throw new DatasetConfigRequestError('Dataset chooser response was empty.', response.status)
    }

    return data
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
