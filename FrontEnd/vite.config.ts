import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const aicMediaRoot = path.resolve(repoRoot, 'AIC26')
const mediaPrefix = '/__aic_media__/'
const videoPrefix = '/__aic_video__/'
const neighborsPrefix = '/__aic_neighbors__/'
const safeIdPattern = /^[A-Za-z0-9_-]+$/
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv'])

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

function isInsideAic(target: string) {
  return target === aicMediaRoot || target.startsWith(aicMediaRoot + path.sep)
}

function sendText(res: ServerResponse, statusCode: number, message: string) {
  res.statusCode = statusCode
  res.end(message)
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

function discoverVideos() {
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
      if (!safeIdPattern.test(videoId) || !isInsideAic(absolute)) {
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

  walk(path.join(aicMediaRoot, 'vids'))
  return index
}

function naturalFrameSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function parseMapRows(videoId: string) {
  const mapPath = path.resolve(aicMediaRoot, 'maps', `${videoId}.csv`)
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

function frameFromFile(videoId: string, fileName: string, index: number, mapRows: Record<string, number | null>[]) {
  const frameId = path.parse(fileName).name
  const imagePath = `AIC26/imgs/${videoId}/${fileName}`
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
  const videoIndex = discoverVideos()

  return {
    name: 'aic-media-dev-server',
    configureServer(server: ViteDevServer) {
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

        const target = path.resolve(aicMediaRoot, relativePath)
        if (target !== aicMediaRoot && !target.startsWith(aicMediaRoot + path.sep)) {
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

        const target = videoIndex.get(videoId)
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
        const imageDir = path.resolve(aicMediaRoot, 'imgs', videoId)
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
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
