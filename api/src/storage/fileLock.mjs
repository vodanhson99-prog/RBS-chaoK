import fs from 'node:fs/promises'

export const DEFAULT_LOCK_WAIT_MS = 5_000
export const DEFAULT_LOCK_STALE_MS = 30_000

export async function withFileLock(lockPath, callback, {
  waitMs = DEFAULT_LOCK_WAIT_MS,
  staleMs = DEFAULT_LOCK_STALE_MS,
} = {}) {
  const handle = await acquireFileLock(lockPath, { waitMs, staleMs })
  try {
    return await callback()
  } finally {
    try {
      await handle.close()
    } finally {
      await fs.rm(lockPath, { force: true })
    }
  }
}

async function acquireFileLock(lockPath, { waitMs, staleMs }) {
  const startedAt = Date.now()
  for (;;) {
    try {
      return await fs.open(lockPath, 'wx')
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      try {
        const lock = await fs.stat(lockPath)
        if (Date.now() - lock.mtimeMs > staleMs) {
          await fs.rm(lockPath, { force: true })
          continue
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError
      }
      if (Date.now() - startedAt >= waitMs) {
        const timeout = new Error(`Timed out waiting for file lock: ${lockPath}`)
        timeout.code = 'LOCK_TIMEOUT'
        throw timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
}
