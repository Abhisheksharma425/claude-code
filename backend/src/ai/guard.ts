import type { Explanation } from './types.js'

/**
 * Core rule: the AI explains, Stockfish decides. So any move the AI writes (like "Nf3", "exd5", "O-O")
 * must already appear in the data we sent. Plain squares ("the pawn on e5") are fine.
 */
const MOVE_RE = /\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?/g

const normalize = (m: string) => m.replace(/[+#]$/, '')

export function moveTokens(text: string): Set<string> {
  return new Set((text.match(MOVE_RE) ?? []).map(normalize))
}

/** Moves mentioned in the explanation that were not in the data we sent. */
export function findUnknownMoves(explanation: Explanation, sentData: string): string[] {
  const allowed = moveTokens(sentData)
  const used = moveTokens(Object.values(explanation).join('\n'))
  return [...used].filter((m) => !allowed.has(m))
}
