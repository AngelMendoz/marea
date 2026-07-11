export function relativeTime(unixSeconds: number): string {
  const now = Date.now() / 1000
  const diff = now - unixSeconds
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / 86400 / 7)} sem`
  if (diff < 86400 * 365) return `hace ${Math.floor(diff / 86400 / 30)} mes`
  return `hace ${Math.floor(diff / 86400 / 365)} a`
}

export function fullDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
