import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function applyEnvFile(filePath, override) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key) continue
    if (!override && key in process.env) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

/** Re-read api/.env and api/.env.local into process.env (dev hot-reload). */
export function reloadEnvFiles() {
  applyEnvFile(path.join(API_ROOT, '.env'), false)
  applyEnvFile(path.join(API_ROOT, '.env.local'), true)
}

reloadEnvFiles()
