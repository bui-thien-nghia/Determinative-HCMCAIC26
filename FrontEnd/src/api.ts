import type { CollectionSchema, SearchResult } from './store'
import type { BackendSearchFilters } from './utils/searchFilters'
import type { PackageQuery, TeamSubmissionPackage } from './utils/submission'

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
export type SearchModality = 'visual' | 'textual' | 'hybrid'

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

export type TeamRoomMember = {
  clientId: string
  displayName: string
  activeQueryNumber: number | null
}

export type TeamRoomSnapshot = {
  changed?: boolean
  roomCode?: string
  revision: number
  configRevision?: number
  queryRevisions?: Record<string, number>
  package?: Omit<TeamSubmissionPackage, 'activeQueryId'> & { activeQueryId?: never }
  members?: TeamRoomMember[]
}

export type TeamRoomConflictPayload = {
  code: 'QUERY_CONFLICT' | 'CONFIG_CONFLICT'
  message: string
  roomRevision?: number
  queryRevision?: number
  latestQuery?: PackageQuery
  revision?: number
  configRevision?: number
  queryRevisions?: Record<string, number>
  package?: TeamRoomSnapshot['package']
  members?: TeamRoomMember[]
}

export class TeamRoomRequestError extends Error {
  statusCode: number
  payload?: Record<string, unknown>

  constructor(message: string, statusCode: number, payload?: Record<string, unknown>) {
    super(message)
    this.name = 'TeamRoomRequestError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

type DatasetOption = {
  id: string
  name: string
}

const ACTIVE_COLLECTION = 'aic2026_v2'
const TEAM_ROOM_API_PREFIX = '/__team_room_api__'

export function getSearchModalityRequestFields(_modality: SearchModality): Record<string, never> {
  // BACKEND_INTEGRATION_SEARCH_MODALITY: when the backend supports search modality,
  // return the agreed request field(s) here. Until then, keep requests unchanged.
  return {}
}

async function readTeamRoomJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => undefined) as (Record<string, unknown> & { message?: string; error?: string }) | undefined
  if (!response.ok) {
    const message = response.status === 404
      ? 'Room not found.'
      : response.status >= 500
        ? 'Shared Room server returned an unexpected error.'
        : data?.message || data?.error || `HTTP error! status: ${response.status}`
    throw new TeamRoomRequestError(
      message,
      response.status,
      data,
    )
  }
  if (!data) throw new TeamRoomRequestError('Room response was empty.', response.status)
  return data as T
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => undefined) as { error?: string } | undefined
    throw new Error(data?.error || `HTTP error! status: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function teamRoomApiPath(path: string) {
  return `${TEAM_ROOM_API_PREFIX}${path}`
}

async function fetchTeamRoom(path: string, init?: RequestInit) {
  try {
    return await fetch(teamRoomApiPath(path), init)
  } catch (error) {
    throw new TeamRoomRequestError(
      'Could not reach Shared Room server.',
      0,
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
}

export const api = {
  getModels: async () => [
    { id: 'siglip2', name: 'SigLIP2' },
  ],

  getDatasets: async (): Promise<DatasetOption[]> => {
    const collections = await api.getCollections()
    return collections.map((name) => ({ id: name, name }))
  },

  search: async (
    query: string,
    collection: string,
    modelId: string,
    topK: number,
    filters?: BackendSearchFilters,
    searchModality: SearchModality = 'hybrid',
  ): Promise<SearchResult[]> => {
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
        ...getSearchModalityRequestFields(searchModality),
      }),
    })

    const data = await readJson<SearchApiResponse>(response)
    return Array.isArray(data.results) ? data.results : []
  },

  aggregatedSearch: async(
    query: string,
    collection: string,
    modelId: string,
    topK: number,
    filters?: BackendSearchFilters,
    searchModality: SearchModality = 'hybrid',
  ): Promise<SearchResult[]> => {
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
        filters: filters,
        ...getSearchModalityRequestFields(searchModality),
      }),
    })

    const data = await readJson<SearchApiResponse>(response)
    return Array.isArray(data.results) ? data.results : []
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

  filterSearch: async (collection: string, filters: BackendSearchFilters, topK: number): Promise<SearchResult[]> => {
    const response = await fetch('/api/filter/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection: collection,
        filters: filters,
        top_k: topK,
      }),
    })

    const data = await readJson<SearchApiResponse>(response)
    return Array.isArray(data.results) ? data.results : []
  },

  doFilter: async (collection: string, key: string, value: string) => {
    const response = await fetch('/api/filter/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection: collection,
        key: key,
        value: value,
      }),
    })

    const data = await readJson<SearchApiResponse>(response)
    return Array.isArray(data.results) ? data.results : []
  },

  createTeamRoom: async (displayName: string, teamPackage: TeamSubmissionPackage): Promise<TeamRoomSnapshot> => {
    const { activeQueryId: _localActiveQueryId, ...sharedPackage } = teamPackage
    const response = await fetchTeamRoom('/api/team-room/create/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, package: sharedPackage }),
    })
    return readTeamRoomJson<TeamRoomSnapshot>(response)
  },

  getTeamRoom: async (roomCode: string, sinceRevision?: number): Promise<TeamRoomSnapshot> => {
    const suffix = sinceRevision == null ? '' : `?since_revision=${encodeURIComponent(sinceRevision)}`
    const response = await fetchTeamRoom(`/api/team-room/${encodeURIComponent(roomCode)}/${suffix}`, { method: 'GET' })
    return readTeamRoomJson<TeamRoomSnapshot>(response)
  },

  updateTeamRoomQuery: async (
    roomCode: string,
    queryNumber: number,
    baseQueryRevision: number,
    query: PackageQuery,
  ): Promise<{ ok: true; revision: number; queryRevision: number; query: PackageQuery }> => {
    const response = await fetchTeamRoom(`/api/team-room/${encodeURIComponent(roomCode)}/query/${queryNumber}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseQueryRevision, query }),
    })
    return readTeamRoomJson(response)
  },

  updateTeamRoomConfig: async (
    roomCode: string,
    baseRevision: number,
    baseConfigRevision: number,
    teamPackage: TeamSubmissionPackage,
  ): Promise<TeamRoomSnapshot & { ok: true }> => {
    const { activeQueryId: _localActiveQueryId, ...sharedPackage } = teamPackage
    const response = await fetchTeamRoom(`/api/team-room/${encodeURIComponent(roomCode)}/config/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision, baseConfigRevision, package: sharedPackage }),
    })
    return readTeamRoomJson(response)
  },

  heartbeatTeamRoom: async (
    roomCode: string,
    clientId: string,
    displayName: string,
    activeQueryNumber: number | null,
  ): Promise<{ ok: true; members: TeamRoomMember[] }> => {
    const response = await fetchTeamRoom(`/api/team-room/${encodeURIComponent(roomCode)}/heartbeat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, displayName, activeQueryNumber }),
    })
    return readTeamRoomJson(response)
  },

  getRecheck: async () => [],
  addRecheck: async (item: unknown) => ({ ok: true, item }),
  removeRecheck: async (id: string) => ({ ok: true, id }),
}
