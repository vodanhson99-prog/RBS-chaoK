import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimJob,
  completeJob,
  createPrintJob,
  failJob,
  markPaid,
  validatePrintRequest,
} from '../src/domain/printJob.mjs'

test('validatePrintRequest computes amount from size and quantity', () => {
  const prices = { '4x6': 50_000, '6x8': 80_000 }
  const ok = validatePrintRequest({ quantity: 2, size: '4x6' }, prices)
  assert.equal(ok.ok, true)
  assert.equal(ok.amountCents, 100_000)
})

test('print job payment and worker lifecycle', () => {
  let job = createPrintJob({
    photoId: 'photo-1',
    token: 'token-abc',
    editId: null,
    quantity: 1,
    size: '4x6',
    amountCents: 50_000,
    currency: 'VND',
  })
  assert.equal(job.paymentStatus, 'pending_payment')

  job = markPaid(job)
  assert.equal(job.paymentStatus, 'paid')
  assert.equal(job.printStatus, 'queued')

  const claimed = claimJob(job, 'worker-a')
  assert.equal(claimed.ok, true)
  job = claimed.job

  const done = completeJob(job, claimed.claimToken)
  assert.equal(done.ok, true)
  assert.equal(done.job.printStatus, 'completed')

  const duplicate = claimJob(done.job, 'worker-b')
  assert.equal(duplicate.ok, false)
})

test('failed print requeues until max attempts', () => {
  let job = markPaid(
    createPrintJob({
      photoId: 'photo-2',
      token: 'token-def',
      editId: null,
      quantity: 1,
      size: '6x8',
      amountCents: 80_000,
      currency: 'VND',
      maxAttempts: 2,
    }),
  )

  const firstClaim = claimJob(job, 'worker-a')
  job = firstClaim.job
  const failed = failJob(job, firstClaim.claimToken, 'paper jam')
  assert.equal(failed.job.printStatus, 'queued')

  const secondClaim = claimJob(failed.job, 'worker-a')
  job = secondClaim.job
  const finalFail = failJob(job, secondClaim.claimToken, 'offline')
  assert.equal(finalFail.job.printStatus, 'failed')
})
