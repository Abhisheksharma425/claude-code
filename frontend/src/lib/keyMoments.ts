import { Chess } from 'chess.js'
import type { Category, PlyClassification } from './classify'
import type { GameState } from './game'
import { whiteBarPercent } from './uci'
import type { EngineLine } from './uci'

/** Moves worth stopping at when reviewing a game. */
export const CRITICAL: Category[] = ['blunder', 'mistake', 'missed-mate']

export interface KeyMoment {
  /** 1-based ply: the value to jump to so the board shows the position after this move. */
  ply: number
  /** "12. Nxf7" or "12... Qh4". */
  label: string
  san: string
  category: Category
  color: 'w' | 'b'
  lossCp: number
  /** Length of the forced mate this move missed (missed mates only). */
  mateIn?: number
  /** Length of the forced mate this move allowed the opponent. */
  allowsMateIn?: number
}

function moveLabel(startFen: string, index: number, san: string): string {
  const parts = startFen.split(' ')
  const blackFirst = parts[1] === 'b'
  const start = Number(parts[5]) || 1
  const isBlack = blackFirst ? index % 2 === 0 : index % 2 === 1
  const number = start + Math.floor((index + (blackFirst ? 1 : 0)) / 2)
  return isBlack ? `${number}... ${san}` : `${number}. ${san}`
}

/** Blunders, mistakes and missed mates, in game order. */
export function keyMoments(game: Pick<GameState, 'startFen' | 'plies'>, classes: (PlyClassification | null)[]): KeyMoment[] {
  const out: KeyMoment[] = []
  game.plies.forEach((p, i) => {
    const c = classes[i]
    if (c && CRITICAL.includes(c.category)) {
      out.push({
        ply: i + 1, label: moveLabel(game.startFen, i, p.san), san: p.san, category: c.category, color: c.color, lossCp: c.lossCp,
        mateIn: c.mateIn, allowsMateIn: c.allowsMateIn,
      })
    }
  })
  return out
}

/** The next (dir = 1) or previous (dir = -1) key moment relative to the position currently shown, or null. */
export function stepKeyMoment(moments: KeyMoment[], currentIndex: number, dir: 1 | -1): KeyMoment | null {
  if (dir === 1) return moments.find((m) => m.ply > currentIndex) ?? null
  for (let i = moments.length - 1; i >= 0; i--) if (moments[i].ply < currentIndex) return moments[i]
  return null
}

/**
 * Points for the evaluation graph: White's share of the bar (0-100) after each ply, with the start
 * position first. null where the position hasn't been analysed yet. Finished games count as 0 / 50 / 100.
 */
export function evalSeries(
  game: Pick<GameState, 'startFen' | 'plies'>,
  getLines: (fen: string) => EngineLine[] | undefined,
): (number | null)[] {
  const fens = [game.startFen, ...game.plies.map((p) => p.fen)]
  return fens.map((fen) => {
    const chess = new Chess(fen)
    if (chess.isCheckmate()) return chess.turn() === 'w' ? 0 : 100
    if (chess.isGameOver()) return 50
    const top = getLines(fen)?.[0]
    return top ? whiteBarPercent(top.score) : null
  })
}

/** SVG path for a series, drawn from the 50% midline, with gaps where a point is missing. */
export function graphPaths(series: (number | null)[], width: number, height: number): { line: string; area: string } {
  const n = series.length
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * width)
  const y = (v: number) => height - (v / 100) * height
  let line = ''
  let area = ''
  let run: [number, number][] = []
  const flush = () => {
    if (run.length === 0) return
    line += run.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ' '
    const mid = height / 2
    area += `M${run[0][0].toFixed(1)},${mid} ` + run.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ` L${run[run.length - 1][0].toFixed(1)},${mid} Z `
    run = []
  }
  series.forEach((v, i) => {
    if (v === null) flush()
    else run.push([x(i), y(v)])
  })
  flush()
  return { line: line.trim(), area: area.trim() }
}

/** Which position (0 = start) a click at `fraction` (0-1) across the graph refers to. */
export function indexAtFraction(fraction: number, points: number): number {
  if (points <= 1) return 0
  return Math.max(0, Math.min(points - 1, Math.round(fraction * (points - 1))))
}

/** Short plain-words description of what went wrong, e.g. "Blunder · allows mate in 1". */
export function momentSummary(m: Pick<KeyMoment, 'category' | 'lossCp' | 'mateIn' | 'allowsMateIn'>, label: string): string {
  if (m.category === 'missed-mate') return m.mateIn ? `${label} · mate in ${m.mateIn}` : label
  if (m.allowsMateIn) return `${label} · allows mate in ${m.allowsMateIn}`
  return `${label} · lost ${(m.lossCp / 100).toFixed(1)}`
}
