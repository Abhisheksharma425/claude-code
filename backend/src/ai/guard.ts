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

/** Every string anywhere inside a value. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out))
  else if (typeof v === 'object' && v !== null) Object.values(v).forEach((x) => allStrings(x, out))
  return out
}

/** Moves mentioned anywhere in the explanation (including the overview) that were not in the data we sent. */
export function findUnknownMoves(explanation: Explanation | Record<string, unknown>, sentData: string): string[] {
  const allowed = moveTokens(sentData)
  const used = moveTokens(allStrings(explanation).join('\n'))
  return [...used].filter((m) => !allowed.has(m))
}
