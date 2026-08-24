export function buildBoothConfig(config) {
  return {
    defaultTemplateId: config.defaultTemplateId,
    defaultTemplateVersion: config.defaultTemplateVersion,
    captureMode: config.captureMode,
    gesture: {
      holdMs: config.gestureHoldMs,
      countdownSeconds: config.countdownSeconds,
      poseGraceMs: config.poseGraceMs,
      minConfidence: config.gestureMinConfidence,
      consecutiveFrames: config.gestureConsecutiveFrames,
    },
    features: {
      cornerPin: false,
      frameLibrary: config.showFrameLibrary,
    },
    print: {
      currency: config.printCurrency,
      paymentMode: config.paymentMode,
      sizes: [
        { id: '4x6', label: '4×6', priceCents: config.printPrice4x6 },
        { id: '6x8', label: '6×8', priceCents: config.printPrice6x8 },
      ],
    },
  }
}

export function parseSessionHeaders(headers) {
  const templateId = headers['x-template-id']
  const versionRaw = headers['x-template-version']
  const templateVersion =
    versionRaw !== undefined && versionRaw !== '' && Number.isFinite(Number(versionRaw))
      ? Math.floor(Number(versionRaw))
      : null
  const captureMode = headers['x-capture-mode'] || null
  return {
    templateId: typeof templateId === 'string' && templateId.length > 0 ? templateId.slice(0, 64) : null,
    templateVersion,
    captureMode: typeof captureMode === 'string' && captureMode.length > 0 ? captureMode.slice(0, 32) : null,
  }
}
