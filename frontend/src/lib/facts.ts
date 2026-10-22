import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

// Everything here is computed from the position with plain chess rules. No engine, no AI.

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
}

const FILES = 'abcdefgh'
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

interface Piece {
  square: Square
  type: PieceSymbol
  color: Color
}

const fileOf = (sq: string) => FILES.indexOf(sq[0])
const rankOf = (sq: string) => Number(sq[1])
const sqAt = (file: number, rank: number) => (FILES[file] + rank) as Square

function allPieces(chess: Chess): Piece[] {
  return chess
    .board()
    .flat()
    .filter((p): p is Piece => p !== null)
}

// ---------- Types ----------

export type Phase = 'opening' | 'middlegame' | 'endgame'

export interface Attacker {
  square: Square
  type: PieceSymbol
}

export interface PieceThreat {
  square: Square
  type: PieceSymbol
  color: Color
  attackers: Attacker[]
  defenders: number
  /** Attacked and nothing defends it. */
  hanging: boolean
  /** Attacked by a piece worth less than it. */
  byLower: boolean
}

export interface Fork {
  from: Square
  to: Square
  piece: PieceSymbol
  san: string
  targets: Attacker[]
}

export interface Pin {
  pinner: Attacker
  pinned: Attacker
  behind: Attacker
  /** True when the piece behind is the king (the pinned piece may not move at all). */
  absolute: boolean
}

export interface Skewer {
  attacker: Attacker
  front: Attacker
  behind: Attacker
}

export interface SideTactics {
  /**
   * False when this side's moves could not be worked out: it is not their turn AND the side to move
   * is in check, so (like Lichess "show threat") we don't pretend they get a free move.
   */
  available: boolean
  checks: string[]
  mateInOne: string[]
  forks: Fork[]
  /** Pins and skewers this side's pieces are creating. */
  pins: Pin[]
  skewers: Skewer[]
}

export interface KingSafety {
  kingSquare: Square | null
  castled: boolean
  canCastle: boolean
  /** Own pawns on the squares directly in front of the king (0-3 files checked). */
  shieldPawns: number
  shieldMax: number
  openFilesNearKing: string[]
  halfOpenFilesNearKing: string[]
  level: 'safe' | 'ok' | 'exposed'
}

export interface PawnStructure {
  isolated: Square[]
  doubled: Square[]
  passed: Square[]
}

export interface WeakSquare {
  square: Square
  /** An enemy knight or bishop is already sitting on it. */
  enemyOutpost?: PieceSymbol
}

export interface ActivePiece {
  square: Square
  type: PieceSymbol
  /** Number of squares the piece can move to or capture on, ignoring pins and checks. */
  mobility: number
}

export interface PieceActivity {
  active: ActivePiece[]
  passive: ActivePiece[]
}

export type MoveKind = 'capture' | 'check' | 'checkmate' | 'castle' | 'development' | 'pawn-push' | 'promotion'

export interface LastMoveInfo {
  san: string
  color: Color
  kinds: MoveKind[]
  /** Short plain-words label, e.g. "Capture with check". */
  label: string
}

export interface PositionFacts {
  fen: string
  turn: Color
  inCheck: boolean
  phase: Phase
  material: { white: number; black: number; balance: number; summary: string }
  threatenedPieces: Record<Color, PieceThreat[]>
  tactics: Record<Color, SideTactics>
  kingSafety: Record<Color, KingSafety>
  centerControl: Record<Color, number>
  undeveloped: Record<Color, Square[]>
  pawnStructure: Record<Color, PawnStructure>
  openFiles: string[]
  halfOpenFiles: Record<Color, string[]>
  weakSquares: Record<Color, WeakSquare[]>
  pieceActivity: Record<Color, PieceActivity>
  lastMove: LastMoveInfo | null
}

// ---------- Phase & material ----------

export function nonPawnMaterial(pieces: Piece[]): number {
  return pieces.filter((p) => p.type !== 'p' && p.type !== 'k').reduce((s, p) => s + PIECE_VALUE[p.type], 0)
}

export function gamePhase(pieces: Piece[], fullmove: number): Phase {
  const npm = nonPawnMaterial(pieces)
  if (npm <= 24) return 'endgame'
  if (fullmove <= 10 && npm >= 50) return 'opening'
  return 'middlegame'
}

