import { describe, expect, it } from 'vitest'
import { analyzePosition } from './facts'
import { START_FEN } from './game'
import { buildThreatLists, evaluateThreat, highlightSquares, threatFen } from './threats'
import type { EngineLine, Score } from './uci'

const line = (score: Score, pv: string[]): EngineLine => ({ multipv: 1, depth: 16, score, pv })
const cp = (value: number): Score => ({ type: 'cp', value })

const AFTER_QH5 = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2'

describe('threat lists', () => {
  it('from Black\'s seat after 2.Qh5: the e5 pawn is in danger, and White\'s hanging pawn is not', () => {
    const lists = buildThreatLists(analyzePosition(AFTER_QH5), 'b')
    expect(lists.opponents.map((i) => i.kind)).toContain('hanging')
    const hanging = lists.opponents.find((i) => i.kind === 'hanging')!
    expect(hanging.text).toBe('Your pawn on e5 is hanging: attacked by a queen on h5, and nothing defends it.')
    expect(hanging.targets).toEqual(['e5'])
    expect(lists.yours.find((i) => i.kind === 'hanging')).toBeUndefined()
  })

  it('swaps wording when viewed from the other side', () => {
    const lists = buildThreatLists(analyzePosition(AFTER_QH5), 'w')
    expect(lists.yours.find((i) => i.kind === 'hanging')!.text).toBe(
      'Their pawn on e5 is hanging: attacked by a queen on h5, and nothing defends it.',
    )
  })

  it('reports mate threats against you and chances for you', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1' // Black to move; White threatens Ra8#
    expect(buildThreatLists(analyzePosition(fen), 'b').opponents[0]).toMatchObject({
      kind: 'mate', text: 'They threaten checkmate with Ra8#.',
    })
    expect(buildThreatLists(analyzePosition(fen), 'w').yours[0]).toMatchObject({
      kind: 'mate', text: 'You can checkmate right now with Ra8#.',
    })
  })

  it('describes forks and pins', () => {
    const fork = buildThreatLists(analyzePosition('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'), 'w').yours.find((i) => i.kind === 'fork')!
    expect(fork.text).toContain('Nc7+')
    expect(fork.text).toContain('king on e8')
    const pin = buildThreatLists(analyzePosition('4k3/4n3/8/8/8/8/8/4R1K1 w - - 0 1'), 'w').yours.find((i) => i.kind === 'pin')!
    expect(pin.text).toBe("Your rook on e1 pins their knight on e7 to the king: it can't legally move.")
  })

  it('tells you when you are in check', () => {
    const lists = buildThreatLists(analyzePosition('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'), 'w')
    expect(lists.opponents[0].kind).toBe('in-check')
  })

  it('is quiet in the start position', () => {
    const lists = buildThreatLists(analyzePosition(START_FEN), 'w')
    expect(lists.yours.filter((i) => i.kind !== 'check')).toEqual([])
    expect(lists.opponents).toEqual([])
  })
})

describe('highlightSquares', () => {
  it('separates my endangered pieces from the opponent pieces I attack', () => {
    const lists = buildThreatLists(analyzePosition(AFTER_QH5), 'b')
    expect(highlightSquares(lists)).toEqual({ danger: ['e5'], attacked: [] })
    const white = buildThreatLists(analyzePosition(AFTER_QH5), 'w')
    expect(highlightSquares(white)).toEqual({ danger: [], attacked: ['e5'] })
  })
})

describe('threatFen', () => {
  it('flips the side to move', () => {
    expect(threatFen(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')
  })
  it('returns null when in check or the game is over', () => {
    expect(threatFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeNull()
    expect(threatFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBeNull()
  })
})

describe('evaluateThreat', () => {
  // Black to move; White (the threatening side) is +0.2 now and would be +2.0 after its best move.
  const fen = AFTER_QH5
  it('labels a swing above 100cp a serious threat', () => {
    const v = evaluateThreat(fen, [line(cp(-20), ['d8f6'])], [line(cp(200), ['h5e5'])])!
    expect(v).toMatchObject({ attacker: 'w', uci: 'h5e5', swingCp: 220, serious: true })
  })
  it('does not call a small swing serious', () => {
    const v = evaluateThreat(fen, [line(cp(20), ['d8f6'])], [line(cp(100), ['b1c3'])])!
    expect(v.swingCp).toBe(80)
    expect(v.serious).toBe(false)
  })
  it('exactly 100 is not serious (must be more than 100)', () => {
    expect(evaluateThreat(fen, [line(cp(0), ['d8f6'])], [line(cp(100), ['b1c3'])])!.serious).toBe(false)
  })
  it('measures from the attacker\'s side when the attacker is Black', () => {
    // White to move; Black would threaten. White-view scores: now +50, after Black's move -150 => Black gains 200.
    const v = evaluateThreat(START_FEN, [line(cp(50), ['e2e4'])], [line(cp(-150), ['e7e5'])])!
    expect(v).toMatchObject({ attacker: 'b', swingCp: 200, serious: true })
  })
  it('handles mate scores', () => {
    const v = evaluateThreat(fen, [line(cp(0), ['d8f6'])], [line({ type: 'mate', value: 1 }, ['h5f7'])])!
    expect(v.serious).toBe(true)
  })
  it('returns null when there is nothing to compare', () => {
    expect(evaluateThreat(fen, [], [line(cp(0), ['a2a3'])])).toBeNull()
    expect(evaluateThreat('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', [line(cp(0), ['e1d1'])], [line(cp(0), ['e2e1'])])).toBeNull()
  })
})
