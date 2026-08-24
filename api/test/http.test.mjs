import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../server.mjs'
import { loadConfig } from '../src/config/env.mjs'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

async function createTestApp(overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-http-'))
  const config = loadConfig({
    NODE_ENV: 'test',
    PHOTO_DATA_DIR: dataDir,
    CORS_ORIGINS: 'http://allowed.test',
    PRINT_WORKER_SECRET: 'worker-secret',
    INTERNAL_API_KEY: 'internal-key',
    PAYMENT_MODE: 'webhook',
    PAYMENT_WEBHOOK_KEY: 'test-webhook-key',
    MAX_UPLOAD_BYTES: String(1024),
    RATE_LIMIT_MAX: '2',
    ...overrides,
  })
  const app = await createApp({ config })
  return { app, config }
}

test('health, readiness, unknown route, and request IDs', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const health = await app.inject({ method: 'GET', url: '/healthz' })
  assert.equal(health.statusCode, 200)
  assert.deepEqual(health.json(), { status: 'ok' })
  assert.ok(health.headers['x-request-id'])

  const ready = await app.inject({ method: 'GET', url: '/readyz' })
  assert.equal(ready.statusCode, 200)
  assert.equal(ready.json().status, 'ready')

  const unknown = await app.inject({ method: 'GET', url: '/does-not-exist' })
  assert.equal(unknown.statusCode, 404)
  assert.ok(unknown.headers['x-request-id'])
})

test('CORS allows configured origin and rejects others', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const allowed = await app.inject({ method: 'OPTIONS', url: '/api/photos', headers: { origin: 'http://allowed.test' } })
  assert.equal(allowed.statusCode, 204)
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://allowed.test')

  const rejected = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'http://blocked.test' } })
  assert.equal(rejected.statusCode, 403)
})

test('malformed JSON returns a client error with request ID', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/photos/not-a-valid-token/edits',
    headers: { 'content-type': 'application/json' },
    payload: '{bad',
  })
  assert.ok(response.statusCode >= 400 && response.statusCode < 500)
  assert.ok(response.headers['x-request-id'])
})

test('upload validates media, rate limits clients, and supports idempotency', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const validHeaders = { 'content-type': 'image/jpeg', 'x-booth-id': 'test-booth', 'idempotency-key': 'upload-key-123456' }
  const first = await app.inject({ method: 'POST', url: '/api/photos', headers: validHeaders, payload: jpeg })
  assert.equal(first.statusCode, 200)
  const second = await app.inject({ method: 'POST', url: '/api/photos', headers: validHeaders, payload: jpeg })
  assert.equal(second.statusCode, 200)
  assert.equal(second.json().token, first.json().token)
  assert.equal((await app.inject({ method: 'GET', url: '/api/internal/photos', headers: { 'x-internal-key': 'internal-key' } })).json().count, 1)

  const limited = await app.inject({ method: 'POST', url: '/api/photos', headers: validHeaders, payload: jpeg })
  assert.equal(limited.statusCode, 429)
  assert.match(String(limited.headers['retry-after']), /^\d+$/)

  const invalid = await app.inject({ method: 'POST', url: '/api/photos', headers: { 'content-type': 'text/plain', 'x-booth-id': 'invalid-booth' }, payload: 'not image' })
  assert.equal(invalid.statusCode, 400)

  const oversized = await app.inject({ method: 'POST', url: '/api/photos', headers: { 'content-type': 'image/jpeg', 'x-booth-id': 'oversized-booth' }, payload: Buffer.alloc(2048) })
  assert.equal(oversized.statusCode, 413)

  const malformedKey = await app.inject({ method: 'POST', url: '/api/photos', headers: { ...validHeaders, 'x-booth-id': 'malformed-key-booth', 'idempotency-key': 'short' }, payload: jpeg })
  assert.equal(malformedKey.statusCode, 400)
})

test('internal and worker routes require their dedicated secrets', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  for (const headers of [{}, { 'x-internal-key': 'wrong' }]) {
    const response = await app.inject({ method: 'GET', url: '/api/internal/storage', headers })
    assert.equal(response.statusCode, 403)
  }
  const internal = await app.inject({ method: 'GET', url: '/api/internal/storage', headers: { 'x-internal-key': 'internal-key' } })
  assert.equal(internal.statusCode, 200)

  for (const headers of [{}, { 'x-worker-secret': 'wrong' }]) {
    const response = await app.inject({ method: 'GET', url: '/api/print-jobs/claim/next', headers })
    assert.equal(response.statusCode, 403)
  }
})

test('public photo access and worker media authorization', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const upload = await app.inject({ method: 'POST', url: '/api/photos', headers: { 'content-type': 'image/jpeg' }, payload: jpeg })
  assert.equal(upload.statusCode, 200)
  const photo = upload.json()
  const publicImage = await app.inject({ method: 'GET', url: `/api/photos/${photo.token}/image` })
  assert.equal(publicImage.statusCode, 200)

  const missing = await app.inject({ method: 'GET', url: '/api/photos/not-a-valid-token/image' })
  assert.equal(missing.statusCode, 404)

  const missingWorkerSecret = await app.inject({ method: 'GET', url: '/api/print-jobs/missing/media' })
  assert.equal(missingWorkerSecret.statusCode, 403)
})

test('webhook fails closed without provider verification and accepts isolated test key', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const unverified = await app.inject({
    method: 'POST',
    url: '/api/payments/webhook',
    headers: { 'content-type': 'application/json' },
    payload: { jobId: 'missing', event: 'payment.paid' },
  })
  assert.equal(unverified.statusCode, 403)

  const verifiedMissingJob = await app.inject({
    method: 'POST',
    url: '/api/payments/webhook',
    headers: { 'content-type': 'application/json', 'x-payment-webhook-key': 'test-webhook-key' },
    payload: { jobId: 'missing', event: 'payment.paid' },
  })
  assert.equal(verifiedMissingJob.statusCode, 404)
})

test('production configuration rejects development secrets and mock payments', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', INTERNAL_API_KEY: 'safe-key', PAYMENT_MODE: 'webhook', PAYMENT_WEBHOOK_KEY: 'provider-secret' }),
    /PRINT_WORKER_SECRET.*required/,
  )
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PRINT_WORKER_SECRET: 'dev-print-worker', INTERNAL_API_KEY: 'safe-key', PAYMENT_MODE: 'webhook', PAYMENT_WEBHOOK_KEY: 'provider-secret' }),
    /PRINT_WORKER_SECRET/,
  )
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PRINT_WORKER_SECRET: 'safe-worker', INTERNAL_API_KEY: 'safe-key', PAYMENT_MODE: 'mock' }),
    /PAYMENT_MODE=mock/,
  )
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PRINT_WORKER_SECRET: 'safe-worker', INTERNAL_API_KEY: 'safe-key', PAYMENT_MODE: 'webhook' }),
    /PAYMENT_WEBHOOK_KEY/,
  )
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', PRINT_WORKER_SECRET: 'safe-worker', INTERNAL_API_KEY: 'safe-key', PAYMENT_MODE: 'webhook', PAYMENT_WEBHOOK_KEY: 'provider-secret' }))
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'development', PAYMENT_MODE: 'mock' }))
})
