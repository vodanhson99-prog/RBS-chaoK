import { randomBytes, randomUUID } from 'node:crypto'

export function createPhotoRecord({
  id,
  token,
  bytes,
  contentType,
  frameId,
  frameVersion,
  captureMode,
  boothId,
  eventId,
  storedUntilMs,
  qrExpiresMs,
}) {
  const photoId = id || randomUUID()
  const publicToken = token || randomBytes(18).toString('base64url')
  const createdAt = new Date()
  const storedUntil = new Date(createdAt.getTime() + storedUntilMs)
  const qrExpiresAt = new Date(createdAt.getTime() + qrExpiresMs)

  return {
    id: photoId,
    token: publicToken,
    status: 'private',
    visibility: 'hidden',
    frameId,
    frameVersion,
    captureMode,
    boothId,
    eventId,
    contentType,
    bytes,
    createdAt: createdAt.toISOString(),
    storedUntil: storedUntil.toISOString(),
    qrExpiresAt: qrExpiresAt.toISOString(),
    currentEditId: null,
    originalAssetKey: 'original.jpg',
    currentAssetKey: 'original.jpg',
  }
}

export function createEditRecord({ photoId, recipe }) {
  return {
    id: randomUUID(),
    photoId,
    recipe,
    renderedAssetKey: null,
    createdAt: new Date().toISOString(),
  }
}

export function toPublicPhoto(meta, origin) {
  const expiresAt = meta.qrExpiresAt || meta.storedUntil
  return {
    id: meta.id,
    token: meta.token,
    status: meta.status,
    url: `${origin}/p/${meta.token}`,
    imageUrl: `/api/photos/${meta.token}/image`,
    createdAt: meta.createdAt,
    expiresAt,
    storedUntil: meta.storedUntil,
    frameId: meta.frameId,
    frameVersion: meta.frameVersion,
    captureMode: meta.captureMode,
    eventId: meta.eventId,
    boothId: meta.boothId,
    hasEdit: Boolean(meta.currentEditId),
  }
}

/** Compatibility shape for the retained /api/sessions routes. */
export function toSessionShape(publicPhoto) {
  return {
    token: publicPhoto.token,
    status: publicPhoto.status === 'revoked' ? 'revoked' : 'available',
    url: publicPhoto.url,
    imageUrl: `/api/photos/${publicPhoto.token}/image`,
    createdAt: publicPhoto.createdAt,
    expiresAt: publicPhoto.expiresAt,
    templateId: publicPhoto.frameId,
    templateVersion: publicPhoto.frameVersion,
    captureMode: publicPhoto.captureMode,
    eventId: publicPhoto.eventId,
    boothId: publicPhoto.boothId,
  }
}

export function isPhotoAccessible(meta, now = Date.now()) {
  if (!meta || meta.status === 'revoked') return false
  const qrExpiry = new Date(meta.qrExpiresAt || meta.storedUntil).getTime()
  return qrExpiry >= now
}

export function isPhotoRetained(meta, now = Date.now()) {
  if (!meta) return false
  return new Date(meta.storedUntil).getTime() >= now
}
