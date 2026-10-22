import { describe, expect, it } from 'vitest'
import { START_FEN } from './game'
import { analyzePosition, describeMove, positionWithTurn } from './facts'

const AFTER_QH5 = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2'

describe('game phase and material', () => {
  it('detects opening, middlegame and endgame', () => {
    expect(analyzePosition(START_FEN).phase).toBe('opening')
    expect(analyzePosition('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 12').phase).toBe('middlegame')
    expect(analyzePosition('4k3/8/8/8/8/8/8/4K3 w - - 0 40').phase).toBe('endgame')
    expect(analyzePosition('4k3/pp3ppp/8/3r4/8/8/PP3PPP/3R2K1 w - - 0 30').phase).toBe('endgame')
  })

  it('counts material', () => {
    expect(analyzePosition(START_FEN).material).toMatchObject({ white: 39, black: 39, balance: 0, summary: 'Material is equal.' })
    const noWhiteQueen = analyzePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1').material
    expect(noWhiteQueen.balance).toBe(-9)
    expect(noWhiteQueen.summary).toBe('Black is ahead by 9 points of material.')
  })
})

describe('hanging pieces and attacks by cheaper pieces', () => {
  it('finds a hanging pawn', () => {
    const t = analyzePosition(AFTER_QH5).threatenedPieces.b
    const e5 = t.find((x) => x.square === 'e5')!
    expect(e5.hanging).toBe(true)
    expect(e5.attackers).toEqual([{ square: 'h5', type: 'q' }])
    // f7 and h7 are attacked by the queen but defended
    expect(t.find((x) => x.square === 'f7')).toBeUndefined()
    expect(t.find((x) => x.square === 'h7')).toBeUndefined()
  })

  it('finds a defended piece attacked by a pawn', () => {
    const t = analyzePosition('4k3/8/2p5/3n4/4P3/8/8/4K3 b - - 0 1').threatenedPieces.b
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ square: 'd5', hanging: false, byLower: true, defenders: 1 })
  })

  it('reports nothing in the start position', () => {
    const t = analyzePosition(START_FEN).threatenedPieces
    expect(t.w).toEqual([])
    expect(t.b).toEqual([])
  })

  it('sorts the most valuable piece first', () => {
    const t = analyzePosition('4k3/8/8/1q6/7n/3B4/8/4K2R b - - 0 1').threatenedPieces.b
    expect(t.map((x) => x.type)).toEqual(['q', 'n'])
  })
})

describe('forks', () => {
  it('finds a knight fork of king and rook', () => {
    const forks = analyzePosition('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1').tactics.w.forks
    expect(forks).toHaveLength(1)
    expect(forks[0]).toMatchObject({ from: 'b5', to: 'c7', piece: 'n', san: 'Nc7+' })
    expect(forks[0].targets.map((t) => t.square).sort()).toEqual(['a8', 'e8'])
  })

  it('ignores a fork where the forking piece would simply be captured', () => {
    // Same fork, but a black queen on c8 guards c7 and nothing supports the knight.
    const forks = analyzePosition('r1q1k3/8/8/1N6/8/8/8/4K3 w - - 0 1').tactics.w.forks
    expect(forks.find((f) => f.to === 'c7')).toBeUndefined()
  })

  it('finds nothing in the start position', () => {
    expect(analyzePosition(START_FEN).tactics.w.forks).toEqual([])
  })
})

describe('pins and skewers', () => {
  it('finds an absolute pin', () => {
    const { pins } = analyzePosition('4k3/4n3/8/8/8/8/8/4R1K1 w - - 0 1').tactics.w
    expect(pins).toEqual([
      {
        pinner: { square: 'e1', type: 'r' },
        pinned: { square: 'e7', type: 'n' },
        behind: { square: 'e8', type: 'k' },
        absolute: true,
      },
    ])
  })

  it('finds a relative pin to a more valuable piece', () => {
    // Bishop b5 pins knight c6 to queen d7? use rook-less line: Bb5, Nc6, Qe8
    const { pins } = analyzePosition('4q1k1/8/2n5/1B6/8/8/8/4K3 w - - 0 1').tactics.w
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({ pinned: { square: 'c6' }, behind: { square: 'e8', type: 'q' }, absolute: false })
  })

  it('finds a skewer of king and rook', () => {
    const { skewers } = analyzePosition('4r3/8/8/8/4k3/8/8/4R1K1 b - - 0 1').tactics.w
    expect(skewers).toEqual([
      {
        attacker: { square: 'e1', type: 'r' },
        front: { square: 'e4', type: 'k' },
        behind: { square: 'e8', type: 'r' },
      },
    ])
  })

  it('does not call a normal position pinned', () => {
    const f = analyzePosition(START_FEN)
    expect(f.tactics.w.pins).toEqual([])
    expect(f.tactics.b.skewers).toEqual([])
  })
})