function materialFacts(pieces: Piece[]): PositionFacts['material'] {
  const sum = (c: Color) =>
    pieces.filter((p) => p.color === c && p.type !== 'k').reduce((s, p) => s + PIECE_VALUE[p.type], 0)
  const white = sum('w')
  const black = sum('b')
  const balance = white - black
  const points = Math.abs(balance)
  const summary =
    balance === 0
      ? 'Material is equal.'
      : `${balance > 0 ? 'White' : 'Black'} is ahead by ${points} point${points === 1 ? '' : 's'} of material.`
  return { white, black, balance, summary }
}

// ---------- Hanging / attacked-by-lower ----------

function threatenedPieces(chess: Chess, pieces: Piece[]): Record<Color, PieceThreat[]> {
  const out: Record<Color, PieceThreat[]> = { w: [], b: [] }
  for (const p of pieces) {
    if (p.type === 'k') continue
    const atkSquares = chess.attackers(p.square, other(p.color))
    if (atkSquares.length === 0) continue
    const attackers: Attacker[] = atkSquares.map((s) => ({ square: s, type: chess.get(s)!.type }))
    const defenders = chess.attackers(p.square, p.color).length
    const hanging = defenders === 0
    const byLower = p.type !== 'p' && attackers.some((a) => PIECE_VALUE[a.type] < PIECE_VALUE[p.type])
    if (hanging || byLower) {
      out[p.color].push({ square: p.square, type: p.type, color: p.color, attackers, defenders, hanging, byLower })
    }
  }
  for (const c of ['w', 'b'] as const) out[c].sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])
  return out
}

// ---------- Pins & skewers (pure geometry, independent of whose turn it is) ----------

const DIAGONALS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ORTHOGONALS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function linePins(pieces: Piece[], color: Color): { pins: Pin[]; skewers: Skewer[] } {
  const bySquare = new Map(pieces.map((p) => [p.square, p]))
  const pins: Pin[] = []
  const skewers: Skewer[] = []
  const asAttacker = (p: Piece): Attacker => ({ square: p.square, type: p.type })

  for (const s of pieces) {
    if (s.color !== color || (s.type !== 'b' && s.type !== 'r' && s.type !== 'q')) continue
    const dirs = s.type === 'b' ? DIAGONALS : s.type === 'r' ? ORTHOGONALS : [...DIAGONALS, ...ORTHOGONALS]
    for (const [df, dr] of dirs) {
      const found: Piece[] = []
      let f = fileOf(s.square) + df
      let r = rankOf(s.square) + dr
      while (f >= 0 && f < 8 && r >= 1 && r <= 8 && found.length < 2) {
        const p = bySquare.get(sqAt(f, r))
        if (p) found.push(p)
        f += df
        r += dr
      }
      if (found.length < 2) continue
      const [front, behind] = found
      if (front.color === color || behind.color === color) continue
      const fv = PIECE_VALUE[front.type]
      const bv = PIECE_VALUE[behind.type]
      if (front.type === 'k') {
        if (bv >= 3) skewers.push({ attacker: asAttacker(s), front: asAttacker(front), behind: asAttacker(behind) })
      } else if (behind.type === 'k') {
        pins.push({ pinner: asAttacker(s), pinned: asAttacker(front), behind: asAttacker(behind), absolute: true })
      } else if (bv > fv && fv >= 3) {
        pins.push({ pinner: asAttacker(s), pinned: asAttacker(front), behind: asAttacker(behind), absolute: false })
      } else if (fv > bv && fv >= 5 && bv >= 3) {
        skewers.push({ attacker: asAttacker(s), front: asAttacker(front), behind: asAttacker(behind) })
      }
    }
  }
  return { pins, skewers }
}

// ---------- Tactics that need move generation (checks, mate in 1, forks) ----------

/** The position with `color` to move, or null if that isn't a sensible question (in check / game over). */
export function positionWithTurn(fen: string, color: Color): string | null {
  const chess = new Chess(fen)
  if (chess.isGameOver()) return null
  if (chess.turn() === color) return fen
  if (chess.inCheck()) return null
  const parts = fen.split(' ')
  parts[1] = color
  parts[3] = '-' // an en-passant right belongs to the original side to move
  return parts.join(' ')
}

