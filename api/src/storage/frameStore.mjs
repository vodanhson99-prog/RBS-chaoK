import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { frameAssetExtension, validateFrameManifest } from '../domain/frame.mjs'
import { incrementMetric } from './metrics.mjs'

export class FrameStore {
  constructor(dataDir, { metrics } = {}) {
    this.root = path.join(dataDir, 'frames')
    this.metrics = metrics
    this.activeCache = null
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true })
  }

  frameDir(id) {
    return path.join(this.root, id)
  }

  jsonDir(id) {
    return path.join(this.frameDir(id), 'json')
  }

  metaPath(id) {
    return path.join(this.jsonDir(id), 'meta.json')
  }

  legacyMetaPath(id) {
    return path.join(this.frameDir(id), 'meta.json')
  }

  assetPath(id, key) {
    return path.join(this.frameDir(id), key)
  }

  async writeAtomic(filePath, data) {
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(tempPath, data, { flag: 'wx' })
      await fs.rename(tempPath, filePath)
    } finally {
      await fs.rm(tempPath, { force: true })
    }
  }

  async create({ manifest, bytes, contentType, thumbnailBytes, thumbnailContentType = contentType }) {
    const validation = validateFrameManifest(manifest)
    if (!validation.ok) {
      const error = new Error(validation.message)
      error.code = 'INVALID_FRAME'
      throw error
    }
    const id = validation.manifest.id
    const dir = this.frameDir(id)
    const extension = frameAssetExtension(contentType)
    const thumbnailExtension = frameAssetExtension(thumbnailContentType)
    const assetKey = `asset.${extension}`
    const thumbnailKey = `thumbnail.${thumbnailExtension}`
    const now = new Date().toISOString()
    const metadata = {
      ...validation.manifest,
      assetKey,
      thumbnailKey,
      contentType,
      thumbnailContentType,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    }

    await fs.mkdir(dir, { recursive: false })
    try {
      await fs.mkdir(this.jsonDir(id), { recursive: false })
      await this.writeAtomic(this.assetPath(id, assetKey), bytes)
      await this.writeAtomic(this.assetPath(id, thumbnailKey), thumbnailBytes || bytes)
      await this.writeAtomic(this.metaPath(id), JSON.stringify(metadata, null, 2))
      this.activeCache = null
      return metadata
    } catch (error) {
      await fs.rm(dir, { force: true, recursive: true })
      throw error
    }
  }

  async read(id) {
    incrementMetric(this.metrics, 'frame.metadataReads')
    try {
      return JSON.parse(await fs.readFile(this.metaPath(id), 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const legacyMetadata = JSON.parse(await fs.readFile(this.legacyMetaPath(id), 'utf8'))
      await fs.mkdir(this.jsonDir(id), { recursive: true })
      await this.writeAtomic(this.metaPath(id), JSON.stringify(legacyMetadata, null, 2))
      await fs.rm(this.legacyMetaPath(id), { force: true })
      return legacyMetadata
    }
  }

  async readAssetByMetadata(metadata, thumbnail = false) {
    const key = thumbnail ? metadata.thumbnailKey : metadata.assetKey
    incrementMetric(this.metrics, 'frame.assetReads')
    return { metadata, bytes: await fs.readFile(this.assetPath(metadata.id, key)) }
  }

  async readAsset(id, thumbnail = false) {
    const metadata = await this.read(id)
    return this.readAssetByMetadata(metadata, thumbnail)
  }

  async listActive() {
    if (this.activeCache) return this.activeCache
    incrementMetric(this.metrics, 'frame.directoryScans')
    const names = await fs.readdir(this.root)
    const frames = []
    for (const name of names) {
      try {
        const metadata = await this.read(name)
        if (metadata.status === 'active') frames.push(metadata)
      } catch {
        // Leave malformed frame records for operator inspection.
      }
    }
    frames.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    this.activeCache = frames
    return frames
  }

  invalidateCache() {
    this.activeCache = null
  }

  async archive(id) {
    const metadata = await this.read(id)
    const updated = { ...metadata, status: 'archived', updatedAt: new Date().toISOString() }
    await fs.mkdir(this.jsonDir(id), { recursive: true })
    await this.writeAtomic(this.metaPath(id), JSON.stringify(updated, null, 2))
    this.invalidateCache()
    return updated
  }
}