describe('checks and mate in one', () => {
  it('finds mate in one', () => {
    const t = analyzePosition('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1').tactics.w
    expect(t.mateInOne).toEqual(['Ra8#'])
    expect(t.checks).toEqual([])
  })

  it('lists available checks', () => {
    const t = analyzePosition('4k3/8/8/8/8/8/R7/4K3 w - - 0 1').tactics.w
    expect(t.checks).toEqual(expect.arrayContaining(['Ra8+', 'Re2+']))
    expect(t.mateInOne).toEqual([])
  })

  it('finds the opponent\'s mate threat by flipping the side to move', () => {
    // Black to move, but White threatens Ra8# (back-rank mate).
    const f = analyzePosition('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1')
    expect(f.tactics.w.available).toBe(true)
    expect(f.tactics.w.mateInOne).toEqual(['Ra8#'])
  })

  it('does not invent the other side\'s moves while the mover is in check', () => {
    // White is in check from the rook, so Black's "threats" are not available.
    const f = analyzePosition('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')
    expect(f.inCheck).toBe(true)
    expect(f.tactics.b.available).toBe(false)
    expect(f.tactics.b.mateInOne).toEqual([])
  })
})

describe('positionWithTurn', () => {
  it('flips the side to move and clears en passant', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    expect(positionWithTurn(fen, 'w')).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')
    expect(positionWithTurn(fen, 'b')).toBe(fen)
  })
  it('refuses when in check or when the game is over', () => {
    expect(positionWithTurn('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', 'b')).toBeNull()
    expect(positionWithTurn('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'b')).toBeNull()
  })
})

describe('king safety', () => {
  it('start position: not castled, full shield, but not "safe" yet', () => {
    const k = analyzePosition(START_FEN).kingSafety.w
    expect(k).toMatchObject({ kingSquare: 'e1', castled: false, canCastle: true, shieldPawns: 3, shieldMax: 3, level: 'ok' })
    expect(k.openFilesNearKing).toEqual([])
  })

  it('castled king with a pawn shield is safe', () => {
    const f = analyzePosition('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 6 6')
    expect(f.kingSafety.w).toMatchObject({ castled: true, canCastle: false, shieldPawns: 3, level: 'safe' })
    expect(f.kingSafety.b).toMatchObject({ castled: true, level: 'safe' })
  })

  it('a king with no pawns and open files is exposed', () => {
    const k = analyzePosition('6k1/8/8/8/8/8/PPP5/R3K2R w KQ - 0 20').kingSafety.b
    expect(k.shieldPawns).toBe(0)
    expect(k.openFilesNearKing).toEqual(['f', 'g', 'h'])
    expect(k.level).toBe('exposed')
  })

  it('half-open files near the king count', () => {
    // White king g1 with no g-pawn while Black still has a g-pawn.
    const k = analyzePosition('6k1/5ppp/8/8/8/8/5P1P/6K1 w - - 0 30').kingSafety.w
    expect(k.halfOpenFilesNearKing).toEqual(['g'])
  })
})

describe('center, development', () => {
  it('compares center control', () => {
    const c = analyzePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1').centerControl
    expect(c.w).toBeGreaterThan(c.b)
    const s = analyzePosition(START_FEN).centerControl
    expect(s.w).toBe(s.b)
  })

  it('lists undeveloped minor pieces', () => {
    expect(analyzePosition(START_FEN).undeveloped.w).toEqual(['b1', 'g1', 'c1', 'f1'])
    const f = analyzePosition('rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2')
    expect(f.undeveloped.w).toEqual(['b1', 'c1', 'f1'])
    expect(f.undeveloped.b).toEqual(['b8', 'c8', 'f8'])
  })
})

describe('pawn structure', () => {
  const f = analyzePosition('4k3/pp3p2/8/8/8/P7/P1P5/4K3 w - - 0 1')
  it('finds isolated, doubled and passed pawns', () => {
    expect(f.pawnStructure.w).toEqual({ isolated: ['a2', 'a3', 'c2'], doubled: ['a2', 'a3'], passed: [] })
    expect(f.pawnStructure.b).toEqual({ isolated: ['f7'], doubled: [], passed: ['f7'] })
  })
  it('finds open and half-open files', () => {
    expect(f.openFiles).toEqual(['d', 'e', 'g', 'h'])
    expect(f.halfOpenFiles.w).toEqual(['b', 'f'])
    expect(f.halfOpenFiles.b).toEqual(['c'])
  })
  it('has a healthy structure at the start', () => {
    const s = analyzePosition(START_FEN)
    expect(s.pawnStructure.w).toEqual({ isolated: [], doubled: [], passed: [] })
    expect(s.openFiles).toEqual([])
  })
})

describe('weak squares', () => {
  it('finds holes pawns can no longer defend', () => {
    const w = analyzePosition('4k3/8/8/8/8/8/PP4PP/4K3 w - - 0 1').weakSquares.w
    expect(w.map((x) => x.square).sort()).toEqual(['d3', 'd4', 'e3', 'e4'])
  })
  it('marks an enemy knight sitting on a hole as an outpost', () => {
    const w = analyzePosition('4k3/8/8/8/3n4/8/PP4PP/4K3 w - - 0 1').weakSquares.w
    expect(w.find((x) => x.square === 'd4')).toEqual({ square: 'd4', enemyOutpost: 'n' })
  })
  it('has none at the start', () => {
    expect(analyzePosition(START_FEN).weakSquares).toEqual({ w: [], b: [] })
  })
})

describe('describeMove', () => {
  it('classifies the type of the last move', () => {
    expect(describeMove(START_FEN, 'e4')).toMatchObject({ kinds: ['pawn-push'], label: 'Pawn push' })
    expect(describeMove(START_FEN, 'Nf3')).toMatchObject({ kinds: ['development'], label: 'Development' })
    expect(describeMove('rnbqkbnr/pppp1ppp/8/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 3', 'Qxf7#')!.kinds).toEqual(['capture', 'checkmate'])
    expect(describeMove('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'O-O')).toMatchObject({ kinds: ['castle'], label: 'Castling' })
    expect(describeMove('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Bb5+')!.kinds).toEqual(['check', 'development'])
    expect(describeMove('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Qh5')).toMatchObject({ kinds: [], label: 'Quiet move' })
    expect(describeMove('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')!.kinds).toEqual(['capture'])
    expect(describeMove('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a8=Q')!.kinds).toEqual(['promotion'])
  })
  it('returns null for an impossible move', () => {
    expect(describeMove(START_FEN, 'Ke4')).toBeNull()
  })
  it('flows through analyzePosition', () => {
    const f = analyzePosition(AFTER_QH5, { fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', san: 'Qh5' })
    expect(f.lastMove?.san).toBe('Qh5')
  })
})

describe('piece activity', () => {
  it('finds active and passive pieces', () => {
    const f = analyzePosition('rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2')
    expect(f.pieceActivity.w.active).toEqual([{ square: 'f3', type: 'n', mobility: 5 }])
    expect(f.pieceActivity.b.active).toEqual([{ square: 'f6', type: 'n', mobility: 5 }])
    // Bishops and rooks are still boxed in by their own pawns.
    expect(f.pieceActivity.w.passive.map((p) => p.square)).toEqual(expect.arrayContaining(['a1']))
    expect(f.pieceActivity.w.passive.every((p) => p.mobility <= 3)).toBe(true)
  })

  it('counts captures but not squares behind a blocker', () => {
    // Rook on a1, own pawn on a3, enemy knight on d1: a2 (1) + b1,c1 (2) + d1 capture (1) = 4: neither active nor passive.
    // (If squares behind the pawn counted it would be active; if the capture didn't count it would be passive.)
    const rook = analyzePosition('4k3/8/8/8/8/P7/8/R2n2K1 w - - 0 1').pieceActivity.w
    expect([...rook.active, ...rook.passive].find((p) => p.square === 'a1')).toBeUndefined()
    const blockedBishop = analyzePosition('4k3/8/8/8/8/PP6/1P6/B3K3 w - - 0 1').pieceActivity.w
    expect(blockedBishop.passive).toEqual([{ square: 'a1', type: 'b', mobility: 0 }])
  })

  it('treats a rook on an open file as active', () => {
    const f = analyzePosition('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(f.pieceActivity.w.active[0]).toMatchObject({ square: 'a1', type: 'r', mobility: 10 })
  })

  it('flags a boxed-in bishop', () => {
    // In the start position everything is boxed in; the list shows the two most valuable stuck pieces.
    const f = analyzePosition(START_FEN)
    expect(f.pieceActivity.w.active).toEqual([])
    expect(f.pieceActivity.w.passive.map((p) => p.type)).toEqual(['q', 'r'])
  })
})
