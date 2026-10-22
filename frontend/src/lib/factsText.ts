import type { Color } from 'chess.js'
import { PIECE_NAME, type PositionFacts } from './facts'

export interface FactLine {
  label: string
  text: string
}

const side = (c: Color) => (c === 'w' ? 'White' : 'Black')
const list = (xs: string[]) => xs.join(', ')

export const PHASE_TIPS = {
  opening: 'Opening: develop your pieces, fight for the center and castle.',
  middlegame: 'Middlegame: look for tactics, improve your worst piece and keep your king safe.',
  endgame: 'Endgame: activate your king and push passed pawns.',
} as const

/** Turns the computed facts into short plain-words lines for the "Position facts" panel. */
export function factLines(f: PositionFacts): FactLine[] {
  const lines: FactLine[] = []
  lines.push({ label: 'Phase', text: PHASE_TIPS[f.phase] })
  lines.push({ label: 'Material', text: f.material.summary })
  if (f.lastMove) lines.push({ label: 'Last move', text: `${f.lastMove.san}: ${f.lastMove.label.toLowerCase()}.` })

  for (const c of ['w', 'b'] as const) {
    const k = f.kingSafety[c]
    if (!k.kingSquare) continue
    const where = k.castled ? 'has castled' : k.canCastle ? "hasn't castled yet" : 'has lost the right to castle'
    const open = [...k.openFilesNearKing.map((x) => `${x}-file (open)`), ...k.halfOpenFilesNearKing.map((x) => `${x}-file (half-open)`)]
    const shield = `${k.shieldPawns} of ${k.shieldMax} shield pawns`
    const verdict = k.level === 'safe' ? 'looks safe' : k.level === 'ok' ? 'is okay' : 'is exposed'
    lines.push({
      label: `${side(c)} king`,
      text: `${where}, ${shield}${open.length ? `, ${list(open)} near the king` : ''}. It ${verdict}.`,
    })
  }

  const cw = f.centerControl.w
  const cb = f.centerControl.b
  lines.push({
    label: 'Center',
    text: Math.abs(cw - cb) < 2 ? `Center control is balanced (${cw} to ${cb}).` : `${side(cw > cb ? 'w' : 'b')} controls the center more (${cw} to ${cb}).`,
  })

  for (const c of ['w', 'b'] as const) {
    const u = f.undeveloped[c]
    if (u.length > 0 && f.phase !== 'endgame') {
      lines.push({ label: `${side(c)} development`, text: `${u.length} minor piece${u.length === 1 ? '' : 's'} still at home (${list(u)}).` })
    }
  }

  for (const c of ['w', 'b'] as const) {
    const p = f.pawnStructure[c]
    const parts: string[] = []
    if (p.isolated.length) parts.push(`isolated pawns on ${list(p.isolated)} (no friendly pawn beside them)`)
    if (p.doubled.length) parts.push(`doubled pawns on ${list(p.doubled)}`)
    if (p.passed.length) parts.push(`passed pawns on ${list(p.passed)} (nothing can stop them by pawns)`)
    if (parts.length) lines.push({ label: `${side(c)} pawns`, text: `${list(parts)}.` })
  }

  for (const c of ['w', 'b'] as const) {
    const a = f.pieceActivity[c]
    const desc = (ps: typeof a.active) => list(ps.map((x) => `${PIECE_NAME[x.type]} on ${x.square}`))
    const parts: string[] = []
    if (a.active.length) parts.push(`active: ${desc(a.active)}`)
    if (a.passive.length) parts.push(`passive (few squares to go to): ${desc(a.passive)}`)
    if (parts.length) lines.push({ label: `${side(c)} pieces`, text: `${parts.join('; ')}.` })
  }

  const files: string[] = []
  if (f.openFiles.length) files.push(`open: ${list(f.openFiles)}`)
  for (const c of ['w', 'b'] as const) {
    if (f.halfOpenFiles[c].length) files.push(`half-open for ${side(c)}: ${list(f.halfOpenFiles[c])}`)
  }
  if (files.length) lines.push({ label: 'Files', text: `${files.join('; ')}.` })

  for (const c of ['w', 'b'] as const) {
    const w = f.weakSquares[c]
    if (w.length) {
      lines.push({
        label: `${side(c)} weak squares`,
        text: `${list(w.map((x) => (x.enemyOutpost ? `${x.square} (enemy ${PIECE_NAME[x.enemyOutpost]} there)` : x.square)))}: no ${side(c)} pawn can defend them.`,
      })
    }
  }
  return lines
}