function findForks(chess: Chess, color: Color): Fork[] {
  const forks: Fork[] = []
  const enemy = other(color)
  for (const m of chess.moves({ verbose: true })) {
    if (m.piece === 'k') continue
    const after = new Chess(m.after)
    const pv = PIECE_VALUE[m.piece]

    // Is the forking piece safe where it lands?
    const hitters = after.attackers(m.to, enemy)
    if (hitters.length > 0) {
      const minHit = Math.min(...hitters.map((s) => PIECE_VALUE[after.get(s)!.type]))
      const defended = after.attackers(m.to, color).length > 0
      if (!defended || minHit < pv) continue
    }

    const targets: Attacker[] = []
    for (const p of allPieces(after)) {
      if (p.color !== enemy || !after.attackers(p.square, color).includes(m.to)) continue
      if (p.type === 'k') {
        targets.push({ square: p.square, type: 'k' })
      } else if (PIECE_VALUE[p.type] > pv) {
        targets.push({ square: p.square, type: p.type })
      } else if (PIECE_VALUE[p.type] >= 3 && after.attackers(p.square, enemy).length === 0) {
        targets.push({ square: p.square, type: p.type })
      }
    }
    if (targets.length >= 2) {
      forks.push({ from: m.from, to: m.to, piece: m.piece, san: m.san, targets })
    }
  }
  const score = (f: Fork) => f.targets.reduce((s, t) => s + Math.min(PIECE_VALUE[t.type], 10), 0)
  return forks.sort((a, b) => score(b) - score(a)).slice(0, 3)
}

function sideTactics(fen: string, color: Color, pieces: Piece[], chess: Chess): SideTactics {
  const { pins, skewers } = linePins(pieces, color)
  const ready = positionWithTurn(fen, color)
  if (!ready) return { available: false, checks: [], mateInOne: [], forks: [], pins, skewers }
  const mover = ready === fen ? chess : new Chess(ready)
  const moves = mover.moves({ verbose: true })
  return {
    available: true,
    checks: moves.filter((m) => m.san.endsWith('+')).map((m) => m.san),
    mateInOne: moves.filter((m) => m.san.endsWith('#')).map((m) => m.san),
    forks: findForks(mover, color),
    pins,
    skewers,
  }
}

// ---------- King safety, center, development ----------

function kingSafety(chess: Chess, pieces: Piece[], color: Color, phase: Phase): KingSafety {
  const king = pieces.find((p) => p.type === 'k' && p.color === color)
  const rights = chess.fen().split(' ')[2]
  const canCastle = color === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights)
  if (!king) {
    return {
      kingSquare: null, castled: false, canCastle, shieldPawns: 0, shieldMax: 0,
      openFilesNearKing: [], halfOpenFilesNearKing: [], level: 'ok',
    }
  }
  const kf = fileOf(king.square)
  const kr = rankOf(king.square)
  const homeRank = color === 'w' ? 1 : 8
  const castled = kr === homeRank && 'bcgh'.includes(king.square[0]) && !canCastle
  const dir = color === 'w' ? 1 : -1
  const pawns = pieces.filter((p) => p.type === 'p')

  let shieldPawns = 0
  let shieldMax = 0
  const open: string[] = []
  const halfOpen: string[] = []
  for (let f = kf - 1; f <= kf + 1; f++) {
    if (f < 0 || f > 7) continue
    shieldMax++
    const own = pawns.filter((p) => p.color === color && fileOf(p.square) === f)
    const theirs = pawns.filter((p) => p.color !== color && fileOf(p.square) === f)
    if (own.some((p) => rankOf(p.square) === kr + dir || rankOf(p.square) === kr + 2 * dir)) shieldPawns++
    if (own.length === 0) (theirs.length === 0 ? open : halfOpen).push(FILES[f])
  }

  let level: KingSafety['level'] =
    shieldPawns === 0 || open.length + halfOpen.length >= 2 ? 'exposed'
    : shieldPawns >= 2 && open.length + halfOpen.length === 0 ? 'safe'
    : 'ok'
  // An uncastled king in the middlegame isn't "safe" yet.
  if (level === 'safe' && !castled && canCastle && phase !== 'endgame') level = 'ok'
  return { kingSquare: king.square, castled, canCastle, shieldPawns, shieldMax, openFilesNearKing: open, halfOpenFilesNearKing: halfOpen, level }
}

const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5']

function centerControl(chess: Chess): Record<Color, number> {
  const out: Record<Color, number> = { w: 0, b: 0 }
  for (const sq of CENTER) {
    for (const c of ['w', 'b'] as const) {
      out[c] += chess.attackers(sq, c).length
      const occ = chess.get(sq)
      if (occ && occ.type === 'p' && occ.color === c) out[c] += 2
    }
  }
  return out
}

