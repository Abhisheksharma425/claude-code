import type { Color } from 'chess.js'
import { CATEGORY_META, type PlyClassification } from './classify'
import type { PositionFacts } from './facts'
import { factLines, PHASE_TIPS } from './factsText'
import type { PlyInfo } from './game'
import { movePurposes } from './purposes'
import type { ThreatLists } from './threats'
import type { ExplainRequest } from './explainTypes'
import { evalInWords, formatLine, pvToSan, scoreLabel, type EngineLine } from './uci'

const colorName = (c: Color) => (c === 'w' ? 'white' : 'black')

export interface PayloadInput {
  fen: string
  viewer: Color
  facts: PositionFacts
  lists: ThreatLists
  /** Finished engine lines for `fen`. */
  lines: EngineLine[]
  /** Finished engine lines for the position before the last move, if known. */
  linesBefore: EngineLine[] | null
  lastPly: PlyInfo | null
  /** Position before the last move (needed to work out why it was played). */
  fenBefore: string | null
  classification: PlyClassification | null
}

const lineSummary = (fen: string, l: EngineLine) => ({
  score: scoreLabel(l.score),
  moves: formatLine(fen, pvToSan(fen, l.pv.slice(0, 8))),
})

/** Everything the coach may talk about: engine output and facts computed in code. No guessing allowed. */
export function buildExplainRequest(i: PayloadInput): ExplainRequest | null {
  const top = i.lines[0]
  if (!top) return null
  const bestUci = top.pv[0]
  const before = i.linesBefore?.[0]
  const plies = pvToSan(i.fen, top.pv.slice(0, 6))
  const bestPurposes = bestUci ? movePurposes(i.fen, { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }) : null
  const playedPurposes = i.lastPly && i.fenBefore ? movePurposes(i.fenBefore, i.lastPly.san) : null

  return {
    fen: i.fen,
    viewer: colorName(i.viewer),
    sideToMove: colorName(i.facts.turn),
    lastMove: i.lastPly
      ? {
          san: i.lastPly.san,
          by: i.facts.lastMove ? colorName(i.facts.lastMove.color) : colorName(i.facts.turn === 'w' ? 'b' : 'w'),
          label: i.facts.lastMove?.label ?? 'Move',
          purposes: playedPurposes ?? { tags: ['Prepares plan'], notes: [] },
          classification: i.classification
            ? {
                category: i.classification.category,
                label: CATEGORY_META[i.classification.category].label,
                lossPawns: Math.round(i.classification.lossCp / 10) / 10,
                betterMoveSan: i.classification.bestSan,
                mateIn: i.classification.mateIn,
                allowsMateIn: i.classification.allowsMateIn,
              }
            : null,
        }
      : null,
    engine: {
      depth: top.depth,
      bestMoveSan: bestUci ? (pvToSan(i.fen, [bestUci])[0] ?? null) : null,
      evalBefore: before ? { score: scoreLabel(before.score), words: evalInWords(before.score) } : null,
      evalAfter: { score: scoreLabel(top.score), words: evalInWords(top.score) },
      topLine: { ...lineSummary(i.fen, top), plies, firstMoveBy: colorName(i.facts.turn) },
      bestMovePurposes: bestPurposes,
      otherLines: i.lines.slice(1, 3).map((l) => lineSummary(i.fen, l)),
    },
    facts: {
      phase: i.facts.phase,
      phaseTip: PHASE_TIPS[i.facts.phase],
      material: i.facts.material.summary,
      notes: factLines(i.facts)
        .filter((l) => l.label !== 'Phase' && l.label !== 'Material')
        .map(({ label, text }) => ({ label, text })),
    },
    threats: {
      yours: i.lists.yours.map((t) => t.text),
      opponents: i.lists.opponents.map((t) => t.text),
    },
  }
}
