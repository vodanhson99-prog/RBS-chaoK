import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { validateFrameAsset, validateFrameManifest } from '../src/domain/frame.mjs'
import { FrameStore } from '../src/storage/frameStore.mjs'

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#111"/></svg>')

function stripSlots(count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    x: 32 + (index % 3) * 192,
    y: 32 + Math.floor(index / 3) * 152,
    w: 160,
    h: 120,
  }))
}

function manifest(overrides = {}) {
  return {
    id: 'test-frame',
    version: 1,
    name: 'Test frame',
    kind: 'strip6',
    output: { width: 640, height: 360, mimeType: 'image/jpeg' },
    slots: stripSlots(),
    ...overrides,
  }
}

function customSlots(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    x: 20 + (index % 5) * 120,
    y: 20 + Math.floor(index / 5) * 60,
    w: 100,
    h: 40,
  }))
}

test('validates frame manifests and SVG artwork', () => {
  assert.equal(validateFrameManifest(manifest()).ok, true)
  assert.equal(validateFrameManifest(manifest({ id: '../escape' })).ok, false)
  assert.equal(validateFrameManifest(manifest({ slots: stripSlots(5) })).ok, false)
  assert.equal(validateFrameManifest(manifest({ slots: stripSlots(7) })).ok, false)
  assert.equal(validateFrameManifest(manifest({ slots: [{ x: 0, y: 0, w: 700, h: 10 }] })).ok, false)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'single', slots: stripSlots(2) }).ok, false)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: customSlots() }).ok, true)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: customSlots(25) }).ok, true)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: [] }).ok, false)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: [{ x: 120, y: 80, w: 240, h: 120, rotation: 30 }] }).ok, true)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: [{ x: 0, y: 0, w: 240, h: 120, rotation: 45 }] }).ok, false)
  assert.equal(validateFrameManifest({ ...manifest(), kind: 'custom', slots: [{ x: 120, y: 80, w: 240, h: 120, rotation: 390 }] }).manifest.slots[0].rotation, 30)
  assert.equal(validateFrameAsset(svg, 'image/svg+xml', 1024).ok, true)
  assert.equal(validateFrameAsset(Buffer.from('<script>bad</script>'), 'image/svg+xml', 1024).ok, false)
})

test('FrameStore persists, lists, and archives custom frames', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-frame-'))
  const store = new FrameStore(dir)
  await store.init()
  const saved = await store.create({ manifest: manifest(), bytes: svg, contentType: 'image/svg+xml' })
  assert.equal(saved.status, 'active')
  assert.deepEqual(await fs.readdir(path.join(dir, 'frames', 'test-frame', 'json')), ['meta.json'])
  assert.equal((await store.listActive()).length, 1)
  const asset = await store.readAsset('test-frame')
  assert.equal(asset.bytes.toString(), svg.toString())
  const archived = await store.archive('test-frame')
  assert.equal(archived.status, 'archived')
  assert.equal((await store.listActive()).length, 0)
  assert.equal((await store.read('test-frame')).status, 'archived')
  assert.equal((await fs.readFile(path.join(dir, 'frames', 'test-frame', 'json', 'meta.json'), 'utf8')).includes('"status": "archived"'), true)
})
