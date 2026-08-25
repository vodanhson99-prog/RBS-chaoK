import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
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

ensureProductionEnv()

console.log(`Starting photobooth: api=:${API_PORT}, web=:${WEB_PORT}`)

const childEnv = { ...process.env, API_PORT, PORT: WEB_PORT }

const api = spawn(process.execPath, ['server.mjs'], {
  cwd: path.join(ROOT, 'api'),
  stdio: 'inherit',
  env: childEnv,
})

const web = spawn(
  process.execPath,
  [path.join(ROOT, 'web', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-H', '0.0.0.0', '-p', WEB_PORT],
  {
    cwd: path.join(ROOT, 'web'),
    stdio: 'inherit',
    env: childEnv,
  },
)

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
