import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PhotoStore } from '../src/storage/photoStore.mjs'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)])

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-upload-idempotency-'))
  const store = new PhotoStore(dir)
  await store.init()
  return store
}

function photoInput(idempotencyKey) {
  return {
    bytes: jpeg,
    contentType: 'image/jpeg',
    frameId: 'blue',
    frameVersion: 1,
    captureMode: 'gesture-s',
    boothId: 'booth-a',
    eventId: null,
    storedUntilMs: 60_000,
    qrExpiresMs: 60_000,
    idempotencyKey,
  }
}

test('same idempotency key returns the same photo without duplicating files', async () => {
  const store = await setup()
  const first = await store.createPhoto(photoInput('upload-key-123456'))
  const second = await store.createPhoto(photoInput('upload-key-123456'))
  assert.equal(second.id, first.id)
  assert.equal(second.token, first.token)
  assert.equal((await store.listPhotos()).length, 1)
})

test('different idempotency keys create different photos', async () => {
  const store = await setup()
  const first = await store.createPhoto(photoInput('upload-key-123456-a'))
  const second = await store.createPhoto(photoInput('upload-key-123456-b'))
  assert.notEqual(second.id, first.id)
  assert.notEqual(second.token, first.token)
  assert.equal((await store.listPhotos()).length, 2)
})

test('concurrent duplicate requests converge on one logical result', async () => {
  const store = await setup()
  const results = await Promise.all([
    store.createPhoto(photoInput('upload-key-concurrent')),
    store.createPhoto(photoInput('upload-key-concurrent')),
  ])
  assert.equal(results[0].id, results[1].id)
  assert.equal(results[0].token, results[1].token)
  assert.equal((await store.listPhotos()).length, 1)
  const record = await store.readIdempotency('upload-key-concurrent')
  assert.equal(record.photoId, results[0].id)
})
