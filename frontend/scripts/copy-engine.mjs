// Copies the single-threaded "lite" Stockfish WASM build into public/engine so Vite serves it as-is.
// Single-threaded needs no COOP/COEP headers, so it works on any static host.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')
mkdirSync(dest, { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, f), join(dest, f))
}
console.log('Stockfish engine files copied to public/engine')
