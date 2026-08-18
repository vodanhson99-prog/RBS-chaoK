import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(ROOT, 'data', 'sessions')
const TTL_MS = 48 * 60 * 60 * 1000
const MAX_BYTES = 12 * 1024 * 1024
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || ''

await fs.mkdir(DATA, { recursive: true })

const app = Fastify({ logger: true, bodyLimit: MAX_BYTES })

app.addContentTypeParser('image/jpeg', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})
app.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})

app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    reply.header('Access-Control-Allow-Headers', 'Content-Type')
    return reply.code(204).send()
  }
})

async function sweep() {
  const names = await fs.readdir(DATA)
  const now = Date.now()
  await Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => {
        const raw = JSON.parse(await fs.readFile(path.join(DATA, n), 'utf8'))
        if (new Date(raw.expiresAt).getTime() < now) {
          const token = n.replace(/\.json$/, '')
          await fs.rm(path.join(DATA, `${token}.json`), { force: true })
          await fs.rm(path.join(DATA, `${token}.jpg`), { force: true })
        }
      }),
  )
}

function token() {
  return randomBytes(9).toString('base64url')
}

function lanIPv4() {
  const nets = os.networkInterfaces()
  const addrs = []
  for (const list of Object.values(nets)) {
    for (const a of list || []) {
      const family = a.family === 'IPv4' || a.family === 4
      if (family && !a.internal) addrs.push(a.address)
    }
  }
  return (
    addrs.find((ip) => ip.startsWith('192.168.')) ||
    addrs.find((ip) => ip.startsWith('10.')) ||
    addrs[0] ||
    null
  )
}

app.get('/api/lan', async () => ({
  host: lanIPv4(),
}))

app.post('/api/sessions', async (req, reply) => {
  await sweep()
  const body = req.body
  if (!Buffer.isBuffer(body) || body.length < 32) {
    return reply.code(400).send({ error: 'Expected image body' })
  }
  if (body.length > MAX_BYTES) {
    return reply.code(413).send({ error: 'Image too large' })
  }
  const id = token()
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  await fs.writeFile(path.join(DATA, `${id}.jpg`), body)
  await fs.writeFile(
    path.join(DATA, `${id}.json`),
    JSON.stringify({ token: id, createdAt: new Date().toISOString(), expiresAt }),
  )
  const origin = PUBLIC_BASE || `${req.protocol}://${req.headers.host}`
  return {
    token: id,
    url: `${origin}/p/${id}`,
    expiresAt,
  }
})

app.get('/api/sessions/:token', async (req, reply) => {
  await sweep()
  const { token: id } = req.params
  try {
    const raw = JSON.parse(await fs.readFile(path.join(DATA, `${id}.json`), 'utf8'))
    if (new Date(raw.expiresAt).getTime() < Date.now()) {
      return reply.code(404).send({ error: 'expired' })
    }
    const origin = PUBLIC_BASE || `${req.protocol}://${req.headers.host}`
    return { token: id, url: `${origin}/p/${id}`, expiresAt: raw.expiresAt }
  } catch {
    return reply.code(404).send({ error: 'not found' })
  }
})

app.get('/api/sessions/:token/image', async (req, reply) => {
  await sweep()
  const { token: id } = req.params
  try {
    const raw = JSON.parse(await fs.readFile(path.join(DATA, `${id}.json`), 'utf8'))
    if (new Date(raw.expiresAt).getTime() < Date.now()) {
      return reply.code(404).send({ error: 'expired' })
    }
    const file = await fs.readFile(path.join(DATA, `${id}.jpg`))
    reply.header('Content-Type', 'image/jpeg')
    reply.header('Cache-Control', 'private, max-age=3600')
    return reply.send(file)
  } catch {
    return reply.code(404).send({ error: 'not found' })
  }
})

const port = Number(process.env.PORT || 8787)
await app.listen({ port, host: '0.0.0.0' })
console.log(`photobooth api on :${port}`)
