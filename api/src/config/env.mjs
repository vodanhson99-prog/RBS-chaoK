import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

function positiveInt(value, fallback) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function csv(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const UNSAFE_PRODUCTION_DEFAULTS = {
  PRINT_WORKER_SECRET: 'dev-print-worker',
  INTERNAL_API_KEY: 'dev-internal-key',
}

export function loadConfig(env = process.env) {
  const webBaseUrl = env.PUBLIC_WEB_BASE_URL || env.PUBLIC_BASE_URL || ''
  if (webBaseUrl && !/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(webBaseUrl)) {
    throw new Error('PUBLIC_WEB_BASE_URL must be an absolute http(s) URL')
  }

  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase()
  const paymentMode = env.PAYMENT_MODE === 'webhook' ? 'webhook' : 'mock'
  if (nodeEnv === 'production') {
    for (const [name, unsafeValue] of Object.entries(UNSAFE_PRODUCTION_DEFAULTS)) {
      const value = String(env[name] || '').trim()
      if (!value) throw new Error(`${name} is required in production`)
      if (value === unsafeValue) {
        throw new Error(`${name} must not use the development default in production`)
      }
    }
    if (paymentMode === 'mock') {
      throw new Error('PAYMENT_MODE=mock is not allowed in production; configure a verified payment provider')
    }
    if (!String(env.PAYMENT_WEBHOOK_KEY || '').trim()) {
      throw new Error('PAYMENT_WEBHOOK_KEY is required in production until provider signature verification is configured')
    }
  }

  return {
    root: path.resolve(ROOT, '../..'),
    dataDir: path.resolve(env.PHOTO_DATA_DIR || env.SESSION_DATA_DIR || path.join(ROOT, '..', 'data')),
    port: positiveInt(env.PORT, 8787),
    sessionTtlMs: positiveInt(env.SESSION_TTL_HOURS, 48) * 60 * 60 * 1000,
    photoRetentionMs: positiveInt(env.PHOTO_RETENTION_DAYS, 90) * 24 * 60 * 60 * 1000,
    qrAccessTtlMs: positiveInt(env.QR_ACCESS_TTL_HOURS, env.SESSION_TTL_HOURS || 48) * 60 * 60 * 1000,
    maxBytes: positiveInt(env.MAX_UPLOAD_BYTES, 12 * 1024 * 1024),
    maxConcurrentUploads: positiveInt(env.MAX_CONCURRENT_UPLOADS, 4),
    printClaimLeaseMs: positiveInt(env.PRINT_CLAIM_LEASE_MS, 2 * 60 * 1000),
    rateLimitWindowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: positiveInt(env.RATE_LIMIT_MAX, 30),
    webBaseUrl: webBaseUrl.replace(/\/$/, ''),
    corsOrigins: csv(env.CORS_ORIGINS, 'http://localhost:5173,http://127.0.0.1:5173'),
    retentionIntervalMs: positiveInt(env.RETENTION_INTERVAL_MS, 15 * 60 * 1000),
    defaultTemplateId: (env.DEFAULT_TEMPLATE_ID || 'blue').trim(),
    defaultTemplateVersion: positiveInt(env.DEFAULT_TEMPLATE_VERSION, 1),
    captureMode: (env.CAPTURE_MODE || 'gesture-s').trim(),
    gestureHoldMs: positiveInt(env.GESTURE_HOLD_MS, 950),
    countdownSeconds: positiveInt(env.COUNTDOWN_SECONDS, 3),
    poseGraceMs: positiveInt(env.POSE_GRACE_MS, 2500),
    gestureMinConfidence: clampFloat(env.GESTURE_MIN_CONFIDENCE, 0.78, 0.05, 0.98),
    gestureConsecutiveFrames: positiveInt(env.GESTURE_CONSECUTIVE_FRAMES, 4),
    showFrameLibrary: env.SHOW_FRAME_LIBRARY === '1' || env.SHOW_FRAME_LIBRARY === 'true',
    printCurrency: (env.PRINT_CURRENCY || 'VND').trim(),
    printPrice4x6: positiveInt(env.PRINT_PRICE_4X6, 50_000),
    printPrice6x8: positiveInt(env.PRINT_PRICE_6X8, 80_000),
    paymentMode,
    paymentWebhookKey: (env.PAYMENT_WEBHOOK_KEY || '').trim(),
    nodeEnv,
    printWorkerSecret: (env.PRINT_WORKER_SECRET || 'dev-print-worker').trim(),
    internalApiKey: (env.INTERNAL_API_KEY || 'dev-internal-key').trim(),
    storageWarnBytes: positiveInt(env.STORAGE_WARN_BYTES, 5 * 1024 * 1024 * 1024),
  }
}
