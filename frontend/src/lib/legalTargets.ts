import { Chess } from 'chess.js'
import type { CSSProperties } from 'react'

export interface Target {
  square: string
  /** True when the move takes a piece (shown as a ring instead of a dot). */
  capture: boolean
}

/** Squares the piece on `square` can legally move to (empty when it isn't the side to move's piece). */
export function legalTargets(fen: string, square: string): Target[] {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return []
  }
  const seen = new Map<string, Target>()
  for (const m of chess.moves({ square: square as never, verbose: true })) {
    seen.set(m.to, { square: m.to, capture: m.isCapture() || m.isEnPassant() })
  }
  return [...seen.values()]
}

export interface ClickResult {
  /** The square to show as selected afterwards, or null. */
  selected: string | null
  /** Set when the click completes a move. */
  move?: { from: string; to: string }
}

/**
 * What a click on `square` does: pick one of your pieces, play to a highlighted square,
 * or (anywhere else) clear the selection. Clicking another of your pieces switches to it.
 */
export function clickOutcome(fen: string, selected: string | null, square: string): ClickResult {
  if (selected && legalTargets(fen, selected).some((t) => t.square === square)) return { selected: null, move: { from: selected, to: square } }
  if (square === selected) return { selected: null }
  return { selected: legalTargets(fen, square).length > 0 ? square : null }
}

const INK = '30, 41, 59'
const DOT = `radial-gradient(circle, rgba(${INK}, 0.22) 0 17%, transparent 19%)`
const RING = `radial-gradient(circle, transparent 0 64%, rgba(${INK}, 0.22) 66% 84%, transparent 86%)`

/** Very light dots on empty target squares, rings on captures, a soft tint on the selected square. */
export function hintStyles(fen: string, selected: string | null, base: Record<string, CSSProperties>): Record<string, CSSProperties> {
  if (!selected) return base
  const out = { ...base }
  out[selected] = { backgroundColor: 'rgba(59, 130, 246, 0.28)' }
  for (const t of legalTargets(fen, selected)) {
    // Own object: the glow styles use the `background` shorthand, which must not be mixed with longhands.
    out[t.square] = { backgroundColor: base[t.square]?.backgroundColor, backgroundImage: t.capture ? RING : DOT }
  }
  return out
}
