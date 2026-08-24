import { strict as assert } from 'node:assert'
import test from 'node:test'
import { withUploadRetry, type UploadRetryError } from './uploadRetry'

test('retries 429 using Retry-After and then succeeds', async () => {
  let calls = 0
  const delays: number[] = []
  const result = await withUploadRetry(
    async () => {
      calls += 1
      if (calls === 1) {
        const error = new Error('limited') as UploadRetryError
        error.status = 429
        error.retryAfterSeconds = 2
        throw error
      }
      return 'ok'
    },
    { attempts: 3, baseDelayMs: 1, sleep: async (delay) => { delays.push(delay) } },
  )
  assert.equal(result, 'ok')
  assert.deepEqual(delays, [2000])
})

test('does not retry validation or authorization failures', async () => {
  let calls = 0
  const error = Object.assign(new Error('invalid'), { status: 400 })
  await assert.rejects(
    () => withUploadRetry(async () => {
      calls += 1
      throw error
    }, { attempts: 3, sleep: async () => undefined }),
    error,
  )
  assert.equal(calls, 1)
})

test('bounds transient retries', async () => {
  let calls = 0
  const error = Object.assign(new Error('server'), { status: 503 })
  await assert.rejects(
    () => withUploadRetry(async () => {
      calls += 1
      throw error
    }, { attempts: 3, sleep: async () => undefined }),
    error,
  )
  assert.equal(calls, 3)
})
