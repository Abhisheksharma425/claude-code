import { describe, expect, it } from 'vitest'
import { newGame, playMove, type GameState } from './game'
import { START_FEN } from './game'
import {
  categoryForLoss, classifyGame, classifyMove, feedbackText, moveAccuracy, plyUci, summarizeGame,
} from './classify'
import type { EngineLine, Score } from './uci'

const line = (multipv: number, score: Score, pv: string[]): EngineLine => ({ multipv, depth: 16, score, pv })
const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('categoryForLoss', () => {
  it('uses the agreed thresholds', () => {
    expect(categoryForLoss(0)).toBe('good')
    expect(categoryForLoss(49)).toBe('good')
    expect(categoryForLoss(50)).toBe('inaccuracy')
    expect(categoryForLoss(99)).toBe('inaccuracy')
    expect(categoryForLoss(100)).toBe('mistake')
    expect(categoryForLoss(200)).toBe('mistake')
    expect(categoryForLoss(201)).toBe('blunder')
  })
})

describe('classifyMove (White to move)', () => {
  const before = [line(1, cp(50), ['e2e4']), line(2, cp(30), ['d2d4']), line(3, cp(-60), ['a2a3'])]

  it('rates the engine top move as Best', () => {
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'e2e4', linesBefore: before })!
    expect(r.category).toBe('best')
    expect(r.lossCp).toBe(0)
    expect(r.bestSan).toBe('e4')
  })

  it('uses the played move\'s own MultiPV score when available', () => {
    const d4 = classifyMove({ fenBefore: START_FEN, playedUci: 'd2d4', linesBefore: before })!
    expect(d4.category).toBe('good') // 50 -> 30 = 20cp
    expect(d4.lossCp).toBe(20)
    const a3 = classifyMove({ fenBefore: START_FEN, playedUci: 'a2a3', linesBefore: before })!
    expect(a3.category).toBe('mistake') // 50 -> -60 = 110cp
    expect(a3.bestSan).toBe('e4')
  })

  it('falls back to the after-position score (White view) for other moves', () => {
    const r = (afterCp: number) =>
      classifyMove({ fenBefore: START_FEN, playedUci: 'h2h3', linesBefore: before, afterScore: cp(afterCp) })!
    expect(r(-10).category).toBe('inaccuracy') // 60
    expect(r(-300).category).toBe('blunder') // 350
    expect(r(45).category).toBe('good')
  })

  it('returns null when nothing is known about the played move yet', () => {
    expect(classifyMove({ fenBefore: START_FEN, playedUci: 'h2h3', linesBefore: before })).toBeNull()
    expect(classifyMove({ fenBefore: START_FEN, playedUci: 'e2e4', linesBefore: [] })).toBeNull()
  })

  it('never goes negative when the move turns out better than the top line', () => {
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'h2h3', linesBefore: before, afterScore: cp(200) })!
    expect(r.lossCp).toBe(0)
    expect(r.category).toBe('good')
  })

  it('does not count being even more winning as a loss', () => {
    const b = [line(1, cp(5000), ['e2e4'])]
    expect(classifyMove({ fenBefore: START_FEN, playedUci: 'h2h3', linesBefore: b, afterScore: cp(1500) })!.lossCp).toBe(0)
  })
})

describe('classifyMove (Black to move: scores are flipped to the mover\'s view)', () => {
  // White-view scores: Black's best is -80 (good for Black).
  const before = [line(1, cp(-80), ['e7e5']), line(2, cp(-70), ['c7c5'])]

  it('computes loss from Black\'s point of view', () => {
    const r = classifyMove({ fenBefore: BLACK_FEN, playedUci: 'g7g5', linesBefore: before, afterScore: cp(150) })!
    expect(r.color).toBe('b')
    expect(r.lossCp).toBe(230) // Black went from +80 to -150
    expect(r.category).toBe('blunder')
  })

  it('treats a move that improves White\'s eval as a loss for Black, not a gain', () => {
    const r = classifyMove({ fenBefore: BLACK_FEN, playedUci: 'c7c5', linesBefore: before })!
    expect(r.lossCp).toBe(10)
    expect(r.category).toBe('good')
  })
})

describe('mates', () => {
  it('flags a missed forced mate', () => {
    const before = [line(1, mate(2), ['e2e4']), line(2, cp(300), ['d2d4'])]
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'd2d4', linesBefore: before })!
    expect(r.category).toBe('missed-mate')
    expect(r.mateIn).toBe(2)
  })

  it('does not flag a missed mate if the mover still has a forced mate (just slower)', () => {
    const before = [line(1, mate(2), ['e2e4']), line(2, mate(4), ['d2d4'])]
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'd2d4', linesBefore: before })!
    expect(r.category).toBe('good')
  })

  it('flags missed mate for Black using Black\'s view (mate for Black is negative in White view)', () => {
    const before = [line(1, mate(-1), ['e7e5']), line(2, cp(-400), ['c7c5'])]
    expect(classifyMove({ fenBefore: BLACK_FEN, playedUci: 'c7c5', linesBefore: before })!.category).toBe('missed-mate')
  })

  it('rates walking into mate as a blunder', () => {
    const before = [line(1, cp(20), ['e2e4'])]
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'f2f3', linesBefore: before, afterScore: mate(-2) })!
    expect(r.category).toBe('blunder')
    expect(r.allowsMateIn).toBe(2)
  })

  it('rates the move that gives mate as Best when it is the engine\'s top move', () => {
    const before = [line(1, mate(1), ['a1a8'])]
    expect(classifyMove({ fenBefore: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', playedUci: 'a1a8', linesBefore: before })!.category).toBe('best')
  })
})

describe('moveAccuracy', () => {
  it('is 100 when nothing is lost and falls as the loss grows', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0)
    expect(moveAccuracy(50, -50)).toBeLessThan(moveAccuracy(50, 20))
    expect(moveAccuracy(500, -500)).toBeLessThan(10)
    expect(moveAccuracy(0, 300)).toBeCloseTo(100, 0)
  })
})

