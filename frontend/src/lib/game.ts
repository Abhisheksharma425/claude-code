import { Chess, DEFAULT_POSITION } from 'chess.js'

export interface PlyInfo {
  san: string
  from: string
  to: string
  /** Position after this move. */
  fen: string
}

export interface GameState {
  startFen: string
  plies: PlyInfo[]
  /** Number of plies currently shown (0 = start position). */
  index: number
}

export const START_FEN = DEFAULT_POSITION

export function newGame(startFen: string = START_FEN): GameState {
  return { startFen, plies: [], index: 0 }
}

export function fenAt(g: GameState): string {
  return g.index === 0 ? g.startFen : g.plies[g.index - 1].fen
}

export function lastPly(g: GameState): PlyInfo | null {
  return g.index === 0 ? null : g.plies[g.index - 1]
}

export function canUndo(g: GameState): boolean {
  return g.index > 0
}

export function canRedo(g: GameState): boolean {
  return g.index < g.plies.length
}

export function jumpTo(g: GameState, index: number): GameState {
  return { ...g, index: Math.max(0, Math.min(g.plies.length, index)) }
}

/**
 * Plays a move from the current position. Returns null if illegal.
 * Playing from the middle of the game replaces the moves after it.
 */
export function playMove(
  g: GameState,
  from: string,
  to: string,
  promotion: string = 'q',
): GameState | null {
  const chess = new Chess(fenAt(g))
  try {
    const m = chess.move({ from, to, promotion })
    const plies = [...g.plies.slice(0, g.index), { san: m.san, from: m.from, to: m.to, fen: chess.fen() }]
    return { ...g, plies, index: plies.length }
  } catch {
    return null
  }
}

/** Turns a start FEN plus SAN list into a game, validating every move. */
function buildGame(startFen: string, sans: string[]): GameState {
  const chess = new Chess(startFen)
  const plies: PlyInfo[] = sans.map((san) => {
    const m = chess.move(san)
    return { san: m.san, from: m.from, to: m.to, fen: chess.fen() }
  })
  return { startFen, plies, index: plies.length }
}

export type ParseResult =
  | { ok: true; game: GameState; kind: 'fen' | 'pgn'; /** Something worth telling the user, e.g. that only the first of several games was loaded. */ note?: string }
  | { ok: false; error: string }

const MAX_INPUT_CHARS = 200_000
const SAN_LIKE = /^(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBNqrbn])?|O-O(?:-O)?|0-0(?:-0)?)[+#]?$/

/** Splits a file holding several PGN games at each "[Event" header line. */
function splitGames(text: string): string[] {
  const parts = text.split(/\n(?=\s*\[Event\s)/).map((t) => t.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [text]
}

/** Accepts the common "0-0" spelling of castling. (Results like 0-1 are untouched.) */
function fixCastling(pgn: string): string {
  return pgn.replace(/(?<![\w/-])0-0(-0)?(?![\w/-])/g, (m) => m.replace(/0/g, 'O'))
}

/** The moves of a PGN without headers, comments, variations, move numbers or annotations. */
function movetextTokens(pgn: string): string[] {
  let t = pgn.replace(/^\s*\[.*\]\s*$/gm, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
  for (let i = 0; i < 10 && /\([^()]*\)/.test(t); i++) t = t.replace(/\([^()]*\)/g, ' ') // nested variations, innermost first
  t = t.replace(/\$\d+/g, ' ').replace(/\d+\s*\.(?:\s*\.\.)?/g, ' ')
  return t
    .split(/\s+/)
    .map((x) => x.replace(/[!?]+$/, ''))
    .filter(Boolean)
}

/** Works out where a PGN goes wrong and says so in plain words. */
function diagnosePgn(pgn: string): string | null {
  const header = pgn.match(/^\s*\[FEN\s+"([^"]+)"\]/m)?.[1]
  let chess: Chess
  try {
    chess = new Chess(header ?? START_FEN)
  } catch {
    return null
  }
  for (const token of movetextTokens(pgn)) {
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) break
    const where = `${chess.moveNumber()}${chess.turn() === 'b' ? '...' : '.'}`
    if (!SAN_LIKE.test(token)) return `I couldn't understand “${token}” at move ${where} It should be a chess move like e4, Nf3 or O-O.`
    try {
      chess.move(token)
    } catch {
      return `Move ${where} ${token} isn't legal in that position. Check the PGN for a typo or a missing move before it.`
    }
  }
  return null
}

/** Accepts either a FEN or a PGN and returns a game, or a beginner-friendly error. */
export function parseInput(raw: string): ParseResult {
  const text = raw.trim()
  if (!text) return { ok: false, error: 'Paste a PGN or FEN first.' }
  if (text.length > MAX_INPUT_CHARS) return { ok: false, error: 'That is too long to load (over 200,000 characters). Paste a single game.' }

  // Anything on one line containing "/" (other than the 1/2-1/2 result) is treated as a FEN attempt.
  const oneLine = text.replace(/\s+/g, ' ')
  if (!text.includes('\n') && oneLine.replace(/1\/2-1\/2/g, '').includes('/')) {
    try {
      new Chess(oneLine)
      return { ok: true, game: newGame(oneLine), kind: 'fen' }
    } catch (e) {
      return { ok: false, error: `That FEN isn't valid: ${(e as Error).message}` }
    }
  }

  const games = splitGames(text)
  const pgn = fixCastling(games[0])
  try {
    const parsed = new Chess()
    parsed.loadPgn(pgn)
    const header = parsed.getHeaders().FEN
    const startFen = header ?? START_FEN
    const sans = parsed.history()
    if (sans.length === 0 && !header) {
      return { ok: false, error: 'No moves found. Check that this is a PGN (e.g. "1. e4 e5 2. Nf3") or a FEN.' }
    }
    const note = games.length > 1 ? `This file has ${games.length} games. Loaded the first one.` : undefined
    return { ok: true, game: buildGame(startFen, sans), kind: 'pgn', note }
  } catch (e) {
    const detail = diagnosePgn(pgn)
    return {
      ok: false,
      error: detail ?? `Couldn't read that PGN. Make sure it contains moves like "1. e4 e5 2. Nf3 Nc6" (${(e as Error).message.split('\n')[0].slice(0, 80)}).`,
    }
  }
}

export interface MoveRow {
  number: number
  white?: { san: string; ply: number }
  black?: { san: string; ply: number }
}

/** Groups plies into numbered rows; ply is the 1-based index to jump to. */
export function moveRows(g: GameState): MoveRow[] {
  const startsWithBlack = g.startFen.split(' ')[1] === 'b'
  const startNumber = Number(g.startFen.split(' ')[5]) || 1
  const rows: MoveRow[] = []
  g.plies.forEach((p, i) => {
    const blackMove = startsWithBlack ? i % 2 === 0 : i % 2 === 1
    if (!blackMove) {
      rows.push({ number: startNumber + (startsWithBlack ? (i + 1) / 2 : i / 2), white: { san: p.san, ply: i + 1 } })
    } else if (rows.length === 0 || rows[rows.length - 1].black) {
      rows.push({ number: startNumber, black: { san: p.san, ply: i + 1 } })
    } else {
      rows[rows.length - 1].black = { san: p.san, ply: i + 1 }
    }
  })
  return rows
}
