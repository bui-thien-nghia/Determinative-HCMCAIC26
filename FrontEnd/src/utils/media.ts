export function getImageUrl(path?: string) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  return `/api/media/image/${path}`
}
