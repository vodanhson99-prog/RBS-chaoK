import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createBackup, verifyBackup } from '../../scripts/backup-data.mjs'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rbs-backup-fixture-'))
  const dataDir = path.join(root, 'data')
  const outDir = path.join(root, 'backups')
  await Promise.all(['photos', 'tokens', 'edits', 'idempotency', 'print-jobs', 'frames'].map((name) => fs.mkdir(path.join(dataDir, name), { recursive: true })))
  await fs.writeFile(path.join(dataDir, 'photos', 'meta.json'), '{}')
  return { dataDir, outDir }
}

test('backup creates a predictable archive, checksum, and verifies extracted structure', async () => {
  const { dataDir, outDir } = await fixture()
  const result = await createBackup({ dataDir, outDir, now: new Date('2026-08-24T03:40:00.000Z') })
  assert.match(path.basename(result.archive), /^backup-20260824T034000Z-[0-9a-f]{8}\.tar\.gz$/)
  assert.match(path.basename(result.checksum), /\.sha256$/)
  assert.equal((await verifyBackup(result.archive, { checksumPath: result.checksum, expectedDataDir: dataDir })).ok, true)
})

test('corrupted archive or checksum fails verification', async () => {
  const { dataDir, outDir } = await fixture()
  const result = await createBackup({ dataDir, outDir })
  await fs.writeFile(result.checksum, `${crypto.createHash('sha256').update('wrong').digest('hex')}  ${path.basename(result.archive)}\n`)
  await assert.rejects(verifyBackup(result.archive, { checksumPath: result.checksum, expectedDataDir: dataDir }), /checksum verification failed/)
})

test('backup retention only removes recognized old backup pairs', async () => {
  const { dataDir, outDir } = await fixture()
  await createBackup({ dataDir, outDir, now: new Date('2026-08-24T03:40:00.000Z'), retentionCount: 1 })
  await createBackup({ dataDir, outDir, now: new Date('2026-08-24T03:41:00.000Z'), retentionCount: 1 })
  const entries = await fs.readdir(outDir)
  assert.equal(entries.filter((name) => name.endsWith('.tar.gz')).length, 1)
  assert.equal(entries.filter((name) => name.endsWith('.sha256')).length, 1)
})
