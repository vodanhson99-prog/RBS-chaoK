export function createStorageMetrics() {
  const counts = new Map()

  return {
    increment(name, amount = 1) {
      counts.set(name, (counts.get(name) || 0) + amount)
    },
    snapshot() {
      return Object.fromEntries(counts)
    },
    reset() {
      counts.clear()
    },
  }
}

export function incrementMetric(metrics, name, amount = 1) {
  metrics?.increment(name, amount)
}
