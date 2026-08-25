import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STANDALONE = path.join(WEB_ROOT, '.next', 'standalone')

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyRecursive(from, to)
    else fs.copyFileSync(from, to)
  }
}

if (!fs.existsSync(STANDALONE)) {
  console.log('standalone output missing; skipping asset copy')
  process.exit(0)
}

copyRecursive(path.join(WEB_ROOT, 'public'), path.join(STANDALONE, 'public'))
copyRecursive(path.join(WEB_ROOT, '.next', 'static'), path.join(STANDALONE, '.next', 'static'))
console.log('standalone assets copied')
