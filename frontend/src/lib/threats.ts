import type { Color, Square } from 'chess.js'
import { Chess } from 'chess.js'
import { povScore, toCp } from './classify'
import {
  PIECE_NAME, other, positionWithTurn,
  type Attacker, type PieceThreat, type PositionFacts,
} from './facts'
import type { EngineLine } from './uci'

export type ThreatKind = 'mate' | 'hanging' | 'attacked-by-lower' | 'fork' | 'pin' | 'skewer' | 'check' | 'in-check'

export interface ThreatItem {
  kind: ThreatKind
  text: string
  /** Squares of the pieces being threatened (for highlighting). */
  targets: Square[]
}

export interface ThreatLists {
  /** What the viewer can do to the opponent. */
  yours: ThreatItem[]
  /** What the opponent can do to the viewer. */
  opponents: ThreatItem[]
}

const piece = (a: Attacker) => `${PIECE_NAME[a.type]} on ${a.square}`
const aOrAn = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a')

/** Wording helpers: `who` is whose pieces/actions we're describing, `me` is the viewer. */
function voice(who: Color, me: Color) {
  const mine = who === me
  return {
    subject: mine ? 'You' : 'They',
    own: mine ? 'Your' : 'Their',
    ownLower: mine ? 'your' : 'their',
    // For the piece being attacked (belongs to the other side of `who`).
    victim: mine ? 'Their' : 'Your',
    victimLower: mine ? 'their' : 'your',
  }
}

function itemsFor(facts: PositionFacts, attacker: Color, me: Color): ThreatItem[] {
  const v = voice(attacker, me)
  const victimColor = other(attacker)
  const t = facts.tactics[attacker]
  const items: ThreatItem[] = []

  for (const san of t.mateInOne.slice(0, 2)) {
    items.push({
      kind: 'mate',
      text: attacker === me ? `You can checkmate right now with ${san}.` : `They threaten checkmate with ${san}.`,
      targets: [],
    })
  }

  const threatened: PieceThreat[] = facts.threatenedPieces[victimColor]
  for (const p of threatened) {
    const atk = p.attackers.map((a) => `${aOrAn(PIECE_NAME[a.type])} ${piece(a)}`).join(' and ')
    if (p.hanging) {
      items.push({
        kind: 'hanging',
        text: `${v.victim} ${piece(p)} is hanging: attacked by ${atk}, and nothing defends it.`,
        targets: [p.square],
      })
    } else {
      items.push({
        kind: 'attacked-by-lower',
        text: `${v.victim} ${piece(p)} is attacked by ${atk}, a less valuable piece, so trading would cost ${v.victimLower === 'your' ? 'you' : 'them'} material.`,
        targets: [p.square],
      })
    }
  }

  for (const f of t.forks) {
    items.push({
      kind: 'fork',
      text: `${v.subject} can fork ${v.victimLower} ${f.targets.map(piece).join(' and ')} with ${f.san}: one ${PIECE_NAME[f.piece]} attacking both.`,
      targets: f.targets.map((x) => x.square),
    })
  }

  for (const p of t.pins) {
    items.push({
      kind: 'pin',
      text: p.absolute
        ? `${v.own} ${piece(p.pinner)} pins ${v.victimLower} ${piece(p.pinned)} to the king: it can't legally move.`
        : `${v.own} ${piece(p.pinner)} pins ${v.victimLower} ${piece(p.pinned)} to ${v.victimLower} ${piece(p.behind)}: if it moves, the more valuable piece is lost.`,
      targets: [p.pinned.square],
    })
  }

  for (const s of t.skewers) {
    items.push({
      kind: 'skewer',
      text: `${v.own} ${piece(s.attacker)} skewers ${v.victimLower} ${PIECE_NAME[s.front.type]} on ${s.front.square}: when it moves away, the ${piece(s.behind)} is exposed.`,
      targets: [s.front.square, s.behind.square],
    })
  }

  if (t.mateInOne.length === 0 && t.checks.length > 0) {
    items.push({
      kind: 'check',
      text: `${v.subject} can give check with ${t.checks.slice(0, 3).join(', ')}.`,
      targets: [],
    })
  }
  return items
}

/** Builds the "Your threats" and "Opponent's threats" lists from the computed facts. */
export function buildThreatLists(facts: PositionFacts, me: Color): ThreatLists {
  const opp = other(me)
  const opponents = itemsFor(facts, opp, me)
  if (facts.inCheck && facts.turn === me) {
    opponents.unshift({ kind: 'in-check', text: "You're in check: you must deal with it right away.", targets: [] })
  }
  const yours = itemsFor(facts, me, me)
  if (facts.inCheck && facts.turn === opp) {
    yours.unshift({ kind: 'in-check', text: 'Your opponent is in check and must respond.', targets: [] })
  }
  return { yours, opponents }
}

/** Squares to highlight: my threatened pieces (red) and the opponent's pieces I'm attacking (orange). */
export function highlightSquares(lists: ThreatLists): { danger: Square[]; attacked: Square[] } {
  const pick = (items: ThreatItem[]) => [
    ...new Set(items.filter((i) => i.kind === 'hanging' || i.kind === 'attacked-by-lower').flatMap((i) => i.targets)),
  ]
  return { danger: pick(lists.opponents), attacked: pick(lists.yours) }
}

// ---------- "Show threat" (engine-based, like Lichess) ----------

/** FEN with the other side to move, or null if that's not possible (in check / game over). */
export function threatFen(fen: string): string | null {
  const chess = new Chess(fen)
  return positionWithTurn(fen, other(chess.turn()))
}

export interface ThreatVerdict {
  /** Side that would play the threatening move. */
  attacker: Color
  uci: string
  swingCp: number
  serious: boolean
}

export const SERIOUS_THREAT_CP = 100

/**
 * Compares the engine's evaluation of the flipped position with the real one, from the
 * threatening side's point of view. A swing above 100cp is a "Serious threat".
 */
export function evaluateThreat(
  fen: string,
  currentLines: EngineLine[],
  threatLines: EngineLine[],
): ThreatVerdict | null {
  const tfen = threatFen(fen)
  const cur = currentLines[0]
  const thr = threatLines[0]
  if (!tfen || !cur || !thr || thr.pv.length === 0) return null
  const attacker: Color = tfen.split(' ')[1] === 'b' ? 'b' : 'w'
  const isWhite = attacker === 'w'
  const swingCp = toCp(povScore(thr.score, isWhite)) - toCp(povScore(cur.score, isWhite))
  return { attacker, uci: thr.pv[0], swingCp, serious: swingCp > SERIOUS_THREAT_CP }
}
