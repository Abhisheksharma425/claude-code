import { describe, expect, it } from 'vitest'
import type { PlyClassification } from './classify'
import { newGame, playMove, type GameState } from './game'
import { evalSeries, graphPaths, indexAtFraction, keyMoments, momentSummary, stepKeyMoment } from './keyMoments'
import type { EngineLine } from './uci'

const cls = (category: PlyClassification['category'], color: 'w' | 'b', lossCp = 0): PlyClassification => ({
  category, color, lossCp, bestUci: 'e2e4', bestSan: 'e4', accuracy: 50,
})
const play = (g: GameState, ...m: [string, string][]) => m.reduce((a, [f, t]) => playMove(a, f, t)!, g)

describe('keyMoments', () => {
  // 1. f3 e5 2. g4 Qh4#
  const game = play(newGame(), ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
  const classes = [cls('inaccuracy', 'w', 60), cls('best', 'b'), cls('blunder', 'w', 900), cls('best', 'b')]

  it('lists blunders, mistakes and missed mates with readable labels', () => {
    expect(keyMoments(game, classes)).toEqual([{ ply: 3, label: '2. g4', san: 'g4', category: 'blunder', color: 'w', lossCp: 900 }])
    const more = [cls('mistake', 'w', 120), cls('missed-mate', 'b', 500), ...classes.slice(2)]
    expect(keyMoments(game, more).map((m) => m.label)).toEqual(['1. f3', '1... e5', '2. g4'])
  })

  it('describes what went wrong in plain words', () => {
    expect(momentSummary({ category: 'blunder', lossCp: 350 }, 'Blunder')).toBe('Blunder · lost 3.5')
    expect(momentSummary({ category: 'blunder', lossCp: 1030, allowsMateIn: 2 }, 'Blunder')).toBe('Blunder · allows mate in 2')
    expect(momentSummary({ category: 'missed-mate', lossCp: 700, mateIn: 3 }, 'Missed mate')).toBe('Missed mate · mate in 3')
    const m = keyMoments(game, [null, null, { ...cls('blunder', 'w', 1030), allowsMateIn: 1 }, null])[0]
    expect(m.allowsMateIn).toBe(1)
  })

  it('skips unrated moves', () => {
    expect(keyMoments(game, [null, null, null, null])).toEqual([])
  })

  it('numbers moves correctly when Black starts', () => {
    const g = play(newGame('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), ['e7', 'e5'], ['g1', 'f3'])
    expect(keyMoments(g, [cls('blunder', 'b', 300), cls('mistake', 'w', 150)]).map((m) => m.label)).toEqual(['1... e5', '2. Nf3'])
  })

  it('steps to the next and previous key moment from any position', () => {
    const ms = [3, 7, 12].map((ply) => ({ ply, label: '', san: '', category: 'blunder' as const, color: 'w' as const, lossCp: 0 }))
    expect(stepKeyMoment(ms, 0, 1)?.ply).toBe(3)
    expect(stepKeyMoment(ms, 3, 1)?.ply).toBe(7) // already on it: go to the following one
    expect(stepKeyMoment(ms, 12, 1)).toBeNull()
    expect(stepKeyMoment(ms, 12, -1)?.ply).toBe(7)
    expect(stepKeyMoment(ms, 8, -1)?.ply).toBe(7)
    expect(stepKeyMoment(ms, 3, -1)).toBeNull()
    expect(stepKeyMoment([], 0, 1)).toBeNull()
  })
})

describe('evalSeries and graph geometry', () => {
  const game = play(newGame(), ['e2', 'e4'], ['e7', 'e5'])
  const line = (cp: number): EngineLine[] => [{ multipv: 1, depth: 16, score: { type: 'cp', value: cp }, pv: ['a2a3'] }]

  it('maps analysed positions to bar percentages and leaves gaps', () => {
    const known = new Map([[game.startFen, line(0)], [game.plies[1].fen, line(300)]])
    const s = evalSeries(game, (f) => known.get(f))
    expect(s[0]).toBe(50)
    expect(s[1]).toBeNull()
    expect(s[2]!).toBeGreaterThan(70)
  })

  it('scores finished games as a win or draw', () => {
    const mate = play(newGame(), ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
    expect(evalSeries(mate, () => undefined)[4]).toBe(0) // Black won
  })

  it('draws separate line segments across gaps and nothing for an empty series', () => {
    const { line, area } = graphPaths([50, 60, null, 40, 30], 100, 100)
    expect(line.match(/M/g)).toHaveLength(2)
    expect(area).toContain('Z')
    expect(graphPaths([null, null], 100, 100)).toEqual({ line: '', area: '' })
    expect(graphPaths([50], 100, 100).line).toBe('M0.0,50.0')
  })

  it('turns a click position into a ply index', () => {
    expect(indexAtFraction(0, 11)).toBe(0)
    expect(indexAtFraction(1, 11)).toBe(10)
    expect(indexAtFraction(0.5, 11)).toBe(5)
    expect(indexAtFraction(-1, 11)).toBe(0)
    expect(indexAtFraction(2, 11)).toBe(10)
    expect(indexAtFraction(0.5, 1)).toBe(0)
  })
})
