import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_PORT = process.env.API_PORT || '8787'
const WEB_PORT = process.env.PORT || '5173'

function randomSecret() {
  return randomBytes(24).toString('base64url')
}

function ensureProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return

  const publicBase =
    process.env.PUBLIC_WEB_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.COOLIFY_URL?.replace(/\/$/, '') ||
    ''

  if (publicBase && !process.env.PUBLIC_WEB_BASE_URL) {
    process.env.PUBLIC_WEB_BASE_URL = publicBase
  }
  if (publicBase && !process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS = publicBase
  }

  process.env.API_PORT = API_PORT
  process.env.HOSTNAME = '0.0.0.0'

  if (!process.env.PRINT_WORKER_SECRET || process.env.PRINT_WORKER_SECRET === 'dev-print-worker') {
    process.env.PRINT_WORKER_SECRET = randomSecret()
  }
  if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY === 'dev-internal-key') {
    process.env.INTERNAL_API_KEY = randomSecret()
  }
  if (process.env.PAYMENT_MODE !== 'webhook') {
    process.env.PAYMENT_MODE = 'webhook'
  }
  if (!process.env.PAYMENT_WEBHOOK_KEY) {
    process.env.PAYMENT_WEBHOOK_KEY = randomSecret()
  }
}

function resolveWebStart() {
  const candidates = [
    path.join(ROOT, 'web', '.next', 'standalone', 'server.js'),
    path.join(ROOT, 'web', '.next', 'standalone', 'web', 'server.js'),
  ]

  for (const serverEntry of candidates) {
    if (fs.existsSync(serverEntry)) {
      return {
        command: process.execPath,
        args: [serverEntry],
        cwd: path.dirname(serverEntry),
        mode: 'standalone',
      }
    }
  }

  const nextCandidates = [
    path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'),
    path.join(ROOT, 'web', 'node_modules', 'next', 'dist', 'bin', 'next'),
  ]

  for (const nextBin of nextCandidates) {
    if (fs.existsSync(nextBin)) {
      return {
        command: process.execPath,
        args: [nextBin, 'start', '-H', '0.0.0.0', '-p', WEB_PORT],
        cwd: path.join(ROOT, 'web'),
        mode: 'next-start',
      }
    }
  }

  throw new Error('No Next.js runtime found (standalone server or next binary)')
}

ensureProductionEnv()

const webStart = resolveWebStart()
console.log(`Starting photobooth: api=:${API_PORT}, web=:${WEB_PORT} (${webStart.mode})`)

const nodePath = [path.join(ROOT, 'node_modules'), path.join(ROOT, 'api', 'node_modules')]
  .filter((entry) => fs.existsSync(entry))
  .join(path.delimiter)

const childEnv = {
  ...process.env,
  API_PORT,
  PORT: WEB_PORT,
  HOSTNAME: '0.0.0.0',
  ...(nodePath ? { NODE_PATH: nodePath } : {}),
}

const api = spawn(process.execPath, ['server.mjs'], {
  cwd: path.join(ROOT, 'api'),
  stdio: 'inherit',
  env: childEnv,
})

const web = spawn(webStart.command, webStart.args, {
  cwd: webStart.cwd,
  stdio: 'inherit',
  env: childEnv,
})

let shuttingDown = false

function stopAll(signal) {
  if (shuttingDown) return
  shuttingDown = true
  api.kill(signal)
  web.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal))
}

function exitIfChildFails(child, name) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`${name} exited with ${signal || `code ${code}`}`)
    stopAll('SIGTERM')
    process.exit(code || 1)
  })
}

exitIfChildFails(api, 'API')
exitIfChildFails(web, 'web')
