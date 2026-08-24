import { reloadEnvFiles } from './src/config/loadEnv.mjs'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import { loadConfig } from './src/config/env.mjs'
import { buildBoothConfig, parseSessionHeaders } from './src/domain/booth.mjs'
import { isValidToken, validateJpeg } from './src/domain/media.mjs'
import { isValidFrameId, toPublicFrame, validateFrameAsset, validateFrameManifest } from './src/domain/frame.mjs'
import { isPhotoAccessible, isPhotoRetained, toPublicPhoto, toSessionShape } from './src/domain/photo.mjs'
import {
  buildPrintConfig,
  claimJob,
  completeJob,
  createPrintJob,
  failJob,
  markPaid,
  toPublicPrintJob,
  validatePrintRequest,
} from './src/domain/printJob.mjs'
import { measureStorage } from './src/jobs/storageMonitor.mjs'
import { startRetentionJob } from './src/jobs/retention.mjs'
import { PhotoStore } from './src/storage/photoStore.mjs'
import { PrintJobStore } from './src/storage/printJobStore.mjs'
import { FrameStore } from './src/storage/frameStore.mjs'
import { createStorageMetrics } from './src/storage/metrics.mjs'

export async function createApp({ config = loadConfig(), store: providedStore, printJobs: providedPrintJobs, frames: providedFrames, logger = false } = {}) {
  const metrics = createStorageMetrics()
  const photoStore = providedStore || new PhotoStore(config.dataDir, { metrics })
  const printJobStore = providedPrintJobs || new PrintJobStore(config.dataDir, { metrics })
  const frameStore = providedFrames || new FrameStore(config.dataDir, { metrics })
  await photoStore.init()
  await printJobStore.init()
  await frameStore.init()

  const app = Fastify({ logger, bodyLimit: config.maxBytes })
  const rateBuckets = new Map()
  let activeUploads = 0

  const store = photoStore
  const printJobs = printJobStore
  const frames = frameStore
  let storageSnapshot = null
  let storageSnapshotPromise = null
  const storageSnapshotTtlMs = 30_000

  async function getStorageSnapshot() {
    const now = Date.now()
    if (storageSnapshot && storageSnapshot.expiresAt > now) return storageSnapshot.value
    if (!storageSnapshotPromise) {
      storageSnapshotPromise = measureStorage(config.dataDir, metrics).then((value) => {
        storageSnapshot = { value, expiresAt: Date.now() + storageSnapshotTtlMs }
        return value
      }).finally(() => {
        storageSnapshotPromise = null
      })
    }
    return storageSnapshotPromise
  }

app.addContentTypeParser('image/jpeg', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
app.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
app.addContentTypeParser('image/svg+xml', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  try {
    done(null, body ? JSON.parse(body) : {})
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    done(error)
  }
})

function requestId(req) {
  return req.id || randomBytes(8).toString('hex')
}

function error(reply, code, message, status = 400, id) {
  return reply.code(status).send({ error: { code, message, requestId: id } })
}

function clientKey(req) {
  return String(req.headers['x-booth-id'] || req.ip || 'unknown').slice(0, 128)
}

function pruneRateBuckets(now) {
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }
}

async function claimNextJob(workerId) {
  if (typeof printJobs.claimNext === 'function') return printJobs.claimNext(workerId)
  const claimable = await printJobs.listClaimable(1)
  const candidate = claimable[0]
  if (!candidate) return null
  const claimed = claimJob(candidate, workerId)
  if (!claimed.ok) return claimed
  await printJobs.save(claimed.job)
  return claimed
}

function allowedOrigin(origin) {
  return !origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)
}

function lanIPv4() {
  const nets = os.networkInterfaces()
  const addrs = []
  for (const list of Object.values(nets)) {
    for (const address of list || []) {
      const family = address.family === 'IPv4' || address.family === 4
      if (family && !address.internal) addrs.push(address.address)
    }
  }
  return addrs.find((ip) => ip.startsWith('192.168.')) || addrs.find((ip) => ip.startsWith('10.')) || addrs[0] || null
}

function internalAuthorized(req) {
  const key = req.headers['x-internal-key']
  return typeof key === 'string' && key.length > 0 && key === config.internalApiKey
}

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1'
}

function localDeveloperRequest(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return isLoopbackAddress(forwarded || req.ip || req.socket?.remoteAddress)
}

