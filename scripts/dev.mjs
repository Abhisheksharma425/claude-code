// Starts the backend (:3001) and the frontend (:5173) together, with prefixed output. Ctrl+C stops both.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = []

function run(name, color, dir, script) {
  const child = spawn(npm, ['--prefix', join(root, dir), 'run', script], { cwd: root, shell: process.platform === 'win32' })
  const tag = `\x1b[${color}m[${name}]\x1b[0m `
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    stream.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) process.stdout.write(tag + line + '\n')
    })
  }
  child.on('exit', (code) => {
    process.stdout.write(`${tag}exited with code ${code}\n`)
    shutdown(code ?? 1)
  })
  children.push(child)
}

let stopping = false
function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) c.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('backend ', '36', 'backend', 'dev')
run('frontend', '35', 'frontend', 'dev')
