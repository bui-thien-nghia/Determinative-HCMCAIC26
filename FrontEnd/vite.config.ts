import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const configuredAicRoot = process.env.AIC_DATASET_ROOT?.trim()
const initialAicMediaRoot = configuredAicRoot
  ? path.resolve(path.isAbsolute(configuredAicRoot) ? configuredAicRoot : path.join(repoRoot, configuredAicRoot))
  : path.resolve(repoRoot, 'AIC26')
const mediaPrefix = '/__aic_media__/'
const videoPrefix = '/__aic_video__/'
const neighborsPrefix = '/__aic_neighbors__/'
const configPath = '/__aic_config__'
const configDatasetRootPath = '/__aic_config__/dataset-root'
const configChooseDatasetRootPath = '/__aic_config__/choose-dataset-root'
const safeIdPattern = /^[A-Za-z0-9_-]+$/
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv'])

type DatasetStatus = 'ready' | 'path_not_found' | 'no_permission' | 'images_missing' | 'videos_missing' | 'partial'

interface DatasetValidation {
  status: DatasetStatus
  datasetRoot: string
  imagesAvailable: boolean
  videosAvailable: boolean
  message: string
}

interface MediaState {
  datasetRoot: string
  datasetRealRoot: string | null
  videoIndex: Map<string, string>
  version: number
}

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
}

function normalizeForCompare(value: string) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isInsidePath(root: string, target: string) {
  const relative = path.relative(root, target)
  const normalizedRelative = normalizeForCompare(relative)
  return (
    normalizedRelative === '' ||
    (!normalizedRelative.startsWith('..') && !path.isAbsolute(relative))
  )
}

function safeRealpath(target: string) {
  try {
    return fs.realpathSync.native(target)
  } catch {
    return null
  }
}

function resolveDatasetRoot(input: string) {
  const trimmed = input.trim()
  return path.resolve(path.isAbsolute(trimmed) ? trimmed : path.join(repoRoot, trimmed))
}

function isInsideAic(target: string) {
  const resolvedTarget = path.resolve(target)
  if (!isInsidePath(mediaState.datasetRoot, resolvedTarget)) return false

  const resolvedRealTarget = safeRealpath(resolvedTarget)
  if (mediaState.datasetRealRoot && resolvedRealTarget) {
    return isInsidePath(mediaState.datasetRealRoot, resolvedRealTarget)
  }

  return true
}

function sendText(res: ServerResponse, statusCode: number, message: string) {
  res.statusCode = statusCode
  res.end(message)
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function streamFile(req, res: ServerResponse, target: string) {
  const stat = fs.statSync(target)
  const contentType = contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range

  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', contentType)

  if (!range) {
    res.statusCode = 200
    res.setHeader('Content-Length', stat.size)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(target).pipe(res)
    return
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) {
    res.statusCode = 416
    res.setHeader('Content-Range', `bytes */${stat.size}`)
    res.end()
    return
  }

  const [, startText, endText] = match
  let start = startText ? Number(startText) : 0
  let end = endText ? Number(endText) : stat.size - 1

  if (!startText && endText) {
    const suffixLength = Number(endText)
    start = Math.max(stat.size - suffixLength, 0)
    end = stat.size - 1
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= stat.size
  ) {
    res.statusCode = 416
    res.setHeader('Content-Range', `bytes */${stat.size}`)
    res.end()
    return
  }

  end = Math.min(end, stat.size - 1)
  res.statusCode = 206
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  res.setHeader('Content-Length', end - start + 1)

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  fs.createReadStream(target, { start, end }).pipe(res)
}

function discoverVideos(datasetRoot = mediaState.datasetRoot) {
  const index = new Map<string, string>()
  const ambiguous = new Set<string>()

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }

      if (!entry.isFile() || !videoExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue
      }

      const videoId = path.parse(entry.name).name
      if (!safeIdPattern.test(videoId) || !isInsidePath(datasetRoot, path.resolve(absolute))) {
        continue
      }

      if (index.has(videoId)) {
        index.delete(videoId)
        ambiguous.add(videoId)
        continue
      }

      if (!ambiguous.has(videoId)) {
        index.set(videoId, absolute)
      }
    }
  }

  walk(path.join(datasetRoot, 'vids'))
  return index
}

function naturalFrameSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function parseMapRows(videoId: string) {
  const mapPath = path.resolve(mediaState.datasetRoot, 'maps', `${videoId}.csv`)
  if (!isInsideAic(mapPath) || !fs.existsSync(mapPath)) return []

  const lines = fs.readFileSync(mapPath, 'utf8').split(/\r?\n/).filter(Boolean)
  const header = lines.shift()?.split(',').map((name) => name.trim()) || []

  return lines.map((line) => {
    const values = line.split(',')
    return header.reduce<Record<string, number | null>>((row, key, index) => {
      const value = Number(values[index])
      row[key] = Number.isFinite(value) ? value : null
      return row
    }, {})
  })
}

function readableDirectory(target: string) {
  try {
    if (!fs.existsSync(target)) return { exists: false, readable: false }
    const stat = fs.statSync(target)
    if (!stat.isDirectory()) return { exists: false, readable: false }
    fs.accessSync(target, fs.constants.R_OK)
    return { exists: true, readable: true }
  } catch {
    return { exists: true, readable: false }
  }
}

function validateDatasetRoot(datasetRoot: string): DatasetValidation {
  const resolvedRoot = resolveDatasetRoot(datasetRoot)

  let rootStat: fs.Stats
  try {
    rootStat = fs.statSync(resolvedRoot)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    return {
      status: code === 'EACCES' || code === 'EPERM' ? 'no_permission' : 'path_not_found',
      datasetRoot: resolvedRoot,
      imagesAvailable: false,
      videosAvailable: false,
      message: code === 'EACCES' || code === 'EPERM'
        ? 'Dataset folder is not readable.'
        : 'Dataset folder was not found.',
    }
  }

  if (!rootStat.isDirectory()) {
    return {
      status: 'path_not_found',
      datasetRoot: resolvedRoot,
      imagesAvailable: false,
      videosAvailable: false,
      message: 'Dataset path is not a directory.',
    }
  }

  try {
    fs.accessSync(resolvedRoot, fs.constants.R_OK)
  } catch {
    return {
      status: 'no_permission',
      datasetRoot: resolvedRoot,
      imagesAvailable: false,
      videosAvailable: false,
      message: 'Dataset folder is not readable.',
    }
  }

  const images = readableDirectory(path.join(resolvedRoot, 'imgs'))
  const videos = readableDirectory(path.join(resolvedRoot, 'vids'))

  if ((!images.readable && images.exists) || (!videos.readable && videos.exists)) {
    return {
      status: 'no_permission',
      datasetRoot: resolvedRoot,
      imagesAvailable: images.readable,
      videosAvailable: videos.readable,
      message: 'One or more media folders are not readable.',
    }
  }

  if (images.readable && videos.readable) {
    return {
      status: 'ready',
      datasetRoot: resolvedRoot,
      imagesAvailable: true,
      videosAvailable: true,
      message: 'Dataset media folders are ready.',
    }
  }

  if (!images.readable && videos.readable) {
    return {
      status: 'images_missing',
      datasetRoot: resolvedRoot,
      imagesAvailable: false,
      videosAvailable: true,
      message: 'Dataset imgs/ folder is missing.',
    }
  }

  if (images.readable && !videos.readable) {
    return {
      status: 'videos_missing',
      datasetRoot: resolvedRoot,
      imagesAvailable: true,
      videosAvailable: false,
      message: 'Dataset vids/ folder is missing.',
    }
  }

  return {
    status: 'partial',
    datasetRoot: resolvedRoot,
    imagesAvailable: false,
    videosAvailable: false,
    message: 'Dataset imgs/ and vids/ folders are missing.',
  }
}

function isLoopbackAddress(remoteAddress?: string) {
  if (!remoteAddress) return false
  if (remoteAddress === '::1') return true
  if (remoteAddress.startsWith('127.')) return true

  const mappedPrefix = '::ffff:'
  if (remoteAddress.toLowerCase().startsWith(mappedPrefix)) {
    const ipv4 = remoteAddress.slice(mappedPrefix.length)
    return ipv4.startsWith('127.')
  }

  return false
}

function datasetConfigPayload(req: IncomingMessage) {
  const validation = validateDatasetRoot(mediaState.datasetRoot)
  return {
    status: validation.status,
    imagesAvailable: validation.imagesAvailable,
    videosAvailable: validation.videosAvailable,
    canChangeDatasetRoot: isLoopbackAddress(req.socket.remoteAddress),
    datasetRoot: mediaState.datasetRoot,
    message: validation.message,
    version: mediaState.version,
    videoCount: mediaState.videoIndex.size,
  }
}