function workerAuthorized(req) {
  const key = req.headers['x-worker-secret']
  return typeof key === 'string' && key.length > 0 && key === config.printWorkerSecret
}

function printPriceBySize() {
  return {
    '4x6': config.printPrice4x6,
    '6x8': config.printPrice6x8,
  }
}

function publicOrigin(req) {
  if (config.webBaseUrl) return config.webBaseUrl
  return `${req.protocol}://${req.headers.host}`
}

function downloadFilename(token, metadata) {
  const suffix = metadata?.currentEditId ? '-edit' : ''
  return `rbs-${token}${suffix}.jpg`
}

function isUploadRoute(url, method) {
  return method === 'POST' && (url.startsWith('/api/photos') || url.startsWith('/api/sessions'))
}

app.addHook('onRequest', async (req, reply) => {
  const id = requestId(req)
  reply.header('X-Request-Id', id)
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('Referrer-Policy', 'no-referrer')
  const origin = req.headers.origin
  if (!allowedOrigin(origin)) return error(reply, 'FORBIDDEN', 'Origin is not allowed', 403, id)
  if (origin) reply.header('Access-Control-Allow-Origin', origin)
  reply.header('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    reply.header('Access-Control-Allow-Headers',
      'Content-Type, X-Booth-Id, X-Template-Id, X-Template-Version, X-Capture-Mode, X-Frame-Id, X-Frame-Version, X-Worker-Secret, X-Internal-Key',
    )
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    return reply.code(204).send()
  }

  if (isUploadRoute(req.url, req.method)) {
    const key = clientKey(req)
    const now = Date.now()
    pruneRateBuckets(now)
    const bucket = rateBuckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs })
    } else {
      bucket.count += 1
      if (bucket.count > config.rateLimitMax) {
        reply.header('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)))
        return error(reply, 'RATE_LIMITED', 'Too many uploads; try again later', 429, id)
      }
    }
  }
})

app.get('/healthz', async () => ({ status: 'ok' }))
app.get('/readyz', async (_req, reply) => {
  try {
    await store.init()
    await printJobs.init()
    const storage = await getStorageSnapshot()
    const warn = storage.bytes >= config.storageWarnBytes
    return { status: 'ready', storage: { ...storage, warn } }
  } catch {
    return error(reply, 'STORAGE_UNAVAILABLE', 'Storage is unavailable', 503)
  }
})

app.get('/api/lan', async () => ({ host: lanIPv4() }))

function readBoothConfig() {
  if (process.env.NODE_ENV === 'production') return buildBoothConfig(config)
  reloadEnvFiles()
  return buildBoothConfig(loadConfig())
}

app.get('/api/booth/config', async () => readBoothConfig())

app.get('/api/frames', async (req, reply) => {
  try {
    const custom = await frames.listActive()
    return { frames: custom.map((frame) => toPublicFrame(frame, publicOrigin(req))) }
  } catch (storageError) {
    req.log.error({ err: storageError }, 'frame list failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load frame library', 503, requestId(req))
  }
})

app.get('/api/frames/:id/asset', async (req, reply) => {
  const id = requestId(req)
  if (!isValidFrameId(req.params.id)) return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
  try {
    const metadata = await frames.read(req.params.id)
    if (metadata.status !== 'active') return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
    const { bytes } = await frames.readAssetByMetadata(metadata)
    reply.header('Content-Type', metadata.contentType)
    reply.header('Cache-Control', 'public, max-age=300')
    return reply.send(bytes)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
    req.log.error({ err: storageError }, 'frame asset read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load frame asset', 503, id)
  }
})

app.get('/api/frames/:id/thumbnail', async (req, reply) => {
  const id = requestId(req)
  if (!isValidFrameId(req.params.id)) return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
  try {
    const metadata = await frames.read(req.params.id)
    if (metadata.status !== 'active') return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
    const { bytes } = await frames.readAssetByMetadata(metadata, true)
    reply.header('Content-Type', metadata.thumbnailContentType)
    reply.header('Cache-Control', 'public, max-age=300')
    return reply.send(bytes)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
    req.log.error({ err: storageError }, 'frame thumbnail read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load frame thumbnail', 503, id)
  }
})

