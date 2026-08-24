export type UploadRetryError = Error & {
  status?: number
  retryAfterSeconds?: number
}

function retryAfterMs(error: unknown, fallbackMs: number): number {
  const retryAfter = error as UploadRetryError
  if (Number.isFinite(retryAfter.retryAfterSeconds)) return Math.max(0, retryAfter.retryAfterSeconds!) * 1000
  return fallbackMs
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false
  const status = (error as UploadRetryError)?.status
  return status === undefined || status === 429 || status >= 500
}

export async function withUploadRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number; sleep?: (delayMs: number) => Promise<void> },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 3)
  const baseDelayMs = options?.baseDelayMs ?? 800
  const sleep = options?.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)))
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!shouldRetry(error)) throw error
      lastError = error
      if (attempt >= attempts) break
      await sleep(retryAfterMs(error, baseDelayMs * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Upload failed after retries')
}
