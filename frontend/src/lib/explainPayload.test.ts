import { describe, expect, it } from 'vitest'
import { classifyMove } from './classify'
import { buildExplainRequest } from './explainPayload'
import { analyzePosition } from './facts'
import { START_FEN } from './game'
import { buildThreatLists } from './threats'
import type { EngineLine } from './uci'

const AFTER_QH5 = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2'
const BEFORE = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

const L = (multipv: number, cp: number, pv: string[]): EngineLine => ({ multipv, depth: 16, score: { type: 'cp', value: cp }, pv })

describe('buildExplainRequest', () => {
  const lines = [L(1, -30, ['b8c6', 'f1c4', 'g7g6']), L(2, -24, ['d7d6']), L(3, -20, ['g8f6'])]
  const linesBefore = [L(1, 30, ['g1f3']), L(2, -40, ['d1h5'])]
  const facts = analyzePosition(AFTER_QH5, { fenBefore: BEFORE, san: 'Qh5' })
  const classification = classifyMove({ fenBefore: BEFORE, playedUci: 'd1h5', linesBefore })

  const req = buildExplainRequest({
    fen: AFTER_QH5,
    viewer: 'b',
    facts,
    lists: buildThreatLists(facts, 'b'),
    lines,
    linesBefore,
    lastPly: { san: 'Qh5', from: 'd1', to: 'h5', fen: AFTER_QH5 },
    fenBefore: BEFORE,
    classification,
  })!

  it('carries the engine data in SAN, with White-view scores', () => {
    expect(req.engine.bestMoveSan).toBe('Nc6')
    expect(req.engine.topLine).toMatchObject({ score: '-0.30', moves: '2... Nc6 3. Bc4 g6' })
    expect(req.engine.otherLines.map((l) => l.score)).toEqual(['-0.24', '-0.20'])
    expect(req.engine.evalBefore).toEqual({ score: '+0.30', words: 'White is slightly better' })
    expect(req.engine.evalAfter).toEqual({ score: '-0.30', words: 'Black is slightly better' })
  })

  it('carries the last move and its classification', () => {
    expect(req.lastMove).toMatchObject({
      san: 'Qh5', by: 'white',
      classification: { category: 'inaccuracy', label: 'Inaccuracy', betterMoveSan: 'Nf3', lossPawns: 0.7 },
    })
    expect(req.viewer).toBe('black')
    expect(req.sideToMove).toBe('black')
  })

  it('carries the purposes worked out by code, and the engine line as separate moves', () => {
    expect(req.lastMove!.purposes.tags).toContain('Attacks') // Qh5 hits the loose e5 pawn
    expect(req.lastMove!.purposes.notes.join(' ')).toContain('e5')
    expect(req.engine.bestMovePurposes!.tags).toContain('Develops') // Nc6
    expect(req.engine.topLine.plies).toEqual(['Nc6', 'Bc4', 'g6'])
    expect(req.engine.topLine.firstMoveBy).toBe('black')
    expect(req.facts.phaseTip).toMatch(/^Opening/)
  })

  it('carries computed facts and threats', () => {
    expect(req.facts.phase).toBe('opening')
    expect(req.facts.notes.find((n) => n.label === 'Center')).toBeTruthy()
    expect(req.threats.opponents[0]).toContain('e5 is hanging')
  })

  it('works with no last move or classification, and returns null without analysis', () => {
    const f = analyzePosition(START_FEN)
    const r = buildExplainRequest({
      fen: START_FEN, viewer: 'w', facts: f, lists: buildThreatLists(f, 'w'),
      lines: [L(1, 30, ['e2e4'])], linesBefore: null, lastPly: null, fenBefore: null, classification: null,
    })!
    expect(r.lastMove).toBeNull()
    expect(r.engine.evalBefore).toBeNull()
    expect(r.engine.bestMoveSan).toBe('e4')
    expect(r.engine.topLine.plies).toEqual(['e4'])
    expect(r.engine.topLine.firstMoveBy).toBe('white')
    expect(buildExplainRequest({ ...{ fen: START_FEN, viewer: 'w' as const, facts: f, lists: buildThreatLists(f, 'w') }, lines: [], linesBefore: null, lastPly: null, fenBefore: null, classification: null })).toBeNull()
  })
})