app.post('/api/internal/frames', async (req, reply) => {
  const id = requestId(req)
  if (!localDeveloperRequest(req)) return error(reply, 'FORBIDDEN', 'Frame editor is available on localhost only', 403, id)
  const contentType = String(req.headers['content-type'] || '').split(';')[0]
  const validation = validateFrameAsset(req.body, contentType, config.maxBytes)
  if (!validation.ok) return error(reply, validation.code, validation.message, validation.code === 'MEDIA_TOO_LARGE' ? 413 : 400, id)
  let payload
  try {
    payload = JSON.parse(String(req.headers['x-frame-manifest'] || '{}'))
  } catch {
    return error(reply, 'INVALID_FRAME', 'X-Frame-Manifest must be valid JSON', 400, id)
  }
  const manifestValidation = validateFrameManifest(payload)
  if (!manifestValidation.ok) return error(reply, 'INVALID_FRAME', manifestValidation.message, 400, id)
  try {
    const saved = await frames.create({ manifest: manifestValidation.manifest, bytes: req.body, contentType })
    return reply.code(201).send(toPublicFrame(saved, publicOrigin(req)))
  } catch (storageError) {
    if (storageError?.code === 'EEXIST') return error(reply, 'CONFLICT', 'Frame id already exists', 409, id)
    if (storageError?.code === 'INVALID_FRAME') return error(reply, 'INVALID_FRAME', storageError.message, 400, id)
    req.log.error({ err: storageError }, 'frame create failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not save frame', 503, id)
  }
})

app.delete('/api/internal/frames/:id', async (req, reply) => {
  const id = requestId(req)
  if (!localDeveloperRequest(req)) return error(reply, 'FORBIDDEN', 'Frame editor is available on localhost only', 403, id)
  if (!isValidFrameId(req.params.id)) return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
  try {
    const archived = await frames.archive(req.params.id)
    return { id: archived.id, status: archived.status }
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Frame not found', 404, id)
    req.log.error({ err: storageError }, 'frame archive failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not archive frame', 503, id)
  }
})

app.get('/api/print/config', async () => buildPrintConfig(config))

async function createPhotoFromUpload(req, reply) {
  const id = requestId(req)
  const idempotencyKey = req.headers['idempotency-key']
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))) {
    return error(reply, 'BAD_REQUEST', 'Idempotency-Key must be 16-128 URL-safe characters', 400, id)
  }
  if (activeUploads >= config.maxConcurrentUploads) {
    return error(reply, 'RATE_LIMITED', 'Upload service is busy; try again later', 429, id)
  }
  const contentType = String(req.headers['content-type'] || '').split(';')[0]
  const validation = validateJpeg(req.body, contentType, config.maxBytes)
  if (!validation.ok) {
    return error(reply, validation.code, validation.message, validation.code === 'MEDIA_TOO_LARGE' ? 413 : 400, id)
  }

  activeUploads += 1
  const sessionHeaders = parseSessionHeaders(req.headers)
  const frameId = req.headers['x-frame-id'] || sessionHeaders.templateId
  const frameVersion = sessionHeaders.templateVersion

  try {
    const metadata = await store.createPhoto({
      bytes: req.body,
      contentType: validation.contentType,
      frameId,
      frameVersion,
      captureMode: sessionHeaders.captureMode || config.captureMode,
      boothId: req.headers['x-booth-id'] || null,
      eventId: null,
      storedUntilMs: config.photoRetentionMs,
      qrExpiresMs: config.qrAccessTtlMs,
      idempotencyKey,
    })
    return toPublicPhoto(metadata, publicOrigin(req))
  } catch (storageError) {
    req.log.error({ err: storageError }, 'photo storage failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not save image', 503, id)
  } finally {
    activeUploads -= 1
  }
}

async function readPhotoMeta(req, reply) {
  const id = requestId(req)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
  try {
    const metadata = await store.readMetadataByToken(token)
    if (!isPhotoAccessible(metadata)) {
      if (!isPhotoRetained(metadata)) await store.removeByToken(token)
      return error(reply, 'EXPIRED', 'Photo link expired', 404, id)
    }
    return toPublicPhoto(metadata, publicOrigin(req))
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
    req.log.error({ err: storageError }, 'photo metadata read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load photo', 503, id)
  }
}

