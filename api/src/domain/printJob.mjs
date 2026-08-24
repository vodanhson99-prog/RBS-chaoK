import { randomUUID } from 'node:crypto'

export const PRINT_SIZES = ['4x6', '6x8']
export const DEFAULT_PRINT_CLAIM_LEASE_MS = 2 * 60 * 1000

export function isClaimExpired(job, now = Date.now()) {
  if (job.printStatus !== 'printing') return false
  if (!job.claimToken) return true
  const leaseExpiresAt = Date.parse(job.leaseExpiresAt || '')
  return !Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= now
}

export function isClaimable(job, now = Date.now()) {
  if (job.paymentStatus !== 'paid') return false
  if (job.printStatus === 'completed' || job.printStatus === 'failed' || job.printStatus === 'cancelled') return false
  if (job.attempts >= job.maxAttempts) return false
  return job.printStatus === 'queued' || (job.printStatus === 'printing' && isClaimExpired(job, now))
}

export function createPrintJob({
  photoId,
  token,
  editId,
  quantity,
  size,
  amountCents,
  currency,
  maxAttempts = 3,
  claimLeaseMs = DEFAULT_PRINT_CLAIM_LEASE_MS,
}) {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    photoId,
    token,
    editId: editId || null,
    quantity: Math.max(1, Math.min(20, Math.floor(quantity))),
    size,
    amountCents,
    currency,
    paymentStatus: 'pending_payment',
    printStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    completedAt: null,
    workerId: null,
    attempts: 0,
    maxAttempts,
    lastError: null,
    claimToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    claimLeaseMs,
  }
}

export function validatePrintRequest(body, priceBySize) {
  const quantity = Number(body?.quantity ?? 1)
  const size = String(body?.size ?? '4x6')
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
    return { ok: false, code: 'BAD_REQUEST', message: 'quantity must be between 1 and 20' }
  }
  if (!PRINT_SIZES.includes(size)) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Invalid print size' }
  }
  const unitPrice = priceBySize[size]
  if (!unitPrice) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Print size is not configured' }
  }
  return {
    ok: true,
    quantity: Math.floor(quantity),
    size,
    amountCents: unitPrice * Math.floor(quantity),
  }
}

export function markPaid(job) {
  if (job.paymentStatus === 'paid') return job
  const now = new Date().toISOString()
  return {
    ...job,
    paymentStatus: 'paid',
    printStatus: job.printStatus === 'completed' ? 'completed' : 'queued',
    paidAt: now,
    updatedAt: now,
  }
}

export function claimJob(job, workerId, nowMs = Date.now()) {
  if (job.paymentStatus !== 'paid') return { ok: false, code: 'PAYMENT_REQUIRED', message: 'Job is not paid' }
  if (job.printStatus === 'completed') return { ok: false, code: 'ALREADY_COMPLETED', message: 'Job already completed' }
  if (job.printStatus !== 'queued' && job.printStatus !== 'printing') {
    return { ok: false, code: 'INVALID_TRANSITION', message: 'Job cannot be claimed from its current state' }
  }
  if (job.printStatus === 'printing' && !isClaimExpired(job, nowMs)) {
    return { ok: false, code: 'ALREADY_CLAIMED', message: 'Job is already printing' }
  }
  if (job.attempts >= job.maxAttempts) {
    return { ok: false, code: 'MAX_ATTEMPTS', message: 'Job exceeded retry limit' }
  }
  const claimedAt = new Date(nowMs).toISOString()
  const leaseExpiresAt = new Date(nowMs + (job.claimLeaseMs || DEFAULT_PRINT_CLAIM_LEASE_MS)).toISOString()
  const claimToken = randomUUID()
  return {
    ok: true,
    job: {
      ...job,
      printStatus: 'printing',
      workerId,
      claimToken,
      claimedAt,
      leaseExpiresAt,
      attempts: job.attempts + 1,
      updatedAt: claimedAt,
    },
    claimToken,
  }
}

function validClaim(job, claimToken, workerId, nowMs) {
  if (job.printStatus !== 'printing' || job.claimToken !== claimToken || job.workerId !== workerId) return false
  return !isClaimExpired(job, nowMs)
}

function claimFailure(job, claimToken, workerId, nowMs) {
  if (job.printStatus !== 'printing' || job.claimToken !== claimToken || job.workerId !== workerId) {
    return { ok: false, code: 'INVALID_CLAIM', message: 'Invalid worker claim' }
  }
  if (isClaimExpired(job, nowMs)) {
    return { ok: false, code: 'CLAIM_EXPIRED', message: 'Worker claim expired' }
  }
  return null
}

function normalizeWorkerArgs(job, workerIdOrMessage, messageOrNow, nowMs) {
  if (typeof messageOrNow === 'number') {
    return { workerId: job.workerId, message: workerIdOrMessage, nowMs: messageOrNow }
  }
  if (workerIdOrMessage === job.workerId) {
    return { workerId: workerIdOrMessage, message: messageOrNow, nowMs }
  }
  return { workerId: job.workerId, message: workerIdOrMessage, nowMs: Date.now() }
}

export function completeJob(job, claimToken, workerId = job.workerId, nowMs = Date.now()) {
  const invalid = claimFailure(job, claimToken, workerId, nowMs)
  if (invalid) return invalid
  const now = new Date(nowMs).toISOString()
  return {
    ok: true,
    job: {
      ...job,
      printStatus: 'completed',
      completedAt: now,
      updatedAt: now,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: null,
    },
  }
}

export function failJob(job, claimToken, workerIdOrMessage = job.workerId, messageOrNow = 'Print failed', nowMs = Date.now()) {
  const { workerId, message, nowMs: effectiveNow } = normalizeWorkerArgs(job, workerIdOrMessage, messageOrNow, nowMs)
  const invalid = claimFailure(job, claimToken, workerId, effectiveNow)
  if (invalid) return invalid
  const now = new Date(effectiveNow).toISOString()
  const canRetry = job.attempts < job.maxAttempts
  return {
    ok: true,
    job: {
      ...job,
      printStatus: canRetry ? 'queued' : 'failed',
      updatedAt: now,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: message || 'Print failed',
    },
  }
}

export function toPublicPrintJob(job) {
  return {
    id: job.id,
    token: job.token,
    quantity: job.quantity,
    size: job.size,
    amountCents: job.amountCents,
    currency: job.currency,
    paymentStatus: job.paymentStatus,
    printStatus: job.printStatus,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    paidAt: job.paidAt,
    completedAt: job.completedAt,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
  }
}

export function buildPrintConfig(config) {
  return {
    currency: config.printCurrency,
    paymentMode: config.paymentMode,
    sizes: [
      { id: '4x6', label: '4×6', priceCents: config.printPrice4x6 },
      { id: '6x8', label: '6×8', priceCents: config.printPrice6x8 },
    ],
  }
}
