import { Chess } from 'chess.js'

/** Score from White's point of view. */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number }

export interface EngineLine {
  multipv: number
  depth: number
  score: Score
  /** Principal variation in UCI notation (e.g. "e2e4"). */
  pv: string[]
}

/**
 * Parses a UCI "info" line. Stockfish reports scores from the side to move's view,
 * so we flip them to White's view using `whiteToMove`. Returns null for lines without a score/pv.
 */
export function parseInfo(line: string, whiteToMove: boolean): EngineLine | null {
  if (!line.startsWith('info ') || line.includes('lowerbound') || line.includes('upperbound')) return null
  const t = line.split(/\s+/)
  const num = (key: string) => {
    const i = t.indexOf(key)
    return i >= 0 ? Number(t[i + 1]) : NaN
  }
  const depth = num('depth')
  const si = t.indexOf('score')
  const pvi = t.indexOf('pv')
  if (si < 0 || pvi < 0 || Number.isNaN(depth)) return null
  const kind = t[si + 1]
  const raw = Number(t[si + 2])
  if ((kind !== 'cp' && kind !== 'mate') || Number.isNaN(raw)) return null
  const sign = whiteToMove ? 1 : -1
  const multipv = Number.isNaN(num('multipv')) ? 1 : num('multipv')
  return { multipv, depth, score: { type: kind, value: raw * sign }, pv: t.slice(pvi + 1) }
}

/** Converts a UCI move list to SAN starting from `fen`. Stops at the first illegal move. */
export function pvToSan(fen: string, pv: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of pv) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return out
}

/** Formats a SAN list with move numbers, e.g. "1. e4 e5 2. Nf3" (or "1... e5 2. Nf3" when Black starts). */
export function formatLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ')
  let black = parts[1] === 'b'
  let n = Number(parts[5]) || 1
  const out: string[] = []
  sans.forEach((san, i) => {
    if (!black) out.push(`${n}.`)
    else if (i === 0) out.push(`${n}...`)
    out.push(san)
    if (black) n++
    black = !black
  })
  return out.join(' ')
}

/** Signed score text such as "+0.35", "-1.20", "M3" or "-M2". */
export function scoreLabel(s: Score): string {
  if (s.type === 'mate') return s.value > 0 ? `M${s.value}` : `-M${Math.abs(s.value)}`
  const pawns = s.value / 100
  return `${pawns >= 0 ? '+' : '-'}${Math.abs(pawns).toFixed(2)}`
}

/** Percentage of the eval bar that White fills (0-100). Smooth curve so big leads flatten out. */
export function whiteBarPercent(s: Score): number {
  if (s.type === 'mate') return s.value > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, s.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Plain-words description of who is better. */
export function evalInWords(s: Score): string {
  if (s.type === 'mate') {
    if (s.value === 0) return 'Checkmate'
    const side = s.value > 0 ? 'White' : 'Black'
    const n = Math.abs(s.value)
    return `${side} can force checkmate in ${n} move${n === 1 ? '' : 's'}`
  }
  const side = s.value > 0 ? 'White' : 'Black'
  const a = Math.abs(s.value)
  if (a < 20) return 'The position is equal'
  if (a < 70) return `${side} is slightly better`
  if (a < 200) return `${side} is better`
  if (a < 500) return `${side} is much better`
  return `${side} is winning`
}