async function readPhotoImage(req, reply) {
  const id = requestId(req)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Image not found', 404, id)
  const original = req.query?.original === '1' || req.query?.original === 'true'
  try {
    const metadata = await store.readMetadataByToken(token)
    if (!isPhotoAccessible(metadata)) {
      if (!isPhotoRetained(metadata)) await store.removeByToken(token)
      return error(reply, 'EXPIRED', 'Photo link expired', 404, id)
    }
    const file = await store.readImageByMetadata(metadata, { original })
    reply.header('Content-Type', metadata.contentType || 'image/jpeg')
    reply.header('Cache-Control', 'private, max-age=300')
    if (req.query?.download === '1' || req.query?.download === 'true') {
      reply.header('Content-Disposition', `attachment; filename="${downloadFilename(token, metadata)}"`)
    }
    return reply.send(file)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Image not found', 404, id)
    req.log.error({ err: storageError }, 'photo image read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load image', 503, id)
  }
}

app.post('/api/photos', createPhotoFromUpload)
app.get('/api/photos/:token', readPhotoMeta)
app.get('/api/photos/:token/image', readPhotoImage)

app.post('/api/photos/:token/edits', async (req, reply) => {
  const id = requestId(req)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)

  const body = req.body || {}
  const recipe = body.recipe ?? body
  if (!recipe || typeof recipe !== 'object' || !Array.isArray(recipe.stickers)) {
    return error(reply, 'INVALID_RECIPE', 'Edit recipe must include a stickers array', 400, id)
  }

  let renderedBytes = null
  const renderedRaw = body.renderedBase64
  if (typeof renderedRaw === 'string' && renderedRaw.length > 0) {
    const base64 = renderedRaw.replace(/^data:image\/\w+;base64,/, '')
    renderedBytes = Buffer.from(base64, 'base64')
    if (renderedBytes.length > config.maxBytes) {
      return error(reply, 'MEDIA_TOO_LARGE', 'Rendered image too large', 413, id)
    }
    const jpegOk = renderedBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    if (!jpegOk) return error(reply, 'INVALID_MEDIA', 'Rendered image must be JPEG', 400, id)
  }

  try {
    const metadata = await store.readMetadataByToken(token)
    if (!isPhotoAccessible(metadata)) {
      return error(reply, 'EXPIRED', 'Photo link expired', 404, id)
    }
    const edit = await store.saveEdit(token, recipe, renderedBytes, metadata)
    return {
      id: edit.id,
      photoId: metadata.id,
      token,
      recipe: edit.recipe,
      createdAt: edit.createdAt,
      hasRendered: Boolean(edit.renderedAssetKey),
      imageUrl: `/api/photos/${token}/image`,
    }
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
    req.log.error({ err: storageError }, 'edit save failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not save edit', 503, id)
  }
})

app.get('/api/photos/:token/edits/latest', async (req, reply) => {
  const id = requestId(req)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
  try {
    const metadata = await store.readMetadataByToken(token)
    if (!isPhotoAccessible(metadata)) {
      return error(reply, 'EXPIRED', 'Photo link expired', 404, id)
    }
    const edit = await store.readLatestEdit(token)
    if (!edit) return error(reply, 'NOT_FOUND', 'No edit saved yet', 404, id)
    return edit
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
    req.log.error({ err: storageError }, 'edit read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load edit', 503, id)
  }
})

app.post('/api/photos/:token/print-jobs', async (req, reply) => {
  const id = requestId(req)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)

  const parsed = validatePrintRequest(req.body || {}, printPriceBySize())
  if (!parsed.ok) return error(reply, parsed.code, parsed.message, 400, id)

  try {
    const metadata = await store.readMetadataByToken(token)
    if (!isPhotoAccessible(metadata)) return error(reply, 'EXPIRED', 'Photo link expired', 404, id)
    const job = createPrintJob({
      photoId: metadata.id,
      token,
      editId: metadata.currentEditId,
      quantity: parsed.quantity,
      size: parsed.size,
      amountCents: parsed.amountCents,
      currency: config.printCurrency,
      claimLeaseMs: config.printClaimLeaseMs,
    })
      await printJobs.save(job)
      return toPublicPrintJob(job)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
    req.log.error({ err: storageError }, 'print job create failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not create print job', 503, id)
  }
})

