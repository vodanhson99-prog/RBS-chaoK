const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/
const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

export function isValidFrameId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

export function isValidFrameMime(value) {
  return Object.hasOwn(MIME_TO_EXTENSION, value)
}

export function frameExtension(contentType) {
  return MIME_TO_EXTENSION[contentType] || null
}

export function validateFrameAsset(bytes, contentType, maxBytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Expected a frame image body' }
  }
  if (bytes.length > maxBytes) {
    return { ok: false, code: 'MEDIA_TOO_LARGE', message: 'Frame image too large' }
  }
  if (!isValidFrameMime(contentType)) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Frame must be PNG, JPEG, or SVG' }
  }
  if (contentType === 'image/png' && !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Content is not a PNG image' }
  }
  if (contentType === 'image/jpeg' && !bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Content is not a JPEG image' }
  }
  if (contentType === 'image/svg+xml') {
    const text = bytes.toString('utf8', 0, Math.min(bytes.length, 4096)).trim().toLowerCase()
    if (!text.includes('<svg') || text.includes('<script') || text.includes('javascript:') || text.includes('<foreignobject')) {
      return { ok: false, code: 'INVALID_MEDIA', message: 'Content is not a safe SVG image' }
    }
  }
  return { ok: true }
}

function validDimension(value) {
  return Number.isInteger(value) && value >= 64 && value <= 8192
}

function normalizeRotation(value) {
  if (value === undefined) return 0
  if (!Number.isFinite(value)) return null
  const normalized = ((value + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function rotatedCorners(slot, rotation) {
  const radians = (rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = slot.x + slot.w / 2
  const cy = slot.y + slot.h / 2
  return [
    [-slot.w / 2, -slot.h / 2],
    [slot.w / 2, -slot.h / 2],
    [slot.w / 2, slot.h / 2],
    [-slot.w / 2, slot.h / 2],
  ].map(([x, y]) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }))
}

function validSlot(slot, width, height) {
  if (
    !slot ||
    !Number.isFinite(slot.x) ||
    !Number.isFinite(slot.y) ||
    !Number.isFinite(slot.w) ||
    !Number.isFinite(slot.h) ||
    slot.w < 8 ||
    slot.h < 8
  ) return false
  const rotation = normalizeRotation(slot.rotation)
  if (rotation === null) return false
  const corners = rotatedCorners(slot, rotation)
  return corners.every((corner) => corner.x >= 0 && corner.y >= 0 && corner.x <= width && corner.y <= height)
}

export function validateFrameManifest(input) {
  if (!input || typeof input !== 'object') return { ok: false, message: 'Frame manifest is required' }
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const kind = input.kind
  const width = input.output?.width
  const height = input.output?.height
  const slots = Array.isArray(input.slots) ? input.slots : input.layout?.slots
  if (!isValidFrameId(id)) return { ok: false, message: 'Frame id must use lowercase letters, numbers, hyphens, or underscores' }
  if (!name) return { ok: false, message: 'Frame name is required' }
  if (kind !== 'single' && kind !== 'strip6' && kind !== 'custom') return { ok: false, message: 'Frame kind is invalid' }
  if (!validDimension(width) || !validDimension(height)) return { ok: false, message: 'Frame dimensions must be between 64 and 8192 pixels' }
  if (!Array.isArray(slots) || slots.length > 120) return { ok: false, message: 'Frame slots must be an array with at most 120 entries' }
  if (kind === 'custom' && slots.length === 0) return { ok: false, message: 'Custom frames need at least one photo slot' }
  if (kind === 'single' && slots.length > 1) return { ok: false, message: 'Single frames can define at most one photo slot' }
  if (kind === 'strip6' && slots.length !== 6) return { ok: false, message: 'Strip frames need exactly 6 photo slots' }
  if (!slots.every((slot) => validSlot(slot, width, height))) return { ok: false, message: 'Frame slots must stay inside the output canvas' }
  const normalizedSlots = slots.map((slot) => ({ ...slot, rotation: normalizeRotation(slot.rotation) }))
  return {
    ok: true,
    manifest: {
      id,
      name,
      kind,
      version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1,
      output: { width, height, mimeType: 'image/jpeg' },
      layout: { mode: kind === 'strip6' ? 'strip' : kind === 'custom' ? 'custom' : 'single', slots: normalizedSlots, crop: 'cover' },
      slots: normalizedSlots,
    },
  }
}

export function toPublicFrame(manifest, origin = '') {
  const base = `/api/frames/${encodeURIComponent(manifest.id)}`
  const expectedMimeType = manifest.contentType || manifest.asset?.expectedMimeType || 'image/png'
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    kind: manifest.kind,
    output: manifest.output,
    layout: manifest.layout,
    slots: manifest.slots || manifest.layout?.slots || [],
    src: `${base}/asset`,
    asset: { src: `${base}/asset`, expectedMimeType },
    thumbnailSrc: `${base}/thumbnail`,
    source: 'custom',
    deletable: true,
    ...(origin ? { url: `${origin}${base}/asset` } : {}),
  }
}

export function frameAssetExtension(contentType) {
  return frameExtension(contentType)
}
