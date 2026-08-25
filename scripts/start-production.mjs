import { spawn } from 'node:child_process'

const api = spawn('npm', ['run', 'start', '--prefix', 'api'], {
  stdio: 'inherit',
  env: process.env,
})

const web = spawn('npm', ['run', 'start', '--prefix', 'web'], {
  stdio: 'inherit',
  env: process.env,
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
    process.exitCode = code || 1
  })
}

exitIfChildFails(api, 'API')
exitIfChildFails(web, 'web')
