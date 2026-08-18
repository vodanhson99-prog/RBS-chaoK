export type SessionMeta = {
  token: string
  url: string
  expiresAt: string
}

export async function fetchLanHost(): Promise<string | null> {
  try {
    const res = await fetch('/api/lan')
    if (!res.ok) return null
    const data = (await res.json()) as { host?: string | null }
    return data.host || null
  } catch {
    return null
  }
}

/** Phone-reachable origin. localhost in a QR is useless on iPhone. */
export async function shareOrigin(): Promise<string> {
  const { protocol, hostname, port } = window.location
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1'
  if (!isLoopback) return window.location.origin
  const lan = await fetchLanHost()
  if (!lan) return window.location.origin
  const p = port ? `:${port}` : ''
  return `${protocol}//${lan}${p}`
}

export async function uploadSession(blob: Blob): Promise<SessionMeta> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Upload failed (${res.status})`)
  }
  return res.json()
}

export async function fetchSession(token: string): Promise<SessionMeta> {
  const res = await fetch(`/api/sessions/${token}`)
  if (res.status === 404) throw new Error('Link expired or not found')
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`)
  return res.json()
}

export function sessionImageUrl(token: string): string {
  return `/api/sessions/${token}/image`
}