app.get('/api/print-jobs/:id/media', async (req, reply) => {
  const id = requestId(req)
  if (!workerAuthorized(req)) return error(reply, 'FORBIDDEN', 'Worker not authorized', 403, id)
  try {
    const job = await printJobs.read(req.params.id)
    if (job.paymentStatus !== 'paid' || !job.claimToken) return error(reply, 'FORBIDDEN', 'Job media is not available', 403, id)
    const metadata = await store.readMetadataByToken(job.token)
    if (!isPhotoRetained(metadata)) return error(reply, 'NOT_FOUND', 'Print media not found', 404, id)
    const file = await store.readImageByMetadata(metadata)
    reply.header('Content-Type', metadata.contentType || 'image/jpeg')
    reply.header('Cache-Control', 'private, no-store')
    return reply.send(file)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print media not found', 404, id)
    req.log.error({ err: storageError }, 'worker media read failed')
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load print media', 503, id)
  }
})

app.get('/api/print-jobs/claim/next', async (req, reply) => {
  const id = requestId(req)
  if (!workerAuthorized(req)) return error(reply, 'FORBIDDEN', 'Worker not authorized', 403, id)
  const workerId = String(req.headers['x-worker-id'] || 'worker').slice(0, 128)
  const claimed = await claimNextJob(workerId)
  if (!claimed) return reply.code(204).send()
  if (!claimed.ok) return error(reply, claimed.code, claimed.message, 409, id)
  return {
    job: toPublicPrintJob(claimed.job),
    claimToken: claimed.claimToken,
    imageUrl: `/api/print-jobs/${claimed.job.id}/media`,
  }
})

app.get('/api/print-jobs/:id', async (req, reply) => {
  const id = requestId(req)
  try {
    const job = await printJobs.read(req.params.id)
    return toPublicPrintJob(job)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print job not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not load print job', 503, id)
  }
})

app.post('/api/print-jobs/:id/pay', async (req, reply) => {
  const id = requestId(req)
  if (config.paymentMode !== 'mock') {
    return error(reply, 'PAYMENT_REQUIRED', 'Use payment provider checkout', 402, id)
  }
  try {
    const job = await printJobs.read(req.params.id)
    if (job.paymentStatus === 'paid') return toPublicPrintJob(job)
    const paid = markPaid(job)
    await printJobs.save(paid)
    return toPublicPrintJob(paid)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print job not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not update payment', 503, id)
  }
})

function verifyPaymentWebhook(body, req) {
  if (config.paymentMode !== 'webhook') return { ok: false, code: 'PAYMENT_REQUIRED', message: 'Payment webhook mode is disabled' }
  if (config.nodeEnv === 'production') {
    return { ok: false, code: 'PAYMENT_REQUIRED', message: 'Payment provider webhook verification is not configured' }
  }
  const expectedKey = config.paymentWebhookKey
  const receivedKey = req.headers['x-payment-webhook-key']
  if (!expectedKey || typeof receivedKey !== 'string' || receivedKey !== expectedKey) {
    return { ok: false, code: 'FORBIDDEN', message: 'Payment webhook verification failed' }
  }
  return { ok: true }
}

app.post('/api/payments/webhook', async (req, reply) => {
  const id = requestId(req)
  const body = req.body || {}
  const verification = verifyPaymentWebhook(body, req)
  if (!verification.ok) return error(reply, verification.code, verification.message, verification.code === 'FORBIDDEN' ? 403 : 503, id)
  const jobId = body.jobId || body.printJobId
  const event = body.event || body.type
  if (!jobId || event !== 'payment.paid') {
    return error(reply, 'BAD_REQUEST', 'Unsupported webhook payload', 400, id)
  }
  try {
    const job = await printJobs.read(String(jobId))
    const paid = markPaid(job)
    await printJobs.save(paid)
    return { ok: true, job: toPublicPrintJob(paid) }
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print job not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not apply webhook', 503, id)
  }
})

app.post('/api/print-jobs/:id/complete', async (req, reply) => {
  const id = requestId(req)
  if (!workerAuthorized(req)) return error(reply, 'FORBIDDEN', 'Worker not authorized', 403, id)
  const claimToken = req.body?.claimToken
  const workerId = String(req.headers['x-worker-id'] || 'worker').slice(0, 128)
  if (!claimToken) return error(reply, 'BAD_REQUEST', 'claimToken required', 400, id)
  try {
    let result
    if (typeof printJobs.update === 'function') {
      result = await printJobs.update(req.params.id, (job) => completeJob(job, claimToken, workerId))
    }
    if (typeof printJobs.update !== 'function') {
      const job = await printJobs.read(req.params.id)
      const legacyResult = completeJob(job, claimToken, workerId)
      if (!legacyResult.ok) return error(reply, legacyResult.code, legacyResult.message, 409, id)
      await printJobs.save(legacyResult.job)
      return toPublicPrintJob(legacyResult.job)
    }
    if (!result?.ok) return error(reply, result?.code || 'STORAGE_UNAVAILABLE', result?.message || 'Could not complete print job', result?.code ? 409 : 503, id)
    return toPublicPrintJob(result.job)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print job not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not complete print job', 503, id)
  }
})