export const HOME_SQUARES: Record<Color, Record<'n' | 'b', Square[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] },
}

function undevelopedPieces(chess: Chess, color: Color): Square[] {
  const out: Square[] = []
  for (const t of ['n', 'b'] as const) {
    for (const sq of HOME_SQUARES[color][t]) {
      const p = chess.get(sq)
      if (p && p.type === t && p.color === color) out.push(sq)
    }
  }
  return out
}

// ---------- Pawn structure, files, weak squares ----------

function pawnStructure(pieces: Piece[], color: Color): PawnStructure {
  const own = pieces.filter((p) => p.type === 'p' && p.color === color)
  const theirs = pieces.filter((p) => p.type === 'p' && p.color !== color)
  const ownFiles = new Set(own.map((p) => fileOf(p.square)))
  const filesCount = (f: number) => own.filter((p) => fileOf(p.square) === f).length
  const ahead = (r: number, pr: number) => (color === 'w' ? pr > r : pr < r)

  const isolated = own.filter((p) => !ownFiles.has(fileOf(p.square) - 1) && !ownFiles.has(fileOf(p.square) + 1))
  const doubled = own.filter((p) => filesCount(fileOf(p.square)) > 1)
  const passed = own.filter((p) => {
    const f = fileOf(p.square)
    return !theirs.some((t) => Math.abs(fileOf(t.square) - f) <= 1 && ahead(rankOf(p.square), rankOf(t.square)))
  })
  const names = (ps: Piece[]) => ps.map((p) => p.square).sort()
  return { isolated: names(isolated), doubled: names(doubled), passed: names(passed) }
}

function fileStatus(pieces: Piece[]): { open: string[]; half: Record<Color, string[]> } {
  const pawns = pieces.filter((p) => p.type === 'p')
  const open: string[] = []
  const half: Record<Color, string[]> = { w: [], b: [] }
  for (let f = 0; f < 8; f++) {
    const w = pawns.some((p) => p.color === 'w' && fileOf(p.square) === f)
    const b = pawns.some((p) => p.color === 'b' && fileOf(p.square) === f)
    if (!w && !b) open.push(FILES[f])
    else if (!w) half.w.push(FILES[f])
    else if (!b) half.b.push(FILES[f])
  }
  return { open, half }
}

/** Squares in a side's own half that none of its pawns can ever defend again (central files only). */
function weakSquares(chess: Chess, pieces: Piece[], color: Color): WeakSquare[] {
  const pawns = pieces.filter((p) => p.type === 'p' && p.color === color)
  const ranks = color === 'w' ? [3, 4] : [6, 5]
  const out: WeakSquare[] = []
  for (const r of ranks) {
    for (let f = 2; f <= 5; f++) {
      const sq = sqAt(f, r)
      const occ = chess.get(sq)
      if (occ && occ.type === 'p' && occ.color === color) continue
      const canBeDefended = pawns.some(
        (p) => Math.abs(fileOf(p.square) - f) === 1 && (color === 'w' ? rankOf(p.square) < r : rankOf(p.square) > r),
      )
      if (canBeDefended) continue
      const enemyOutpost = occ && occ.color !== color && (occ.type === 'n' || occ.type === 'b') ? occ.type : undefined
      out.push(enemyOutpost ? { square: sq, enemyOutpost } : { square: sq })
    }
  }
  return out.slice(0, 6)
}

// ---------- Piece activity ----------

const KNIGHT_JUMPS: [number, number][] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
const ACTIVE_FROM: Partial<Record<PieceSymbol, number>> = { n: 5, b: 6, r: 8, q: 14 }
const PASSIVE_UP_TO: Partial<Record<PieceSymbol, number>> = { n: 2, b: 2, r: 3, q: 5 }

