export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? error.name : undefined
  return name === 'AbortError'
}
