import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  claimJob,
  completeJob,
  createPrintJob,
  failJob,
  isClaimable,
  markPaid,
} from '../src/domain/printJob.mjs'
import { PrintJobStore } from '../src/storage/printJobStore.mjs'

function paidJob(overrides = {}) {
  return markPaid(createPrintJob({
    photoId: 'photo-1',
    token: 'token-123456789',
    quantity: 1,
    size: '4x6',
    amountCents: 50_000,
    currency: 'VND',
    claimLeaseMs: 1000,
    ...overrides,
  }))
}

test('active claim is not claimable, expired claim is reclaimable with new ownership', () => {
  const job = paidJob()
  const first = claimJob(job, 'worker-a', 10_000)
  assert.equal(first.ok, true)
  assert.equal(isClaimable(first.job, 10_999), false)
  assert.equal(isClaimable(first.job, 11_000), true)

  const reclaimed = claimJob(first.job, 'worker-b', 11_000)
  assert.equal(reclaimed.ok, true)
  assert.notEqual(reclaimed.claimToken, first.claimToken)
  assert.equal(reclaimed.job.workerId, 'worker-b')
  assert.equal(reclaimed.job.attempts, 2)
})

test('stale worker cannot complete or fail a reclaimed claim', () => {
  const job = paidJob()
  const first = claimJob(job, 'worker-a', 10_000)
  const reclaimed = claimJob(first.job, 'worker-b', 11_000)

  const staleComplete = completeJob(reclaimed.job, first.claimToken, 'worker-a', 11_100)
  assert.equal(staleComplete.ok, false)
  assert.equal(staleComplete.code, 'INVALID_CLAIM')

  const staleFail = failJob(reclaimed.job, first.claimToken, 'worker-a', 'old worker', 11_100)
  assert.equal(staleFail.ok, false)
  assert.equal(staleFail.code, 'INVALID_CLAIM')

  const currentComplete = completeJob(reclaimed.job, reclaimed.claimToken, 'worker-b', 11_100)
  assert.equal(currentComplete.ok, true)
  assert.equal(currentComplete.job.printStatus, 'completed')
})

test('expired current claim cannot mutate until reclaimed', () => {
  const job = paidJob()
  const claim = claimJob(job, 'worker-a', 10_000)
  const expired = completeJob(claim.job, claim.claimToken, 'worker-a', 11_001)
  assert.equal(expired.ok, false)
  assert.equal(expired.code, 'CLAIM_EXPIRED')
})

test('completed and failed jobs are never reclaimed', () => {
  const completedBase = paidJob()
  const completedClaim = claimJob(completedBase, 'worker-a', 10_000)
  const completed = completeJob(completedClaim.job, completedClaim.claimToken, 'worker-a', 10_100)
  assert.equal(isClaimable(completed.job, 20_000), false)

  const failedBase = paidJob({ maxAttempts: 1 })
  const failedClaim = claimJob(failedBase, 'worker-a', 10_000)
  const failed = failJob(failedClaim.job, failedClaim.claimToken, 'worker-a', 'printer offline', 10_100)
  assert.equal(failed.job.printStatus, 'failed')
  assert.equal(isClaimable(failed.job, 20_000), false)
})

test('print job store returns expired printing jobs deterministically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-print-recovery-'))
  const store = new PrintJobStore(dir)
  await store.init()
  const job = paidJob()
  const claim = claimJob(job, 'worker-a', 10_000)
  await store.save(claim.job)

  assert.equal((await store.listClaimable(1, 10_999)).length, 0)
  assert.equal((await store.listClaimable(1, 11_000)).length, 1)
})

test('two in-process claims cannot both own the same active job', () => {
  const job = paidJob()
  const first = claimJob(job, 'worker-a', 10_000)
  const second = claimJob(first.job, 'worker-b', 10_500)
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.equal(second.code, 'ALREADY_CLAIMED')
})
