const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function validateJpeg(body, contentType, maxBytes) {
  if (!Buffer.isBuffer(body) || body.length < 32) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Expected an image body' }
  }
  if (body.length > maxBytes) {
    return { ok: false, code: 'MEDIA_TOO_LARGE', message: 'Image too large' }
  }
  const isJpeg = body.subarray(0, JPEG.length).equals(JPEG)
  const isPng = body.subarray(0, PNG.length).equals(PNG)
  if (contentType === 'image/jpeg' && !isJpeg) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Content is not a JPEG image' }
  }
  if (contentType === 'image/png' && !isPng) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Content is not a PNG image' }
  }
  if (!isJpeg && !isPng) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'Unsupported image format' }
  }
  return { ok: true, contentType: isJpeg ? 'image/jpeg' : 'image/png' }
}

export function isValidToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(value)
}
