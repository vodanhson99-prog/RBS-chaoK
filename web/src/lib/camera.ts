export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission blocked — allow camera access in the browser, then reload.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found — connect a webcam and reload this page.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is busy in another app — close other camera tabs/apps and reload.'
    case 'SecurityError':
      return 'Camera requires HTTPS or localhost — open this booth from localhost.'
    case 'AbortError':
      return 'Camera startup was cancelled — reload and try again.'
    case 'OverconstrainedError':
      return 'Camera does not support the requested resolution — use a webcam with a standard HD mode.'
    default:
      return error instanceof Error && error.message ? error.message : 'Unable to start camera.'
  }
}

export function describeTrackingError(error: unknown): string {
  if (error instanceof Error && error.message) return `Hand tracking unavailable — ${error.message}`
  return 'Hand tracking unavailable — camera preview is still available.'
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
