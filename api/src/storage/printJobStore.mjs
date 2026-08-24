import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { claimJob, isClaimable } from '../domain/printJob.mjs'
import { withFileLock } from './fileLock.mjs'
import { incrementMetric } from './metrics.mjs'

const LOCK_WAIT_MS = 5_000
const LOCK_STALE_MS = 30_000

export class PrintJobStore {
  constructor(dataDir, { metrics } = {}) {
    this.root = path.join(dataDir, 'print-jobs')
    this.metrics = metrics
    this.jobNames = null
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true })
  }

  jobPath(id) {
    return path.join(this.root, `${id}.json`)
  }

  lockPath(id) {
    return `${this.jobPath(id)}.lock`
  }

  async writeAtomic(filePath, data) {
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(data), { flag: 'wx' })
    try {
      await fs.rename(tempPath, filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true })
      throw error
    }
  }

  async withJobLock(id, callback) {
    return withFileLock(this.lockPath(id), callback, { waitMs: LOCK_WAIT_MS, staleMs: LOCK_STALE_MS })
  }

  async save(job) {
    await this.writeAtomic(this.jobPath(job.id), job)
    this.jobNames ||= new Set()
    this.jobNames.add(`${job.id}.json`)
    return job
  }

  async read(id) {
    incrementMetric(this.metrics, 'print.metadataReads')
    const raw = await fs.readFile(this.jobPath(id), 'utf8')
    return JSON.parse(raw)
  }

  async update(id, updater) {
    return this.withJobLock(id, async () => {
      const job = await this.read(id)
      const result = await updater(job)
      if (result?.ok) await this.save(result.job)
      return result
    })
  }

  async claimNext(workerId, now = Date.now()) {
    const candidates = await this.listClaimable(1, now)
    for (const candidate of candidates) {
      const claimed = await this.withJobLock(candidate.id, async () => {
        const current = await this.read(candidate.id)
        if (!isClaimable(current, now)) return null
        const result = claimJob(current, workerId, now)
        if (result.ok) await this.save(result.job)
        return result
      })
      if (claimed) return claimed
    }
    return null
  }

  async listClaimable(limit = 1, now = Date.now()) {
    let names = this.jobNames
    if (!names) {
      incrementMetric(this.metrics, 'print.directoryScans')
      names = new Set((await fs.readdir(this.root)).filter((name) => name.endsWith('.json')))
      this.jobNames = names
    }
    const jobs = []
    for (const name of names) {
      const id = name.slice(0, -'.json'.length)
      try {
        const job = JSON.parse(await fs.readFile(path.join(this.root, name), 'utf8'))
        if (isClaimable(job, now)) jobs.push(job)
      } catch {
        continue
      }
    }
    jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return jobs.slice(0, limit)
  }

  async listQueued(limit = 1) {
    return this.listClaimable(limit)
  }

  async scanConsistency(photoStore) {
    const report = { scanned: 0, healthy: 0, repaired: [], quarantined: [], skipped: [], errors: [] }
    let names
    try {
      names = await fs.readdir(this.root)
    } catch (error) {
      report.errors.push({ code: 'PRINT_JOB_SCAN_FAILED', path: this.root, message: error.message })
      return report
    }
    for (const name of names.filter((entry) => entry.endsWith('.json'))) {
      report.scanned += 1
      const jobPath = path.join(this.root, name)
      let job
      try {
        job = JSON.parse(await fs.readFile(jobPath, 'utf8'))
      } catch {
        report.quarantined.push({ code: 'MALFORMED_PRINT_JOB', path: jobPath, message: 'Print job is not valid JSON' })
        continue
      }
      if (!photoStore || typeof job.photoId !== 'string') {
        report.quarantined.push({ code: 'AMBIGUOUS_PRINT_JOB', path: jobPath, message: 'Print job has no valid photo reference' })
        continue
      }
      let metadata
      try {
        metadata = await photoStore.readMetadataById(job.photoId)
      } catch {
        report.quarantined.push({ code: 'ORPHAN_PRINT_JOB', path: jobPath, message: 'Print job references a missing photo', photoId: job.photoId })
        continue
      }
      if (job.token && job.token !== metadata.token) {
        report.quarantined.push({ code: 'STALE_PRINT_JOB_TOKEN', path: jobPath, message: 'Print job token does not match photo metadata', photoId: job.photoId })
        continue
      }
      let assetKey = metadata.currentAssetKey || metadata.originalAssetKey
      if (job.editId) {
        const editPath = path.join(photoStore.editDir(job.photoId), `${job.editId}.json`)
        try {
          const edit = JSON.parse(await fs.readFile(editPath, 'utf8'))
          if (edit.photoId !== job.photoId) {
            report.quarantined.push({ code: 'ORPHAN_PRINT_EDIT', path: editPath, message: 'Print edit references another photo', photoId: job.photoId })
            continue
          }
          assetKey = edit.renderedAssetKey || assetKey
        } catch {
          report.quarantined.push({ code: 'MISSING_PRINT_EDIT', path: editPath, message: 'Print job references a missing or malformed edit', photoId: job.photoId, editId: job.editId })
          continue
        }
      }
      try {
        await fs.access(photoStore.assetPath(job.photoId, assetKey))
        report.healthy += 1
      } catch {
        report.quarantined.push({ code: 'MISSING_PRINT_ASSET', path: photoStore.assetPath(job.photoId, assetKey), message: 'Print job asset is missing', photoId: job.photoId, assetKey })
      }
    }
    return report
  }
}