function mobility(p: Piece, bySquare: Map<string, Piece>): number {
  let count = 0
  const f0 = fileOf(p.square)
  const r0 = rankOf(p.square)
  const inside = (f: number, r: number) => f >= 0 && f < 8 && r >= 1 && r <= 8
  if (p.type === 'n') {
    for (const [df, dr] of KNIGHT_JUMPS) {
      const f = f0 + df
      const r = r0 + dr
      if (inside(f, r) && bySquare.get(sqAt(f, r))?.color !== p.color) count++
    }
    return count
  }
  const dirs = p.type === 'b' ? DIAGONALS : p.type === 'r' ? ORTHOGONALS : [...DIAGONALS, ...ORTHOGONALS]
  for (const [df, dr] of dirs) {
    let f = f0 + df
    let r = r0 + dr
    while (inside(f, r)) {
      const hit = bySquare.get(sqAt(f, r))
      if (hit) {
        if (hit.color !== p.color) count++
        break
      }
      count++
      f += df
      r += dr
    }
  }
  return count
}

/** The most active and most passive knights, bishops, rooks and queens of one side (at most 2 of each). */
function pieceActivity(pieces: Piece[], color: Color): PieceActivity {
  const bySquare = new Map(pieces.map((p) => [p.square as string, p]))
  const scored: ActivePiece[] = pieces
    .filter((p) => p.color === color && p.type !== 'p' && p.type !== 'k')
    .map((p) => ({ square: p.square, type: p.type, mobility: mobility(p, bySquare) }))
  const active = scored
    .filter((p) => p.mobility >= (ACTIVE_FROM[p.type] ?? Infinity))
    .sort((a, b) => b.mobility - a.mobility || a.square.localeCompare(b.square))
    .slice(0, 2)
  const passive = scored
    .filter((p) => p.mobility <= (PASSIVE_UP_TO[p.type] ?? -1))
    .sort((a, b) => a.mobility - b.mobility || PIECE_VALUE[b.type] - PIECE_VALUE[a.type] || a.square.localeCompare(b.square))
    .slice(0, 2)
  return { active, passive }
}

// ---------- Last move ----------

export function describeMove(fenBefore: string, san: string): LastMoveInfo | null {
  const chess = new Chess(fenBefore)
  let m
  try {
    m = chess.move(san)
  } catch {
    return null
  }
  const kinds: MoveKind[] = []
  if (m.flags.includes('k') || m.flags.includes('q')) kinds.push('castle')
  if (m.captured) kinds.push('capture')
  if (m.san.includes('#')) kinds.push('checkmate')
  else if (m.san.includes('+')) kinds.push('check')
  if (m.promotion) kinds.push('promotion')
  else if (m.piece === 'p' && !m.captured) kinds.push('pawn-push')
  if ((m.piece === 'n' || m.piece === 'b') && HOME_SQUARES[m.color][m.piece].includes(m.from)) kinds.push('development')

  const word: Record<MoveKind, string> = {
    capture: 'capture', check: 'check', checkmate: 'checkmate', castle: 'castling',
    development: 'development', 'pawn-push': 'pawn push', promotion: 'promotion',
  }
  const label =
    kinds.length === 0
      ? 'Quiet move'
      : kinds.map((k, i) => (i === 0 ? word[k][0].toUpperCase() + word[k].slice(1) : word[k])).join(' with ')
  return { san: m.san, color: m.color, kinds, label }
}

// ---------- Entry point ----------

export function analyzePosition(fen: string, last?: { fenBefore: string; san: string } | null): PositionFacts {
  const chess = new Chess(fen)
  const pieces = allPieces(chess)
  const fullmove = Number(fen.split(' ')[5]) || 1
  const phase = gamePhase(pieces, fullmove)
  const files = fileStatus(pieces)

  return {
    fen,
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    phase,
    material: materialFacts(pieces),
    threatenedPieces: threatenedPieces(chess, pieces),
    tactics: {
      w: sideTactics(fen, 'w', pieces, chess),
      b: sideTactics(fen, 'b', pieces, chess),
    },
    kingSafety: {
      w: kingSafety(chess, pieces, 'w', phase),
      b: kingSafety(chess, pieces, 'b', phase),
    },
    centerControl: centerControl(chess),
    undeveloped: { w: undevelopedPieces(chess, 'w'), b: undevelopedPieces(chess, 'b') },
    pawnStructure: { w: pawnStructure(pieces, 'w'), b: pawnStructure(pieces, 'b') },
    openFiles: files.open,
    halfOpenFiles: files.half,
    weakSquares: { w: weakSquares(chess, pieces, 'w'), b: weakSquares(chess, pieces, 'b') },
    pieceActivity: { w: pieceActivity(pieces, 'w'), b: pieceActivity(pieces, 'b') },
    lastMove: last ? describeMove(last.fenBefore, last.san) : null,
  }
}
