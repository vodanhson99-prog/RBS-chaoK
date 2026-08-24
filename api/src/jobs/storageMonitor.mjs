import fs from 'node:fs/promises'
import path from 'node:path'
import { incrementMetric } from '../storage/metrics.mjs'

export async function measureStorage(dataDir, metrics) {
  let bytes = 0
  let files = 0

  async function walk(dir) {
    let entries
    try {
      incrementMetric(metrics, 'storage.directoryScans')
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        incrementMetric(metrics, 'storage.metadataReads')
        const stat = await fs.stat(full)
        bytes += stat.size
        files += 1
      }
    }
  }

  await walk(dataDir)
  return { bytes, files, dataDir }
}
