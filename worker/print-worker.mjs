#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787'
const WORKER_SECRET = process.env.PRINT_WORKER_SECRET || 'dev-print-worker'
const WORKER_ID = process.env.PRINT_WORKER_ID || os.hostname()
const POLL_MS = Number(process.env.PRINT_WORKER_POLL_MS || 3000)
const OUT_DIR = process.env.PRINT_OUTPUT_DIR || path.join(os.tmpdir(), 'rbs-prints')

async function claimNext() {
  const res = await fetch(`${API_BASE}/api/print-jobs/claim/next`, {
    headers: {
      'X-Worker-Secret': WORKER_SECRET,
      'X-Worker-Id': WORKER_ID,
    },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`claim failed (${res.status})`)
  return res.json()
}

async function completeJob(jobId, claimToken) {
  const res = await fetch(`${API_BASE}/api/print-jobs/${jobId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': WORKER_SECRET,
      'X-Worker-Id': WORKER_ID,
    },
    body: JSON.stringify({ claimToken }),
  })
  if (!res.ok) throw new Error(`complete failed (${res.status})`)
}

async function failJob(jobId, claimToken, message) {
  const res = await fetch(`${API_BASE}/api/print-jobs/${jobId}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': WORKER_SECRET,
      'X-Worker-Id': WORKER_ID,
    },
    body: JSON.stringify({ claimToken, message }),
  })
  if (!res.ok) throw new Error(`fail report failed (${res.status})`)
}

async function downloadImage(relativeUrl, destPath) {
  const res = await fetch(`${API_BASE}${relativeUrl}`, {
    headers: { 'X-Worker-Secret': WORKER_SECRET },
  })
  if (!res.ok) throw new Error(`image download failed (${res.status})`)
  const bytes = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(destPath, bytes)
  return destPath
}

function printWithLp(filePath, copies) {
  return new Promise((resolve, reject) => {
    const args = ['-n', String(copies), filePath]
    const child = spawn('lp', args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`lp exited with code ${code}`))
    })
  })
}

async function processClaim(claim) {
  const { job, claimToken, imageUrl } = claim
  const filePath = path.join(OUT_DIR, `${job.id}.jpg`)

  try {
    await downloadImage(imageUrl, filePath)
    await printWithLp(filePath, job.quantity)
    await completeJob(job.id, claimToken)
    console.log(`[worker] completed ${job.id} (${job.quantity}× ${job.size})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'print failed'
    try {
      await failJob(job.id, claimToken, message)
    } catch (reportError) {
      console.error(`[worker] failed to report ${job.id}:`, reportError instanceof Error ? reportError.message : reportError)
    }
    console.error(`[worker] failed ${job.id}: ${message}`)
  } finally {
    try {
      await fs.rm(filePath, { force: true })
    } catch (cleanupError) {
      console.error(`[worker] failed to clean ${job.id}:`, cleanupError instanceof Error ? cleanupError.message : cleanupError)
    }
  }
}

async function loop() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  console.log(`[worker] polling ${API_BASE} as ${WORKER_ID}`)
  for (;;) {
    try {
      const claim = await claimNext()
      if (claim) await processClaim(claim)
    } catch (error) {
      console.error('[worker] poll error:', error instanceof Error ? error.message : error)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void loop()
}
