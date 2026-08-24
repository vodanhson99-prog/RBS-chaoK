#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.resolve(process.env.PHOTO_DATA_DIR || path.join(ROOT, 'api', 'src', 'data'))
const OUT_DIR = path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'backups'))
const RETENTION_COUNT = parsePositiveInt(process.env.BACKUP_RETENTION_COUNT, 7)
const BACKUP_NAME = /^backup-(\d{8}T\d{6}Z)-([0-9a-f]{8})\.tar\.gz$/
const SHA_NAME = /^backup-(\d{8}T\d{6}Z)-([0-9a-f]{8})\.tar\.gz\.sha256$/

function parsePositiveInt(value, fallback) {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function backupStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function backupPaths(stamp, suffix) {
  const base = `backup-${stamp}-${suffix}.tar.gz`
  return { archive: path.join(OUT_DIR, base), checksum: path.join(OUT_DIR, `${base}.sha256`) }
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

async function writeChecksum(archive, checksumPath) {
  const digest = await sha256(archive)
  await fs.writeFile(checksumPath, `${digest}  ${path.basename(archive)}\n`, { flag: 'wx' })
  return digest
}

export async function verifyBackup(archivePath, { checksumPath, expectedDataDir = DATA_DIR } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-backup-verify-'))
  try {
    if (checksumPath) {
      const checksumText = await fs.readFile(checksumPath, 'utf8')
      const [expected, name] = checksumText.trim().split(/\s+/)
      if (name !== path.basename(archivePath) || expected !== await sha256(archivePath)) {
        throw new Error('Backup checksum verification failed')
      }
    }
    await execFileAsync('tar', ['-xzf', archivePath, '-C', tempDir])
    const extractedRoot = path.join(tempDir, path.basename(expectedDataDir))
    const requiredDirs = ['photos', 'tokens', 'edits', 'idempotency']
    const entries = await fs.readdir(extractedRoot, { withFileTypes: true })
    const names = new Set(entries.map((entry) => entry.name))
    for (const required of requiredDirs) {
      if (!names.has(required)) throw new Error(`Backup is missing expected directory: ${required}`)
    }
    return { ok: true, extractedRoot }
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true })
  }
}

async function pruneBackups() {
  const entries = await fs.readdir(OUT_DIR, { withFileTypes: true })
  const archives = entries
    .filter((entry) => entry.isFile() && BACKUP_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
  for (const archive of archives.slice(RETENTION_COUNT)) {
    const match = archive.match(BACKUP_NAME)
    if (!match) continue
    const checksum = `backup-${match[1]}-${match[2]}.tar.gz.sha256`
    await fs.rm(path.join(OUT_DIR, archive), { force: true })
    if (SHA_NAME.test(checksum)) await fs.rm(path.join(OUT_DIR, checksum), { force: true })
  }
  return archives.length
}

export async function createBackup({ dataDir = DATA_DIR, outDir = OUT_DIR, retentionCount = RETENTION_COUNT, now = new Date() } = {}) {
  const originalOutDir = OUT_DIR
  if (path.resolve(outDir) !== originalOutDir) {
    await fs.mkdir(outDir, { recursive: true })
  } else {
    await fs.mkdir(OUT_DIR, { recursive: true })
  }
  const stamp = backupStamp(now)
  const suffix = crypto.randomBytes(4).toString('hex')
  const base = `backup-${stamp}-${suffix}.tar.gz`
  const archive = path.join(outDir, base)
  const checksum = path.join(outDir, `${base}.sha256`)
  try {
    await execFileAsync('tar', ['-czf', archive, '--exclude=.env', '--exclude=.env.*', '-C', path.dirname(dataDir), path.basename(dataDir)])
    const digest = await sha256(archive)
    await fs.writeFile(checksum, `${digest}  ${path.basename(archive)}\n`, { flag: 'wx' })
    await verifyBackup(archive, { checksumPath: checksum, expectedDataDir: dataDir })
    const entries = await fs.readdir(outDir, { withFileTypes: true })
    const archives = entries.filter((entry) => entry.isFile() && BACKUP_NAME.test(entry.name)).map((entry) => entry.name).sort().reverse()
    for (const oldArchive of archives.slice(retentionCount)) {
      const match = oldArchive.match(BACKUP_NAME)
      if (!match) continue
      const oldChecksum = `backup-${match[1]}-${match[2]}.tar.gz.sha256`
      await fs.rm(path.join(outDir, oldArchive), { force: true })
      if (SHA_NAME.test(oldChecksum)) await fs.rm(path.join(outDir, oldChecksum), { force: true })
    }
    return { archive, checksum, digest }
  } catch (error) {
    await fs.rm(archive, { force: true })
    await fs.rm(checksum, { force: true })
    throw error
  }
}

async function main() {
  const result = await createBackup()
  console.log(`backup written: ${result.archive}`)
  console.log(`checksum written: ${result.checksum}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