function applyDatasetRoot(req: IncomingMessage, res: ServerResponse, requestedRoot: string, extraPayload: Record<string, unknown> = {}) {
  const validation = validateDatasetRoot(requestedRoot)
  if (validation.status !== 'ready') {
    sendJson(res, 400, {
      ...extraPayload,
      error: validation.message,
      attemptedDatasetRoot: validation.datasetRoot,
      status: validation.status,
      imagesAvailable: validation.imagesAvailable,
      videosAvailable: validation.videosAvailable,
      canChangeDatasetRoot: true,
      datasetRoot: mediaState.datasetRoot,
      message: validation.message,
      version: mediaState.version,
      videoCount: mediaState.videoIndex.size,
    })
    return
  }

  const nextVideoIndex = discoverVideos(validation.datasetRoot)
  mediaState.datasetRoot = validation.datasetRoot
  mediaState.datasetRealRoot = safeRealpath(validation.datasetRoot)
  mediaState.videoIndex = nextVideoIndex
  mediaState.version += 1

  sendJson(res, 200, {
    ...extraPayload,
    ...datasetConfigPayload(req),
  })
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 4096) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })

    req.on('error', reject)
  })
}

function normalizeChosenDatasetRoot(chosenPath: string) {
  const trimmed = chosenPath.trim()
  if (!trimmed) return ''
  return path.resolve(trimmed)
}

function chooseDatasetRootMac() {
  return new Promise<{ cancelled: boolean; datasetRoot?: string }>((resolve, reject) => {
    execFile(
      'osascript',
      [
        '-e',
        'set chosenFolder to choose folder with prompt "Select Dataset Folder"',
        '-e',
        'POSIX path of chosenFolder',
      ],
      { timeout: 120000 },
      (error, stdout, stderr) => {
        if (error) {
          const message = `${stderr || error.message || ''}`.toLowerCase()
          if (message.includes('user canceled') || message.includes('cancelled')) {
            resolve({ cancelled: true })
            return
          }
          reject(new Error(stderr.trim() || error.message))
          return
        }

        const datasetRoot = normalizeChosenDatasetRoot(stdout)
        resolve(datasetRoot ? { cancelled: false, datasetRoot } : { cancelled: true })
      },
    )
  })
}

function chooseDatasetRootWindows() {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.Description = "Select Dataset Folder"',
    '$dialog.ShowNewFolderButton = $false',
    '$result = $dialog.ShowDialog()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath); exit 0 }',
    'exit 2',
  ].join('; ')

  return new Promise<{ cancelled: boolean; datasetRoot?: string }>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      { timeout: 120000 },
      (error, stdout, stderr) => {
        if (error) {
          if ('code' in error && error.code === 2) {
            resolve({ cancelled: true })
            return
          }
          reject(new Error(stderr.trim() || error.message))
          return
        }

        const datasetRoot = normalizeChosenDatasetRoot(stdout)
        resolve(datasetRoot ? { cancelled: false, datasetRoot } : { cancelled: true })
      },
    )
  })
}

function chooseDatasetRootOnHost() {
  if (process.platform === 'darwin') return chooseDatasetRootMac()
  if (process.platform === 'win32') return chooseDatasetRootWindows()
  return Promise.reject(new Error('Native dataset folder chooser is only supported on macOS and Windows.'))
}

const mediaState: MediaState = {
  datasetRoot: initialAicMediaRoot,
  datasetRealRoot: safeRealpath(initialAicMediaRoot),
  videoIndex: new Map(),
  version: 1,
}

function frameFromFile(videoId: string, fileName: string, index: number, mapRows: Record<string, number | null>[]) {
  const frameId = path.parse(fileName).name
  const imagePath = `imgs/${videoId}/${fileName}`
  const mapRow = mapRows[index]
  const timeOrder = mapRow?.time_order ?? null
  const timestamp = timeOrder

  return {
    id: `neighbor-${videoId}-${frameId}`,
    score: 0,
    video_id: videoId,
    timestamp,
    image_path: imagePath,
    payload: {
      video_id: videoId,
      frame_id: frameId,
      img_link: imagePath,
      timestamp,
      time_order: timeOrder,
      frame_order: mapRow?.frame_order ?? null,
      fps: mapRow?.fps ?? null,
      caption: '',
      model: 'local-keyframe-neighbor',
    },
  }
}

