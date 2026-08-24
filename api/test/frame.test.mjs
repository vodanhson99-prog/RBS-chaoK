import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { validateFrameAsset, validateFrameManifest } from '../src/domain/frame.mjs'
import { FrameStore } from '../src/storage/frameStore.mjs'

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#111"/></svg>')

function manifest(overrides = {}) {
  return {
    id: 'test-frame',
    version: 1,
    name: 'Test frame',
    kind: 'strip6',
    output: { width: 640, height: 360, mimeType: 'image/jpeg' },
    slots: [{ x: 32, y: 32, w: 160, h: 120 }],
    ...overrides,
  }
}

test('validates frame manifests and SVG artwork', () => {
  assert.equal(validateFrameManifest(manifest()).ok, true)
  assert.equal(validateFrameManifest(manifest({ id: '../escape' })).ok, false)
  assert.equal(validateFrameManifest(manifest({ slots: [{ x: 0, y: 0, w: 700, h: 10 }] })).ok, false)
  assert.equal(validateFrameAsset(svg, 'image/svg+xml', 1024).ok, true)
  assert.equal(validateFrameAsset(Buffer.from('<script>bad</script>'), 'image/svg+xml', 1024).ok, false)
})

test('FrameStore persists, lists, and archives custom frames', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-frame-'))
  const store = new FrameStore(dir)
  await store.init()
  const saved = await store.create({ manifest: manifest(), bytes: svg, contentType: 'image/svg+xml' })
  assert.equal(saved.status, 'active')
  assert.equal((await store.listActive()).length, 1)
  const asset = await store.readAsset('test-frame')
  assert.equal(asset.bytes.toString(), svg.toString())
  const archived = await store.archive('test-frame')
  assert.equal(archived.status, 'archived')
  assert.equal((await store.listActive()).length, 0)
  assert.equal((await store.read('test-frame')).status, 'archived')
})
