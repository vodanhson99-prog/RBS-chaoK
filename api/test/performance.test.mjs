import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../server.mjs'
import { loadConfig } from '../src/config/env.mjs'
import { PhotoStore } from '../src/storage/photoStore.mjs'
import { FrameStore } from '../src/storage/frameStore.mjs'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

async function createTestApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-performance-'))
  const config = loadConfig({
    NODE_ENV: 'test',
    PHOTO_DATA_DIR: dataDir,
    PRINT_WORKER_SECRET: 'worker-secret',
    INTERNAL_API_KEY: 'internal-key',
    PAYMENT_MODE: 'mock',
  })
  const app = await createApp({ config })
  return { app, dataDir }
}

test('readiness reuses storage metrics during its refresh window', async (t) => {
  const { app } = await createTestApp()
  t.after(() => app.close())

  const first = await app.inject({ method: 'GET', url: '/readyz' })
  const second = await app.inject({ method: 'GET', url: '/readyz' })
  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)

  const storage = await app.inject({ method: 'GET', url: '/api/internal/storage', headers: { 'x-internal-key': 'internal-key' } })
  assert.equal(storage.statusCode, 200)
  assert.ok(storage.json().metrics['storage.directoryScans'] > 0)
  assert.ok(storage.json().metrics['storage.directoryScans'] < 8)
})

test('frame list cache avoids rescanning unchanged frame directories and invalidates writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-frame-cache-'))
  const store = new FrameStore(dir)
  await store.init()
  const metrics = { values: new Map(), increment(name) { this.values.set(name, (this.values.get(name) || 0) + 1) } }
  const cached = new FrameStore(dir, { metrics })
  await cached.init()
  assert.deepEqual(await cached.listActive(), [])
  assert.deepEqual(await cached.listActive(), [])
  assert.equal(metrics.values.get('frame.directoryScans'), 1)

  await cached.create({
    manifest: { id: 'custom', name: 'Custom', version: 1, kind: 'single', output: { width: 640, height: 480 }, slots: [{ x: 0, y: 0, w: 640, h: 480 }] },
    bytes: Buffer.from('<svg></svg>'),
    contentType: 'image/svg+xml',
  })
  assert.equal((await cached.listActive()).length, 1)
  assert.equal(metrics.values.get('frame.directoryScans'), 2)
})

test('photo image retrieval uses metadata already loaded by the route', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-photo-hot-path-'))
  const metrics = { values: new Map(), increment(name) { this.values.set(name, (this.values.get(name) || 0) + 1) } }
  const store = new PhotoStore(dir, { metrics })
  await store.init()
  const metadata = await store.createPhoto({ bytes: jpeg, contentType: 'image/jpeg', frameId: 'blue', frameVersion: 1, captureMode: 'gesture-s', boothId: null, eventId: null, storedUntilMs: 60_000, qrExpiresMs: 60_000 })
  const loaded = await store.readMetadataByToken(metadata.token)
  await store.readImageByMetadata(loaded)
  assert.equal(metrics.values.get('photo.metadataReads'), 1)
  assert.equal(metrics.values.get('photo.imageReads'), 1)
})
