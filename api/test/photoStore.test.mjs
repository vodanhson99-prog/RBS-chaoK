import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createPhotoRecord, isPhotoAccessible, toPublicPhoto } from '../src/domain/photo.mjs'
import { PhotoStore } from '../src/storage/photoStore.mjs'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

test('createPhotoRecord separates internal id from public token', () => {
  const record = createPhotoRecord({
    bytes: 1024,
    contentType: 'image/jpeg',
    frameId: 'blue',
    frameVersion: 2,
    captureMode: 'gesture-s',
    boothId: 'booth-a',
    eventId: null,
    storedUntilMs: 90 * 24 * 60 * 60 * 1000,
    qrExpiresMs: 48 * 60 * 60 * 1000,
  })
  assert.notEqual(record.id, record.token)
  assert.equal(record.status, 'private')
  assert.equal(record.frameId, 'blue')
})

test('PhotoStore saves, reads, and purges photos by retention', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-photo-'))
  const store = new PhotoStore(dir)
  await store.init()
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

  const metadata = await store.createPhoto({
    bytes: jpeg,
    contentType: 'image/jpeg',
    frameId: 'woozi',
    frameVersion: 1,
    captureMode: 'gesture-s',
    boothId: null,
    eventId: null,
    storedUntilMs: 60_000,
    qrExpiresMs: 60_000,
  })

  const loaded = await store.readMetadataByToken(metadata.token)
  assert.equal(loaded.id, metadata.id)
  assert.equal(loaded.token, metadata.token)

  const image = await store.readImageByToken(metadata.token)
  assert.equal(image.length, jpeg.length)

  const edit = await store.saveEdit(metadata.token, { stickers: [] })
  assert.ok(edit.id)
  const latest = await store.readLatestEdit(metadata.token)
  assert.deepEqual(latest.recipe, { stickers: [] })

  const renderedEdit = await store.saveEdit(metadata.token, {
    stickers: [{ id: 'a', stickerId: 'star', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1 }],
  }, jpeg)
  assert.ok(renderedEdit.renderedAssetKey)
  const afterRender = await store.readMetadataByToken(metadata.token)
  assert.match(afterRender.currentAssetKey, /^rendered-/)

  const publicPhoto = toPublicPhoto(loaded, 'http://localhost:5173')
  assert.match(publicPhoto.imageUrl, /^\/api\/photos\//)
  assert.equal(isPhotoAccessible(loaded), true)

  metadata.storedUntil = new Date(Date.now() - 1000).toISOString()
  await fs.writeFile(store.metaPath(metadata.id), JSON.stringify(metadata))
  const purge = await store.purgeExpired()
  assert.equal(purge.removed, 1)
})

test('consistency scan reports orphan token, missing asset, malformed metadata, and stale idempotency', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-consistency-'))
  const store = new PhotoStore(dir)
  await store.init()
  const metadata = await store.createPhoto({
    bytes: jpeg,
    contentType: 'image/jpeg',
    frameId: 'blue',
    frameVersion: 1,
    captureMode: 'gesture-s',
    boothId: null,
    eventId: null,
    storedUntilMs: 60_000,
    qrExpiresMs: 60_000,
    idempotencyKey: 'consistency-key-123',
  })

  await fs.rm(store.assetPath(metadata.id, metadata.originalAssetKey))
  await fs.writeFile(path.join(store.tokensDir, 'orphan-token.json'), JSON.stringify({ photoId: 'missing-photo' }))
  await fs.mkdir(path.join(store.photosDir, 'malformed-photo'), { recursive: true })
  await fs.writeFile(path.join(store.photosDir, 'malformed-photo', 'meta.json'), '{bad')
  await fs.writeFile(store.idempotencyPath('stale-key-123'), JSON.stringify({
    photoId: 'missing-photo',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    status: 'pending',
  }))

  const report = await store.scanConsistency({ repair: false })
  assert.ok(report.quarantined.some((item) => item.code === 'MISSING_PHOTO_ASSET'))
  assert.ok(report.quarantined.some((item) => item.code === 'ORPHAN_TOKEN_INDEX'))
  assert.ok(report.quarantined.some((item) => item.code === 'MALFORMED_PHOTO_METADATA' || item.code === 'AMBIGUOUS_PHOTO_METADATA'))
  assert.ok(report.skipped.some((item) => item.code === 'STALE_PENDING_IDEMPOTENCY'))
})

test('consistency repair is deterministic and idempotent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-repair-'))
  const store = new PhotoStore(dir)
  await store.init()
  const metadata = await store.createPhoto({
    bytes: jpeg,
    contentType: 'image/jpeg',
    frameId: 'blue',
    frameVersion: 1,
    captureMode: 'gesture-s',
    boothId: null,
    eventId: null,
    storedUntilMs: 60_000,
    qrExpiresMs: 60_000,
    idempotencyKey: 'repair-key-123',
  })
  const key = 'repair-pending-123'
  await fs.writeFile(store.idempotencyPath(key), JSON.stringify({
    photoId: metadata.id,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    status: 'pending',
  }))

  const first = await store.scanConsistency({ repair: true })
  const second = await store.scanConsistency({ repair: true })
  assert.ok(first.repaired.some((item) => item.code === 'STALE_PENDING_IDEMPOTENCY'))
  assert.equal(second.repaired.length, 0)
  assert.equal((await store.readIdempotency(key)).status, 'complete')
})

test('purge continues after malformed retention records', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-retention-corrupt-'))
  const store = new PhotoStore(dir)
  await store.init()
  await fs.writeFile(path.join(store.tokensDir, 'bad-token.json'), '{bad')
  const metadata = await store.createPhoto({
    bytes: jpeg,
    contentType: 'image/jpeg',
    frameId: 'blue',
    frameVersion: 1,
    captureMode: 'gesture-s',
    boothId: null,
    eventId: null,
    storedUntilMs: -1,
    qrExpiresMs: 60_000,
  })
  const purge = await store.purgeExpired()
  assert.equal(purge.removed, 1)
  assert.equal(purge.anomalies.length, 1)
  await assert.rejects(store.readMetadataById(metadata.id), { code: 'ENOENT' })
})
