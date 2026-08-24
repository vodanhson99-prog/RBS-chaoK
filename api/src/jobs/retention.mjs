export function startRetentionJob(store, intervalMs, { logger = console } = {}) {
  let running = false
  const run = async () => {
    if (running) return { skipped: true }
    running = true
    const result = { recovered: 0, removed: 0, anomalies: [] }
    try {
      try {
        result.recovered = await store.recoverPendingIdempotency?.() || 0
      } catch (error) {
        result.anomalies.push({ phase: 'idempotency', message: error.message })
        logger.error?.({ err: error }, 'idempotency retention failed')
      }
      try {
        const purgeResult = await store.purgeExpired()
        result.removed = typeof purgeResult === 'number' ? purgeResult : purgeResult?.removed || 0
        if (purgeResult?.anomalies) result.anomalies.push(...purgeResult.anomalies)
      } catch (error) {
        result.anomalies.push({ phase: 'photos', message: error.message })
        logger.error?.({ err: error }, 'photo retention failed')
      }
      return result
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void run(), intervalMs)
  timer.unref?.()
  return {
    run,
    stop: () => clearInterval(timer),
  }
}
