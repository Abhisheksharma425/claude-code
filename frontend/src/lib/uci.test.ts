import { describe, expect, it } from 'vitest'
import { START_FEN } from './game'
import { evalInWords, formatLine, parseInfo, pvToSan, scoreLabel, whiteBarPercent } from './uci'

describe('parseInfo', () => {
  const line = 'info depth 16 seldepth 22 multipv 2 score cp 35 nodes 1000 nps 5000 pv e2e4 e7e5 g1f3'
  it('reads depth, multipv, score and pv', () => {
    expect(parseInfo(line, true)).toEqual({
      multipv: 2, depth: 16, score: { type: 'cp', value: 35 }, pv: ['e2e4', 'e7e5', 'g1f3'],
    })
  })
  it('flips the score to White\'s view when Black is to move', () => {
    expect(parseInfo(line, false)!.score).toEqual({ type: 'cp', value: -35 })
    expect(parseInfo('info depth 5 multipv 1 score mate 3 pv a1a8', false)!.score).toEqual({ type: 'mate', value: -3 })
  })
  it('defaults multipv to 1 and ignores noise and bounds', () => {
    expect(parseInfo('info depth 3 score cp 10 pv e2e4', true)!.multipv).toBe(1)
    expect(parseInfo('info string NNUE evaluation using nn.nnue', true)).toBeNull()
    expect(parseInfo('info depth 3 score cp 10 lowerbound pv e2e4', true)).toBeNull()
    expect(parseInfo('bestmove e2e4', true)).toBeNull()
  })
})

describe('pvToSan / formatLine', () => {
  it('converts UCI to SAN and numbers it', () => {
    const san = pvToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])
    expect(san).toEqual(['e4', 'e5', 'Nf3'])
    expect(formatLine(START_FEN, san)).toBe('1. e4 e5 2. Nf3')
  })
  it('numbers correctly when Black is to move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    expect(formatLine(fen, pvToSan(fen, ['e7e5', 'g1f3']))).toBe('1... e5 2. Nf3')
  })
  it('stops at an illegal move and handles promotion', () => {
    expect(pvToSan(START_FEN, ['e2e4', 'e2e4'])).toEqual(['e4'])
    expect(pvToSan('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'])).toEqual(['a8=Q'])
  })
})

describe('eval presentation', () => {
  it('labels scores', () => {
    expect(scoreLabel({ type: 'cp', value: 35 })).toBe('+0.35')
    expect(scoreLabel({ type: 'cp', value: -120 })).toBe('-1.20')
    expect(scoreLabel({ type: 'mate', value: 3 })).toBe('M3')
    expect(scoreLabel({ type: 'mate', value: -2 })).toBe('-M2')
  })
  it('describes in plain words', () => {
    expect(evalInWords({ type: 'cp', value: 5 })).toBe('The position is equal')
    expect(evalInWords({ type: 'cp', value: 40 })).toBe('White is slightly better')
    expect(evalInWords({ type: 'cp', value: -150 })).toBe('Black is better')
    expect(evalInWords({ type: 'cp', value: 300 })).toBe('White is much better')
    expect(evalInWords({ type: 'cp', value: -900 })).toBe('Black is winning')
    expect(evalInWords({ type: 'mate', value: 1 })).toBe('White can force checkmate in 1 move')
    expect(evalInWords({ type: 'mate', value: -4 })).toBe('Black can force checkmate in 4 moves')
  })
  it('maps the bar sensibly', () => {
    expect(whiteBarPercent({ type: 'cp', value: 0 })).toBe(50)
    expect(whiteBarPercent({ type: 'mate', value: 2 })).toBe(100)
    expect(whiteBarPercent({ type: 'mate', value: -2 })).toBe(0)
    expect(whiteBarPercent({ type: 'cp', value: 100 })).toBeGreaterThan(55)
    expect(whiteBarPercent({ type: 'cp', value: -100 })).toBeLessThan(45)
  })
})
