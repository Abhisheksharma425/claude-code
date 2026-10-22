// Starts the backend (:3001) and the frontend (:5173) together, with prefixed output. Ctrl+C stops both.
//
// It runs Node directly (no npm, no shell), so it works the same on Windows, macOS and Linux,
// including when the project folder's path contains spaces.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
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

function run(name, color, cwd, args) {
  const child = spawn(process.execPath, args, { cwd, env: process.env })
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
run('frontend', '35', frontend, [vite])
