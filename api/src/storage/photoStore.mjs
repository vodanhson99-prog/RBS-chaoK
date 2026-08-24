import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditRecord, createPhotoRecord } from '../domain/photo.mjs'
import { incrementMetric } from './metrics.mjs'
import { withFileLock } from './fileLock.mjs'

export const IDEMPOTENCY_PENDING_TTL_MS = 30_000

const PHOTO_ID_PATTERN = /^[a-f0-9-]{36}$/i
const EDIT_FILE_PATTERN = /^([a-f0-9-]{36})\.json$/i
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{8,128}$/

function issue(code, path, message, details = {}) {
  return { code, path, message, ...details }
}

function isRegularJsonFile(name) {
  return typeof name === 'string' && name.endsWith('.json')
}

export class PhotoStore {
  constructor(dataDir, { metrics } = {}) {
    this.root = dataDir
    this.metrics = metrics
    this.photosDir = path.join(dataDir, 'photos')
    this.tokensDir = path.join(dataDir, 'tokens')
    this.editsDir = path.join(dataDir, 'edits')
    this.idempotencyDir = path.join(dataDir, 'idempotency')
  }

  async init() {
    await Promise.all([
      fs.mkdir(this.photosDir, { recursive: true }),
      fs.mkdir(this.tokensDir, { recursive: true }),
      fs.mkdir(this.editsDir, { recursive: true }),
      fs.mkdir(this.idempotencyDir, { recursive: true }),
    ])
  }

  photoDir(photoId) {
    return path.join(this.photosDir, photoId)
  }

  metaPath(photoId) {
    return path.join(this.photoDir(photoId), 'meta.json')
  }

  assetPath(photoId, assetKey) {
    return path.join(this.photoDir(photoId), assetKey)
  }

  tokenIndexPath(token) {
    return path.join(this.tokensDir, `${token}.json`)
  }

  idempotencyPath(key) {
    return path.join(this.idempotencyDir, `${key}.json`)
  }

  editDir(photoId) {
    return path.join(this.editsDir, photoId)
  }

  async writeAtomic(filePath, data, flag = 'wx') {
    const tempPath = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(tempPath, data, { flag })
    await fs.rename(tempPath, filePath)
  }

