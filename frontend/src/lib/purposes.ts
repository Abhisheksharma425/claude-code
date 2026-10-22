import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { analyzePosition, HOME_SQUARES, other, PIECE_NAME, PIECE_VALUE } from './facts'

export type PurposeTag =
  | 'Develops'
  | 'Controls center'
  | 'Attacks'
  | 'Defends'
  | 'Creates threat'
  | 'Trades'
  | 'King safety'
  | 'Prepares plan'
  | 'Sets trap'

export interface MovePurposes {
  /** Every tag that applies, most important first. The AI may only choose among these. */
  tags: PurposeTag[]
  /** Plain facts behind the tags, each starting with its tag: "Attacks: attacks the rook on a8". Same order as `tags`. */
  notes: string[]
}

type MoveInput = string | { from: string; to: string; promotion?: string }

const PRIORITY: PurposeTag[] = [
  'Sets trap', 'Creates threat', 'King safety', 'Trades', 'Attacks', 'Defends', 'Develops', 'Controls center', 'Prepares plan',
]

const SAFETY_RANK = { exposed: 0, ok: 1, safe: 2 } as const
const name = (t: PieceSymbol) => PIECE_NAME[t]

/**
 * Bait check: after the mover's move (opponent to move), is there a capture for the opponent
 * after which the mover can give checkmate in one? Then the "free" piece is poisoned.
 */
export function setsTrap(fenAfterMove: string): boolean {
  const chess = new Chess(fenAfterMove)
  for (const reply of chess.moves({ verbose: true })) {
    if (!reply.captured) continue
    const next = new Chess(reply.after)
    if (next.moves().some((m) => m.endsWith('#'))) return true
  }
  return false
}

/** Works out why a move is played, from the position alone (no engine, no AI). Null if the move is illegal. */
export function movePurposes(fenBefore: string, move: MoveInput): MovePurposes | null {
  const chess = new Chess(fenBefore)
  let m
  try {
    m = typeof move === 'string' ? chess.move(move) : chess.move({ from: move.from, to: move.to, promotion: move.promotion })
  } catch {
    return null
  }
  const mover: Color = m.color
  const enemy = other(mover)
  const fenAfter = chess.fen()
  const beforeBoard = new Chess(fenBefore)
  const before = analyzePosition(fenBefore)
  const after = analyzePosition(fenAfter)
  const found: { tag: PurposeTag; note: string }[] = []
  const add = (tag: PurposeTag, note: string) => {
    found.push({ tag, note })
  }

  // Develops: a knight or bishop leaves its starting square.
  if ((m.piece === 'n' || m.piece === 'b') && HOME_SQUARES[mover][m.piece].includes(m.from)) {
    add('Develops', `brings the ${name(m.piece)} out from ${m.from}`)
  }

  // Controls center: more attacks on / pieces in d4, e4, d5, e5.
  if (after.centerControl[mover] > before.centerControl[mover]) {
    add('Controls center', 'increases control of the center squares (d4, e4, d5, e5)')
  }

  // Attacks: the moved piece now hits something valuable or undefended that it did not hit before.
  const afterBoard = chess
  for (let f = 0; f < 8; f++) {
    for (let r = 1; r <= 8; r++) {
      const sq = ('abcdefgh'[f] + r) as Square
      const target = afterBoard.get(sq)
      if (!target || target.color !== enemy || target.type === 'k') continue
      if (!afterBoard.attackers(sq, mover).includes(m.to)) continue
      if (m.captured === undefined && beforeBoard.attackers(sq, mover).includes(m.from)) continue
      const undefended = afterBoard.attackers(sq, enemy).length === 0
      if (PIECE_VALUE[target.type] > PIECE_VALUE[m.piece] || undefended) {
        add('Attacks', `attacks the ${name(target.type)} on ${sq}${undefended ? ' (nothing defends it)' : ''}`)
      }
    }
  }
  if (m.captured && afterBoard.attackers(m.to, enemy).length === 0) {
    add('Attacks', `wins the ${name(m.captured)} on ${m.to} with nothing able to take back`)
  }

  // Trades: captures something that can be recaptured.
  if (m.captured && afterBoard.attackers(m.to, enemy).length > 0) {
    add('Trades', `takes the ${name(m.captured)} on ${m.to}; the opponent can take back, so pieces are exchanged`)
  }

  // Defends: a piece of the mover's that was in danger is no longer in danger.
  const wasThreatened = before.threatenedPieces[mover].map((t) => t.square)
  const stillThreatened = new Set(after.threatenedPieces[mover].map((t) => t.square))
  const saved = before.threatenedPieces[mover].filter((t) => {
    const nowAt = t.square === m.from ? m.to : t.square
    return !stillThreatened.has(nowAt)
  })
  if (wasThreatened.length > 0 && saved.length > 0) {
    add('Defends', `saves the ${name(saved[0].type)} that was in danger on ${saved[0].square}`)
  }

  // Creates threat: check, a mate threat, or a new fork chance.
  if (m.san.endsWith('+')) add('Creates threat', 'gives check')
  const mateNext = after.tactics[mover].available ? after.tactics[mover].mateInOne : []
  if (mateNext.length > 0 && !m.san.endsWith('#')) add('Creates threat', `threatens checkmate with ${mateNext[0]}`)
  const forkNext = after.tactics[mover].available ? after.tactics[mover].forks : []
  if (forkNext.length > 0 && forkNext.length > before.tactics[mover].forks.length) {
    add('Creates threat', `threatens a fork with ${forkNext[0].san}`)
  }

  // King safety: castling, an escape from check, or a clearly safer king.
  if (m.flags.includes('k') || m.flags.includes('q')) {
    add('King safety', 'castles, tucking the king away behind its pawns')
  } else if (m.piece === 'k' && before.inCheck) {
    add('King safety', 'moves the king out of check')
  } else if (SAFETY_RANK[after.kingSafety[mover].level] > SAFETY_RANK[before.kingSafety[mover].level]) {
    add('King safety', 'makes the king safer')
  }

  // Sets trap: leaves bait that loses to a checkmate.
  if (!m.san.endsWith('#') && setsTrap(fenAfter)) {
    add('Sets trap', 'leaves a piece that looks free to take, but taking it allows checkmate')
  }

  // Prepares plan: rooks to open files, and the fallback for quiet improving moves.
  const file = m.to[0]
  if (m.piece === 'r' && (after.openFiles.includes(file) || after.halfOpenFiles[mover].includes(file))) {
    add('Prepares plan', `puts the rook on the ${file}-file, which has no pawns of its own to block it`)
  }
  if (found.length === 0) add('Prepares plan', 'improves the position without an immediate threat')

  const ordered = [...found].sort((a, b) => PRIORITY.indexOf(a.tag) - PRIORITY.indexOf(b.tag))
  return {
    tags: PRIORITY.filter((t) => found.some((f) => f.tag === t)),
    notes: ordered.map((f) => `${f.tag}: ${f.note}`),
  }
}
