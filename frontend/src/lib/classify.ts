import { Chess } from 'chess.js'
import type { PlyInfo } from './game'
import { pvToSan, type EngineLine, type Score } from './uci'

export type Category = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed-mate'

export const CATEGORIES: Category[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'missed-mate']

export const CATEGORY_META: Record<Category, { label: string; symbol: string }> = {
  best: { label: 'Best', symbol: '★' },
  good: { label: 'Good', symbol: '✓' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!' },
  mistake: { label: 'Mistake', symbol: '?' },
  blunder: { label: 'Blunder', symbol: '??' },
  'missed-mate': { label: 'Missed mate', symbol: 'M' },
}

export interface PlyClassification {
  category: Category
  color: 'w' | 'b'
  /** Centipawns the mover gave up versus the engine's best move (never negative). */
  lossCp: number
  /** The engine's top move in the position before the move, UCI and SAN. */
  bestUci: string
  bestSan: string
  /** Set for missed mates: the length of the mate the mover had. */
  mateIn?: number
  /** Set when the move lets the opponent force checkmate: the length of that mate. */
  allowsMateIn?: number
  /** 0-100 score for this single move, used for the accuracy %. */
  accuracy: number
}

/** Scores beyond this many centipawns are treated alike, so being "more winning" never counts as a loss. */
const CP_CAP = 1000

/** Flips a White-view score to the mover's view. */
export function povScore(s: Score, moverIsWhite: boolean): Score {
  return moverIsWhite ? s : { type: s.type, value: -s.value }
}

export function toCp(s: Score): number {
  if (s.type === 'mate') return s.value > 0 ? CP_CAP : -CP_CAP
  return Math.max(-CP_CAP, Math.min(CP_CAP, s.value))
}

function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Per-move accuracy from the drop in winning chances (0-100 scale). */
export function moveAccuracy(beforeCp: number, afterCp: number): number {
  const drop = Math.max(0, winPercent(beforeCp) - winPercent(afterCp))
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669))
}

export function categoryForLoss(lossCp: number): Category {
  if (lossCp < 50) return 'good'
  if (lossCp < 100) return 'inaccuracy'
  if (lossCp <= 200) return 'mistake'
  return 'blunder'
}

export function plyUci(p: Pick<PlyInfo, 'from' | 'to' | 'san'>): string {
  const promo = p.san.match(/=([QRBN])/)?.[1]
  return p.from + p.to + (promo ? promo.toLowerCase() : '')
}

export interface ClassifyInput {
  fenBefore: string
  playedUci: string
  /** Finished engine lines (MultiPV) for the position before the move. */
  linesBefore: EngineLine[]
  /** White-view score of the position after the move, from its own analysis (or game result). May be missing. */
  afterScore?: Score | null
}

/**
 * Rates one move from the mover's point of view. Stockfish's numbers decide everything.
 * Returns null while the data needed (analysis of the earlier position) isn't available yet.
 */
export function classifyMove(input: ClassifyInput): PlyClassification | null {
  const { fenBefore, playedUci, linesBefore } = input
  const top = linesBefore[0]
  if (!top || top.pv.length === 0) return null

  const color = fenBefore.split(' ')[1] === 'b' ? 'b' : 'w'
  const moverIsWhite = color === 'w'
  const bestUci = top.pv[0]
  const bestSan = pvToSan(fenBefore, [bestUci])[0] ?? bestUci
  const before = povScore(top.score, moverIsWhite)

  if (playedUci === bestUci) {
    return { category: 'best', color, lossCp: 0, bestUci, bestSan, accuracy: 100 }
  }

  // If the played move is one of the engine's top lines, that line's score is the most
  // like-for-like comparison (same search, same depth). Otherwise use the after-position's score.
  const playedLine = linesBefore.find((l) => l.pv[0] === playedUci)
  const afterWhiteView = playedLine?.score ?? input.afterScore
  if (!afterWhiteView) return null
  const after = povScore(afterWhiteView, moverIsWhite)

  const lossCp = Math.max(0, toCp(before) - toCp(after))
  const accuracy = moveAccuracy(toCp(before), toCp(after))
  const hadMate = before.type === 'mate' && before.value > 0
  const stillMate = after.type === 'mate' && after.value > 0
  if (hadMate && !stillMate) {
    return { category: 'missed-mate', color, lossCp, bestUci, bestSan, mateIn: before.value, accuracy }
  }
  const allowsMateIn = after.type === 'mate' && after.value < 0 ? -after.value : undefined
  return { category: categoryForLoss(lossCp), color, lossCp, bestUci, bestSan, allowsMateIn, accuracy }
}