function aicMediaPlugin() {
  mediaState.videoIndex = discoverVideos()

  return {
    name: 'aic-media-dev-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url || ''
        const pathname = requestUrl.split('?')[0]

        if (
          pathname !== configPath &&
          pathname !== `${configPath}/` &&
          pathname !== configDatasetRootPath &&
          pathname !== configChooseDatasetRootPath
        ) {
          next()
          return
        }

        if ((pathname === configPath || pathname === `${configPath}/`) && req.method === 'GET') {
          sendJson(res, 200, datasetConfigPayload(req))
          return
        }

        if ((pathname !== configDatasetRootPath && pathname !== configChooseDatasetRootPath) || req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }

        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          sendJson(res, 403, {
            error: 'Dataset root changes are only allowed from localhost.',
            ...datasetConfigPayload(req),
          })
          return
        }

        if (pathname === configChooseDatasetRootPath) {
          try {
            const choice = await chooseDatasetRootOnHost()
            if (choice.cancelled || !choice.datasetRoot) {
              sendJson(res, 200, { cancelled: true, ...datasetConfigPayload(req) })
              return
            }

            applyDatasetRoot(req, res, choice.datasetRoot, { cancelled: false })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Dataset folder chooser failed.'
            sendJson(res, 500, { error: message, ...datasetConfigPayload(req) })
          }
          return
        }

        let body: unknown
        try {
          body = await readJsonBody(req)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid request body'
          sendJson(res, 400, { error: message, ...datasetConfigPayload(req) })
          return
        }

        const requestedRoot = typeof body === 'object' && body && 'datasetRoot' in body
          ? String(body.datasetRoot)
          : ''
        if (!requestedRoot.trim()) {
          sendJson(res, 400, { error: 'datasetRoot is required.', ...datasetConfigPayload(req) })
          return
        }

        applyDatasetRoot(req, res, requestedRoot)
      })

      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || ''
        const pathname = requestUrl.split('?')[0]
        if (!pathname.startsWith(mediaPrefix)) {
          next()
          return
        }

        let relativePath = ''
        try {
          relativePath = decodeURIComponent(pathname.slice(mediaPrefix.length))
        } catch {
          res.statusCode = 400
          res.end('Invalid media path')
          return
        }

        const target = path.resolve(mediaState.datasetRoot, relativePath)
        if (!isInsideAic(target)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        streamFile(req, res, target)
      })

      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || ''
        const pathname = requestUrl.split('?')[0]
        if (!pathname.startsWith(videoPrefix)) {
          next()
          return
        }

        let videoId = ''
        try {
          videoId = decodeURIComponent(pathname.slice(videoPrefix.length))
        } catch {
          sendText(res, 400, 'Invalid video id')
          return
        }

        if (!safeIdPattern.test(videoId)) {
          sendText(res, 400, 'Invalid video id')
          return
        }

        const target = mediaState.videoIndex.get(videoId)
        if (!target || !isInsideAic(target) || !fs.existsSync(target)) {
          sendText(res, 404, 'Not found')
          return
        }

        streamFile(req, res, target)
      })

      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || ''
        const pathname = requestUrl.split('?')[0]
        if (!pathname.startsWith(neighborsPrefix)) {
          next()
          return
        }

        const url = new URL(requestUrl, 'http://localhost')
        const rawParts = pathname.slice(neighborsPrefix.length).split('/').filter(Boolean)
        if (rawParts.length !== 2) {
          sendText(res, 400, 'Invalid neighbor path')
          return
        }

        let videoId = ''
        let frameId = ''
        try {
          videoId = decodeURIComponent(rawParts[0])
          frameId = decodeURIComponent(rawParts[1])
        } catch {
          sendText(res, 400, 'Invalid neighbor path')
          return
        }

        if (!safeIdPattern.test(videoId) || !safeIdPattern.test(frameId)) {
          sendText(res, 400, 'Invalid neighbor path')
          return
        }

        const limit = Math.max(1, Math.min(10, Number(url.searchParams.get('limit') || 3)))
        const imageDir = path.resolve(mediaState.datasetRoot, 'imgs', videoId)
        if (!isInsideAic(imageDir) || !fs.existsSync(imageDir) || !fs.statSync(imageDir).isDirectory()) {
          sendText(res, 404, 'Not found')
          return
        }

        const files = fs.readdirSync(imageDir)
          .filter((fileName) => imageExtensions.has(path.extname(fileName).toLowerCase()))
          .sort(naturalFrameSort)
        const currentIndex = files.findIndex((fileName) => path.parse(fileName).name === frameId)
        if (currentIndex === -1) {
          sendText(res, 404, 'Not found')
          return
        }

        const start = Math.max(0, currentIndex - limit)
        const end = Math.min(files.length, currentIndex + limit + 1)
        const mapRows = parseMapRows(videoId)
        const frames = files.slice(start, end).map((fileName, offset) => (
          frameFromFile(videoId, fileName, start + offset, mapRows)
        ))

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ frames }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), aicMediaPlugin()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
