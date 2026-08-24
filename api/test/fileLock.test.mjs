import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { withFileLock } from '../src/storage/fileLock.mjs'
import { IDEMPOTENCY_PENDING_TTL_MS, PhotoStore } from '../src/storage/photoStore.mjs'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

test('stale file locks are reclaimed and released after callback failure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-lock-'))
  const lockPath = path.join(dir, 'job.lock')
  await fs.writeFile(lockPath, '')
  const staleAt = new Date(Date.now() - 60_000)
  await fs.utimes(lockPath, staleAt, staleAt)

  await assert.rejects(() => withFileLock(lockPath, async () => { throw new Error('callback failed') }, { waitMs: 100, staleMs: 10 }), /callback failed/)
  await assert.rejects(fs.stat(lockPath), { code: 'ENOENT' })
})

test('expired pending idempotency reservations are recovered without creating a photo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-pending-'))
  const store = new PhotoStore(dir)
  await store.init()
  const key = 'pending-key-123456'
  const photoId = 'orphan-photo'
  const reservationPath = store.idempotencyPath(key)
  const createdAt = new Date(Date.now() - IDEMPOTENCY_PENDING_TTL_MS - 1).toISOString()
  await fs.writeFile(reservationPath, JSON.stringify({ photoId, createdAt, status: 'pending' }))

  assert.equal(await store.recoverPendingIdempotency(), 1)
  await assert.rejects(fs.stat(reservationPath), { code: 'ENOENT' })
  const metadata = await store.createPhoto({ bytes: jpeg, contentType: 'image/jpeg', frameId: 'blue', frameVersion: 1, captureMode: 'gesture-s', boothId: null, eventId: null, storedUntilMs: 60_000, qrExpiresMs: 60_000, idempotencyKey: key })
  assert.equal((await store.listPhotos()).length, 1)
  assert.equal((await store.readIdempotency(key)).photoId, metadata.id)
})