describe('plyUci', () => {
  it('adds the promotion piece', () => {
    expect(plyUci({ from: 'a7', to: 'a8', san: 'a8=Q' })).toBe('a7a8q')
    expect(plyUci({ from: 'e2', to: 'e4', san: 'e4' })).toBe('e2e4')
  })
})

function play(g: GameState, ...moves: [string, string][]): GameState {
  return moves.reduce((acc, [f, t]) => playMove(acc, f, t)!, g)
}

describe('classifyGame + summarizeGame', () => {
  // 1. e4 e5 2. Qh5
  const game = play(newGame(), ['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'])
  const fenAfter = (i: number) => game.plies[i].fen
  const store = new Map<string, EngineLine[]>([
    [START_FEN, [line(1, cp(30), ['e2e4']), line(2, cp(20), ['d2d4'])]],
    [fenAfter(0), [line(1, cp(-30), ['e7e5'])]],
    [fenAfter(1), [line(1, cp(35), ['g1f3']), line(2, cp(-200), ['d1h5'])]],
    [fenAfter(2), [line(1, cp(-90), ['b8c6'])]],
  ])
  const classes = classifyGame(game.startFen, game.plies, (f) => store.get(f))

  it('classifies each move from the right side\'s view', () => {
    expect(classes.map((c) => c?.category)).toEqual(['best', 'best', 'blunder'])
    expect(classes[2]!.bestSan).toBe('Nf3')
    expect(classes[2]!.color).toBe('w')
  })

  it('leaves unanalysed moves as null', () => {
    const partial = classifyGame(game.startFen, game.plies, (f) => (f === START_FEN ? store.get(f) : undefined))
    expect(partial).toEqual([expect.objectContaining({ category: 'best' }), null, null])
  })

  it('summarises accuracy and counts per side', () => {
    const s = summarizeGame(game.startFen, game.plies, classes)
    expect(s.white.total).toBe(2)
    expect(s.black.total).toBe(1)
    expect(s.white.counts.best).toBe(1)
    expect(s.white.counts.blunder).toBe(1)
    expect(s.black.counts.best).toBe(1)
    expect(s.black.accuracy).toBe(100)
    expect(s.white.accuracy!).toBeGreaterThan(0)
    expect(s.white.accuracy!).toBeLessThan(100)
  })

  it('reports null accuracy before anything is rated', () => {
    const s = summarizeGame(game.startFen, game.plies, [null, null, null])
    expect(s.white.accuracy).toBeNull()
    expect(s.white.rated).toBe(0)
  })

  it('treats a delivered checkmate as winning for the mover', () => {
    // Fool's mate: 1. f3 e5 2. g4 Qh4#
    const g = play(newGame(), ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
    const before = g.plies[2].fen
    const c = classifyGame(g.startFen, g.plies, (f) =>
      f === before ? [line(1, mate(-1), ['d8h4']), line(2, cp(100), ['b8c6'])] : undefined,
    )
    expect(c[3]!.category).toBe('best')
    const wrongMove = classifyGame(g.startFen, g.plies.slice(0, 3).concat({ ...g.plies[3], from: 'b8', to: 'c6', san: 'Nc6', fen: before }), (f) =>
      f === before ? [line(1, mate(-1), ['d8h4']), line(2, cp(100), ['b8c6'])] : undefined,
    )
    expect(wrongMove[3]!.category).toBe('missed-mate')
  })
})

describe('feedbackText', () => {
  const base = { color: 'w' as const, bestUci: 'g1f3', bestSan: 'Nf3', accuracy: 50 }
  it('names the better move for non-best moves', () => {
    expect(feedbackText({ ...base, category: 'blunder', lossCp: 350 }, 'Qh5')).toBe(
      'Qh5 is a blunder. Nf3 was better (about 3.5 pawns more).',
    )
    expect(feedbackText({ ...base, category: 'inaccuracy', lossCp: 60 }, 'h3')).toContain('an inaccuracy')
    expect(feedbackText({ ...base, category: 'missed-mate', lossCp: 700, mateIn: 3 }, 'h3')).toContain('checkmate in 3')
    expect(feedbackText({ ...base, category: 'missed-mate', lossCp: 700, mateIn: 1, bestSan: 'Ra8#' }, 'h3')).toBe(
      'h3 missed a checkmate in one. Ra8# was checkmate.',
    )
    expect(feedbackText({ ...base, category: 'blunder', lossCp: 1030, allowsMateIn: 1 }, 'Nf6')).toBe(
      'Nf6 is a blunder: it lets the opponent force checkmate in 1. Nf3 was better.',
    )
    expect(feedbackText({ ...base, category: 'best', lossCp: 0 }, 'e4')).toContain('top choice')
  })
})