  async readIdempotency(key) {
    try {
      return JSON.parse(await fs.readFile(this.idempotencyPath(key), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async recoverPendingIdempotency(now = Date.now()) {
    incrementMetric(this.metrics, 'photo.idempotencyScans')
    const names = await fs.readdir(this.idempotencyDir)
    let removed = 0
    for (const name of names.filter(isRegularJsonFile)) {
      const key = name.slice(0, -'.json'.length)
      let record
      try {
        record = await this.readIdempotency(key)
      } catch {
        continue
      }
      if (record?.status !== 'pending') continue
      await this.withIdempotencyLock(key, async () => {
        const current = await this.readIdempotency(key)
        if (current?.status !== 'pending') return
        const createdAt = Date.parse(current.createdAt || '')
        if (!Number.isFinite(createdAt) || createdAt + IDEMPOTENCY_PENDING_TTL_MS > now) return
        const metadata = await this.readCompletePhoto(current.photoId)
        if (metadata) {
          await this.writeAtomic(
            this.idempotencyPath(key),
            JSON.stringify({ photoId: metadata.id, createdAt: metadata.createdAt, status: 'complete' }),
            'w',
          )
          return
        }
        await fs.rm(this.idempotencyPath(key), { force: true })
        removed += 1
      })
    }
    return removed
  }

  async scanConsistency({ now = Date.now(), includeHealthy = false, repair = false } = {}) {
    const report = {
      scanned: 0,
      healthy: 0,
      repaired: [],
      quarantined: [],
      skipped: [],
      errors: [],
    }
    const seenPhotoIds = new Set()
    const addIssue = (bucket, item) => {
      report[bucket].push(item)
      report.scanned += 1
    }

    let photoNames = []
    let tokenNames = []
    let editNames = []
    let idempotencyNames = []
    try {
      photoNames = await fs.readdir(this.photosDir, { withFileTypes: true })
      tokenNames = await fs.readdir(this.tokensDir)
      editNames = await fs.readdir(this.editsDir, { withFileTypes: true })
      idempotencyNames = await fs.readdir(this.idempotencyDir)
    } catch (error) {
      report.errors.push(issue('SCAN_FAILED', this.root, 'Could not enumerate photo storage', { error: error.message }))
      return report
    }

    for (const entry of photoNames) {
      if (!entry.isDirectory()) {
        addIssue('skipped', issue('UNKNOWN_PHOTO_ENTRY', path.join(this.photosDir, entry.name), 'Unknown photo storage entry'))
        continue
      }
      const photoId = entry.name
      const metadataPath = this.metaPath(photoId)
      let metadata
      try {
        metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
      } catch (error) {
        addIssue('quarantined', issue(
          error?.code === 'ENOENT' ? 'MISSING_PHOTO_METADATA' : 'MALFORMED_PHOTO_METADATA',
          metadataPath,
          error?.code === 'ENOENT' ? 'Photo directory has no metadata' : 'Photo metadata is not valid JSON',
        ))
        continue
      }
      if (metadata.id !== photoId || !PHOTO_ID_PATTERN.test(photoId) || typeof metadata.token !== 'string') {
        addIssue('quarantined', issue('AMBIGUOUS_PHOTO_METADATA', metadataPath, 'Photo metadata identity is inconsistent'))
        continue
      }
      seenPhotoIds.add(photoId)
      const assetKeys = [metadata.originalAssetKey, metadata.currentAssetKey].filter(Boolean)
      let healthy = true
      for (const assetKey of new Set(assetKeys)) {
        try {
          await fs.access(this.assetPath(photoId, assetKey))
        } catch (error) {
          healthy = false
          addIssue('quarantined', issue('MISSING_PHOTO_ASSET', this.assetPath(photoId, assetKey), 'Photo metadata references a missing asset', { photoId, assetKey }))
        }
      }
      const tokenPath = this.tokenIndexPath(metadata.token)
      try {
        const tokenIndex = JSON.parse(await fs.readFile(tokenPath, 'utf8'))
        if (tokenIndex.photoId !== photoId) {
          healthy = false
          addIssue('quarantined', issue('STALE_TOKEN_INDEX', tokenPath, 'Token index points to another photo', { photoId, token: metadata.token }))
        }
      } catch (error) {
        healthy = false
        addIssue('quarantined', issue(error?.code === 'ENOENT' ? 'MISSING_TOKEN_INDEX' : 'MALFORMED_TOKEN_INDEX', tokenPath, 'Photo token index is missing or malformed', { photoId, token: metadata.token }))
      }
      const photoEditsDir = this.editDir(photoId)
      try {
        const edits = await fs.readdir(photoEditsDir)
        for (const editName of edits) {
          if (!EDIT_FILE_PATTERN.test(editName)) {
            addIssue('skipped', issue('UNKNOWN_EDIT_ENTRY', path.join(photoEditsDir, editName), 'Unknown edit entry'))
            continue
          }
          const editPath = path.join(photoEditsDir, editName)
          try {
            const edit = JSON.parse(await fs.readFile(editPath, 'utf8'))
            if (edit.photoId !== photoId) {
              addIssue('quarantined', issue('ORPHAN_EDIT', editPath, 'Edit references another photo', { photoId }))
              continue
            }
            if (edit.renderedAssetKey) {
              await fs.access(this.assetPath(photoId, edit.renderedAssetKey))
            }
          } catch (error) {
            addIssue('quarantined', issue('MALFORMED_EDIT', editPath, 'Edit record is malformed or references a missing asset', { photoId }))
          }
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') addIssue('errors', issue('EDIT_SCAN_FAILED', photoEditsDir, 'Could not scan photo edits', { error: error.message }))
      }
      if (healthy) {
        report.healthy += 1
        if (includeHealthy) addIssue('skipped', issue('HEALTHY_PHOTO', metadataPath, 'Photo relationship is healthy', { photoId }))
      }
    }

    for (const name of tokenNames.filter(isRegularJsonFile)) {
      const token = name.slice(0, -5)
      const tokenPath = path.join(this.tokensDir, name)
      try {
        const index = JSON.parse(await fs.readFile(tokenPath, 'utf8'))
        if (!seenPhotoIds.has(index.photoId)) {
          addIssue('quarantined', issue('ORPHAN_TOKEN_INDEX', tokenPath, 'Token index points to a missing photo', { token, photoId: index.photoId }))
        }
      } catch (error) {
        addIssue('quarantined', issue('MALFORMED_TOKEN_INDEX', tokenPath, 'Token index is not valid JSON'))
      }
    }

    for (const entry of editNames) {
      if (!entry.isDirectory() || seenPhotoIds.has(entry.name)) continue
      addIssue('quarantined', issue('ORPHAN_EDIT_DIRECTORY', path.join(this.editsDir, entry.name), 'Edit directory has no matching photo'))
    }

    for (const name of idempotencyNames.filter(isRegularJsonFile)) {
      const key = name.slice(0, -5)
      const recordPath = this.idempotencyPath(key)
      let record
      try {
        record = JSON.parse(await fs.readFile(recordPath, 'utf8'))
      } catch {
        addIssue('quarantined', issue('MALFORMED_IDEMPOTENCY', recordPath, 'Idempotency record is not valid JSON'))
        continue
      }
      if (!IDEMPOTENCY_KEY_PATTERN.test(key) || !record || typeof record.photoId !== 'string') {
        addIssue('quarantined', issue('AMBIGUOUS_IDEMPOTENCY', recordPath, 'Idempotency record identity is invalid'))
        continue
      }
      if (record.status === 'pending') {
        const createdAt = Date.parse(record.createdAt || '')
        if (!Number.isFinite(createdAt) || createdAt + IDEMPOTENCY_PENDING_TTL_MS <= now) {
          const metadata = seenPhotoIds.has(record.photoId) ? await this.readCompletePhoto(record.photoId) : null
          if (metadata) {
            if (repair) {
              await this.withIdempotencyLock(key, async () => {
                const current = await this.readIdempotency(key)
                if (current?.status !== 'pending') return
                await this.writeAtomic(recordPath, JSON.stringify({ photoId: metadata.id, createdAt: metadata.createdAt, status: 'complete' }), 'w')
              })
              addIssue('repaired', issue('STALE_PENDING_IDEMPOTENCY', recordPath, 'Completed stale reservation from existing photo', { photoId: metadata.id }))
            } else {
              addIssue('skipped', issue('STALE_PENDING_IDEMPOTENCY', recordPath, 'Stale reservation can be repaired from existing photo', { photoId: record.photoId }))
            }
          } else if (repair) {
            await this.withIdempotencyLock(key, async () => {
              const current = await this.readIdempotency(key)
              if (current?.status === 'pending') await fs.rm(recordPath, { force: true })
            })
            addIssue('repaired', issue('STALE_PENDING_IDEMPOTENCY', recordPath, 'Removed stale reservation with no photo', { photoId: record.photoId }))
          } else {
            addIssue('skipped', issue('STALE_PENDING_IDEMPOTENCY', recordPath, 'Stale reservation has no matching photo', { photoId: record.photoId }))
          }
        }
      } else if (record.status !== 'complete' || !seenPhotoIds.has(record.photoId)) {
        addIssue('quarantined', issue('INVALID_IDEMPOTENCY_REFERENCE', recordPath, 'Idempotency record does not reference a valid photo', { photoId: record.photoId }))
      }
    }

    return report
  }

  async waitForIdempotency(key, attempts = 20) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const existing = await this.readIdempotency(key)
      if (existing) return existing
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    return null
  }

  async reserveIdempotency(key, metadata) {
    const reservationPath = this.idempotencyPath(key)
    try {
      await fs.writeFile(reservationPath, JSON.stringify({ photoId: metadata.id, createdAt: metadata.createdAt, status: 'pending' }), { flag: 'wx' })
      return true
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      return false
    }
  }

  async withIdempotencyLock(key, callback) {
    return withFileLock(`${this.idempotencyPath(key)}.lock`, callback)
  }

  async createPhoto({ bytes, contentType, frameId, frameVersion, captureMode, boothId, eventId, storedUntilMs, qrExpiresMs, idempotencyKey }) {
    if (!idempotencyKey) return this.createPhotoRecord({ bytes, contentType, frameId, frameVersion, captureMode, boothId, eventId, storedUntilMs, qrExpiresMs })
    return this.withIdempotencyLock(idempotencyKey, async () => {
      const existing = await this.readIdempotency(idempotencyKey)
      if (existing && existing.status !== 'pending') return this.readMetadataById(existing.photoId)
      if (existing?.status === 'pending') {
        const createdAt = Date.parse(existing.createdAt || '')
        if (Number.isFinite(createdAt) && createdAt + IDEMPOTENCY_PENDING_TTL_MS > Date.now()) {
          const completed = await this.waitForIdempotency(idempotencyKey)
          if (completed && completed.status !== 'pending') return this.readMetadataById(completed.photoId)
          throw new Error('Idempotency reservation did not complete')
        }
        await fs.rm(this.idempotencyPath(idempotencyKey), { force: true })
      }
      return this.createPhotoRecord({ bytes, contentType, frameId, frameVersion, captureMode, boothId, eventId, storedUntilMs, qrExpiresMs, idempotencyKey })
    })
  }

  async createPhotoRecord({ bytes, contentType, frameId, frameVersion, captureMode, boothId, eventId, storedUntilMs, qrExpiresMs, idempotencyKey }) {
    const metadata = createPhotoRecord({
      id: idempotencyKey ? randomUUID() : undefined,
      bytes: bytes.length,
      contentType,
      frameId,
      frameVersion,
      captureMode,
      boothId,
      eventId,
      storedUntilMs,
      qrExpiresMs,
    })
    const dir = this.photoDir(metadata.id)
    const imagePath = this.assetPath(metadata.id, metadata.originalAssetKey)
    const metaPath = this.metaPath(metadata.id)
    const tokenPath = this.tokenIndexPath(metadata.token)

    await fs.mkdir(dir, { recursive: true })
    const tempImage = `${imagePath}.${process.pid}.tmp`
    const tempMeta = `${metaPath}.${process.pid}.tmp`
    const tempToken = `${tokenPath}.${process.pid}.tmp`
    const idempotencyPath = idempotencyKey ? this.idempotencyPath(idempotencyKey) : null
    const tempIdempotency = idempotencyPath ? `${idempotencyPath}.${process.pid}.tmp` : null

    if (idempotencyKey && !(await this.reserveIdempotency(idempotencyKey, metadata))) {
      await fs.rm(dir, { force: true, recursive: true })
      const existing = await this.waitForIdempotency(idempotencyKey)
      if (existing && existing.status !== 'pending') return this.readMetadataById(existing.photoId)
      throw new Error('Idempotency reservation did not complete')
    }

    try {
      await fs.writeFile(tempImage, bytes, { flag: 'wx' })
      await fs.writeFile(tempMeta, JSON.stringify(metadata), { flag: 'wx' })
      await fs.writeFile(tempToken, JSON.stringify({ photoId: metadata.id }), { flag: 'wx' })
      if (tempIdempotency) {
        await fs.writeFile(tempIdempotency, JSON.stringify({ photoId: metadata.id, createdAt: metadata.createdAt, status: 'complete' }), { flag: 'wx' })
      }
      await fs.rename(tempImage, imagePath)
      await fs.rename(tempMeta, metaPath)
      await fs.rename(tempToken, tokenPath)
      if (idempotencyPath && tempIdempotency) {
        await fs.rm(idempotencyPath, { force: true })
        await fs.rename(tempIdempotency, idempotencyPath)
      }
      return metadata
    } catch (error) {
      await Promise.all([
        fs.rm(tempImage, { force: true }),
        fs.rm(tempMeta, { force: true }),
        fs.rm(tempToken, { force: true }),
        tempIdempotency ? fs.rm(tempIdempotency, { force: true }) : Promise.resolve(),
        idempotencyPath ? fs.rm(idempotencyPath, { force: true }) : Promise.resolve(),
        fs.rm(dir, { force: true, recursive: true }),
      ])
      throw error
    }
  }

  async resolvePhotoId(token) {
    incrementMetric(this.metrics, 'photo.tokenIndexReads')
    const raw = await fs.readFile(this.tokenIndexPath(token), 'utf8')
    const index = JSON.parse(raw)
    return index.photoId
  }

  async readMetadataByToken(token) {
    const photoId = await this.resolvePhotoId(token)
    return this.readMetadataById(photoId)
  }

  async readMetadataById(photoId) {
    incrementMetric(this.metrics, 'photo.metadataReads')
    return JSON.parse(await fs.readFile(this.metaPath(photoId), 'utf8'))
  }

  async readCompletePhoto(photoId) {
    try {
      return await this.readMetadataById(photoId)
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async readImageByMetadata(metadata, { original = false } = {}) {
    const key = original
      ? metadata.originalAssetKey
      : metadata.currentAssetKey || metadata.originalAssetKey
    incrementMetric(this.metrics, 'photo.imageReads')
    return fs.readFile(this.assetPath(metadata.id, key))
  }

  async readImageByToken(token, { original = false } = {}) {
    const metadata = await this.readMetadataByToken(token)
    return this.readImageByMetadata(metadata, { original })
  }

  async saveEdit(token, recipe, renderedBytes = null, metadata = null) {
    metadata ||= await this.readMetadataByToken(token)
    const edit = createEditRecord({ photoId: metadata.id, recipe })
    const dir = this.editDir(metadata.id)
    await fs.mkdir(dir, { recursive: true })
    await this.writeAtomic(path.join(dir, `${edit.id}.json`), JSON.stringify(edit))

    let currentAssetKey = metadata.currentAssetKey || metadata.originalAssetKey
    if (renderedBytes && Buffer.isBuffer(renderedBytes) && renderedBytes.length > 0) {
      const renderedKey = `rendered-${edit.id}.jpg`
      const renderedPath = this.assetPath(metadata.id, renderedKey)
      const tempPath = `${renderedPath}.${process.pid}.tmp`
      await fs.writeFile(tempPath, renderedBytes, { flag: 'wx' })
      await fs.rename(tempPath, renderedPath)
      edit.renderedAssetKey = renderedKey
      currentAssetKey = renderedKey
    }

    const updated = { ...metadata, currentEditId: edit.id, currentAssetKey }
    await this.writeAtomic(this.metaPath(metadata.id), JSON.stringify(updated), 'w')
    return { ...edit, renderedAssetKey: edit.renderedAssetKey || null }
  }

  async readLatestEdit(token) {
    const metadata = await this.readMetadataByToken(token)
    if (!metadata.currentEditId) return null
    const raw = await fs.readFile(path.join(this.editDir(metadata.id), `${metadata.currentEditId}.json`), 'utf8')
    return JSON.parse(raw)
  }

  async removePhoto(photoId, token) {
    await Promise.all([
      fs.rm(this.photoDir(photoId), { force: true, recursive: true }),
      fs.rm(this.editDir(photoId), { force: true, recursive: true }),
      token ? fs.rm(this.tokenIndexPath(token), { force: true }) : Promise.resolve(),
    ])
  }

  async removeByToken(token) {
    try {
      const metadata = await this.readMetadataByToken(token)
      await this.removePhoto(metadata.id, token)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  async revokeByToken(token) {
    const metadata = await this.readMetadataByToken(token)
    const updated = { ...metadata, status: 'revoked', updatedAt: new Date().toISOString() }
    await this.writeAtomic(this.metaPath(metadata.id), JSON.stringify(updated), 'w')
    return updated
  }

  async listPhotos({ since, until, limit = 100 } = {}) {
    const tokenFiles = (await fs.readdir(this.tokensDir)).filter((name) => name.endsWith('.json'))
    const rows = []
    for (const name of tokenFiles) {
      if (rows.length >= limit) break
      try {
        const token = name.replace(/\.json$/, '')
        const metadata = await this.readMetadataByToken(token)
        const created = new Date(metadata.createdAt).getTime()
        if (since && created < new Date(since).getTime()) continue
        if (until && created > new Date(until).getTime()) continue
        rows.push({
          id: metadata.id,
          token: metadata.token,
          status: metadata.status,
          createdAt: metadata.createdAt,
          storedUntil: metadata.storedUntil,
          qrExpiresAt: metadata.qrExpiresAt,
          frameId: metadata.frameId,
          hasEdit: Boolean(metadata.currentEditId),
        })
      } catch {
        // skip corrupt records
      }
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return rows
  }

  async purgeExpired(now = Date.now()) {
    const tokenFiles = await fs.readdir(this.tokensDir)
    let removed = 0
    const anomalies = []
    for (const name of tokenFiles.filter((entry) => entry.endsWith('.json'))) {
      try {
        const token = name.replace(/\.json$/, '')
        const metadata = await this.readMetadataByToken(token)
        const storedUntil = Date.parse(metadata.storedUntil || '')
        if (!Number.isFinite(storedUntil)) {
          anomalies.push({ code: 'INVALID_RETENTION_DATE', token })
          continue
        }
        if (storedUntil < now) {
          await this.removePhoto(metadata.id, token)
          removed += 1
        }
      } catch (error) {
        anomalies.push({ code: 'RETENTION_RECORD_SKIPPED', token: name.replace(/\.json$/, ''), message: error.message })
      }
    }
    return { removed, anomalies }
  }
}