app.post('/api/print-jobs/:id/fail', async (req, reply) => {
  const id = requestId(req)
  if (!workerAuthorized(req)) return error(reply, 'FORBIDDEN', 'Worker not authorized', 403, id)
  const claimToken = req.body?.claimToken
  const workerId = String(req.headers['x-worker-id'] || 'worker').slice(0, 128)
  if (!claimToken) return error(reply, 'BAD_REQUEST', 'claimToken required', 400, id)
  try {
    let result
    if (typeof printJobs.update === 'function') {
      result = await printJobs.update(req.params.id, (job) => failJob(job, claimToken, workerId, req.body?.message))
    }
    if (typeof printJobs.update !== 'function') {
      const job = await printJobs.read(req.params.id)
      const legacyResult = failJob(job, claimToken, workerId, req.body?.message)
      if (!legacyResult.ok) return error(reply, legacyResult.code, legacyResult.message, 409, id)
      await printJobs.save(legacyResult.job)
      return toPublicPrintJob(legacyResult.job)
    }
    if (!result?.ok) return error(reply, result?.code || 'STORAGE_UNAVAILABLE', result?.message || 'Could not fail print job', result?.code ? 409 : 503, id)
    return toPublicPrintJob(result.job)
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Print job not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not fail print job', 503, id)
  }
})

app.get('/api/internal/storage', async (req, reply) => {
  const id = requestId(req)
  if (!internalAuthorized(req)) return error(reply, 'FORBIDDEN', 'Internal key required', 403, id)
  const storage = await getStorageSnapshot()
  return { ...storage, warn: storage.bytes >= config.storageWarnBytes, warnThresholdBytes: config.storageWarnBytes, metrics: metrics.snapshot() }
})

app.get('/api/internal/photos', async (req, reply) => {
  const id = requestId(req)
  if (!internalAuthorized(req)) return error(reply, 'FORBIDDEN', 'Internal key required', 403, id)
  const since = req.query?.since ? String(req.query.since) : undefined
  const until = req.query?.until ? String(req.query.until) : undefined
  const limit = req.query?.limit ? Number(req.query.limit) : 100
  const photos = await store.listPhotos({ since, until, limit })
  return { photos, count: photos.length }
})

app.post('/api/internal/photos/:token/revoke', async (req, reply) => {
  const id = requestId(req)
  if (!internalAuthorized(req)) return error(reply, 'FORBIDDEN', 'Internal key required', 403, id)
  const token = req.params.token
  if (!isValidToken(token)) return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
  try {
    const metadata = await store.revokeByToken(token)
    return { token, status: metadata.status }
  } catch (storageError) {
    if (storageError?.code === 'ENOENT') return error(reply, 'NOT_FOUND', 'Photo not found', 404, id)
    return error(reply, 'STORAGE_UNAVAILABLE', 'Could not revoke photo', 503, id)
  }
})

app.post('/api/sessions', async (req, reply) => {
  const created = await createPhotoFromUpload(req, reply)
  if (reply.sent) return
  return toSessionShape(created)
})

app.get('/api/sessions/:token', async (req, reply) => {
  const meta = await readPhotoMeta(req, reply)
  if (reply.sent) return
  return toSessionShape(meta)
})

app.get('/api/sessions/:token/image', readPhotoImage)

  return app
}

export async function startServer({ config = loadConfig(), ...dependencies } = {}) {
  const app = await createApp({ config, ...dependencies })
  const retentionStore = dependencies.store || new PhotoStore(config.dataDir)
  await retentionStore.init()
  const retention = startRetentionJob(retentionStore, config.retentionIntervalMs, { logger: console })
  await retentionStore.recoverPendingIdempotency?.()
  await app.listen({ port: config.port, host: '0.0.0.0' })
  void retention.run().catch((error) => app.log.error({ err: error }, 'initial retention cleanup failed'))

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'shutting down')
    retention.stop()
    await app.close()
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
  console.log(`photobooth api on :${config.port}`)
  return app
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await startServer()
}
