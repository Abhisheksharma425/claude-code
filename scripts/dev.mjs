// Starts the backend (:3001) and the frontend (:5173) together, with prefixed output. Ctrl+C stops both.
//
// It runs Node directly (no npm, no shell), so it works the same on Windows, macOS and Linux,
// including when the project folder's path contains spaces.
//
// `npm run dev:phone` (= `node scripts/dev.mjs --phone`) also lets other devices reach the app: phones on the same Wi-Fi,
// or a tunnel such as `npx cloudflared tunnel --url http://localhost:5173`. The browser only ever talks to the Vite server
// (it forwards /api to the backend), so the backend itself never has to be exposed.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const phone = process.argv.includes('--phone')
const frontend = join(root, 'frontend')
const backend = join(root, 'backend')

const vite = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js')
const tsx = join(backend, 'node_modules', 'tsx', 'dist', 'cli.mjs')
if (!existsSync(vite) || !existsSync(tsx)) {
  console.error('Dependencies are missing. Run `npm run install:all` first, then try again.')
  process.exit(1)
}

// Make sure the Stockfish engine files are in place (the frontend's "predev" step does the same).
execFileSync(process.execPath, [join(frontend, 'scripts', 'copy-engine.mjs')], { cwd: frontend, stdio: 'inherit' })

const children = []
let stopping = false

function run(name, color, cwd, args, env = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env } })
  const tag = `\x1b[${color}m[${name}]\x1b[0m `
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    stream.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) process.stdout.write(tag + line.replace(/\r$/, '') + '\n')
    })
  }
  child.on('error', (err) => {
    process.stdout.write(`${tag}could not start: ${err.message}\n`)
    shutdown(1)
  })
  child.on('exit', (code) => {
    if (!stopping) process.stdout.write(`${tag}exited with code ${code}\n`)
    shutdown(code ?? 1)
  })
  children.push(child)
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) c.kill()
  setTimeout(() => process.exit(code), 300)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('backend ', '36', backend, [tsx, 'watch', 'src/index.ts'])
if (phone) {
  const urls = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:5173`)
  console.log('\nOpen the app on your phone (same Wi-Fi as this computer):')
  for (const u of urls.length ? urls : ['(no network address found, check your Wi-Fi)']) console.log(`  ${u}`)
  console.log('Anyone on this network can open it, and the AI backend uses YOUR key. Stop with Ctrl+C when done.\n')
}
run('frontend', '35', frontend, phone ? [vite, '--host'] : [vite], phone ? { ALLOW_ALL_HOSTS: '1' } : {})