/** White-view score for a finished game position, or null if the game goes on. */
function terminalScore(fen: string): Score | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) {
    // The side to move has been mated, so the other side wins.
    return { type: 'mate', value: chess.turn() === 'w' ? -1 : 1 }
  }
  if (chess.isGameOver()) return { type: 'cp', value: 0 }
  return null
}

/**
 * Classifies every ply that has enough analysis. `getLines(fen)` returns finished engine lines
 * for a position (or undefined). Entries are null where analysis is still missing.
 */
export function classifyGame(
  startFen: string,
  plies: PlyInfo[],
  getLines: (fen: string) => EngineLine[] | undefined,
): (PlyClassification | null)[] {
  return plies.map((p, i) => {
    const fenBefore = i === 0 ? startFen : plies[i - 1].fen
    const linesBefore = getLines(fenBefore)
    if (!linesBefore) return null
    const afterScore = terminalScore(p.fen) ?? getLines(p.fen)?.[0]?.score ?? null
    return classifyMove({ fenBefore, playedUci: plyUci(p), linesBefore, afterScore })
  })
}

export interface SideSummary {
  /** Average accuracy over rated moves, or null if none are rated yet. */
  accuracy: number | null
  counts: Record<Category, number>
  rated: number
  total: number
}

export interface GameSummary {
  white: SideSummary
  black: SideSummary
}

export function summarizeGame(
  startFen: string,
  plies: PlyInfo[],
  classes: (PlyClassification | null)[],
): GameSummary {
  const empty = (): SideSummary => ({
    accuracy: null,
    counts: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, 'missed-mate': 0 },
    rated: 0,
    total: 0,
  })
  const sides = { w: empty(), b: empty() }
  const sums = { w: 0, b: 0 }
  plies.forEach((_, i) => {
    const fenBefore = i === 0 ? startFen : plies[i - 1].fen
    const color = fenBefore.split(' ')[1] === 'b' ? 'b' : 'w'
    sides[color].total++
    const c = classes[i]
    if (!c) return
    sides[color].rated++
    sides[color].counts[c.category]++
    sums[color] += c.accuracy
  })
  for (const k of ['w', 'b'] as const) {
    if (sides[k].rated > 0) sides[k].accuracy = sums[k] / sides[k].rated
  }
  return { white: sides.w, black: sides.b }
}

/** Plain-language feedback built only from the engine's numbers. */
export function feedbackText(c: PlyClassification, playedSan: string): string {
  const pawns = (c.lossCp / 100).toFixed(1)
  switch (c.category) {
    case 'best':
      return `${playedSan} is the engine's top choice.`
    case 'good':
      return c.lossCp < 10
        ? `${playedSan} is a good move, about as strong as the best one (${c.bestSan}).`
        : `${playedSan} is a good move. ${c.bestSan} was slightly stronger.`
    case 'missed-mate':
      return c.mateIn === 1
        ? `${playedSan} missed a checkmate in one. ${c.bestSan} was checkmate.`
        : `${playedSan} missed a forced checkmate in ${c.mateIn}. ${c.bestSan} was the start of it.`
    default:
      if (c.allowsMateIn) {
        return `${playedSan} is ${c.category === 'inaccuracy' ? 'an' : 'a'} ${CATEGORY_META[c.category].label.toLowerCase()}: it lets the opponent force checkmate in ${c.allowsMateIn}. ${c.bestSan} was better.`
      }
      return `${playedSan} is ${c.category === 'inaccuracy' ? 'an' : 'a'} ${CATEGORY_META[c.category].label.toLowerCase()}. ${c.bestSan} was better (about ${pawns} pawns more).`
  }
}
