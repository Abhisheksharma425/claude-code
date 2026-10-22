import { describe, expect, it } from 'vitest'
import { START_FEN, canRedo, canUndo, fenAt, jumpTo, moveRows, newGame, parseInput, playMove } from './game'

describe('playMove', () => {
  it('plays legal moves and rejects illegal ones', () => {
    const g = playMove(newGame(), 'e2', 'e4')!
    expect(g.plies.map((p) => p.san)).toEqual(['e4'])
    expect(playMove(g, 'e2', 'e5')).toBeNull()
    expect(playMove(newGame(), 'e2', 'e5')).toBeNull()
  })

  it('supports undo/redo via index and truncates on a new move', () => {
    let g = newGame()
    g = playMove(g, 'e2', 'e4')!
    g = playMove(g, 'e7', 'e5')!
    g = jumpTo(g, 1)
    expect(canUndo(g)).toBe(true)
    expect(canRedo(g)).toBe(true)
    expect(fenAt(g)).toContain(' b ')
    g = playMove(g, 'c7', 'c5')!
    expect(g.plies.map((p) => p.san)).toEqual(['e4', 'c5'])
    expect(canRedo(g)).toBe(false)
  })

  it('auto-queens on promotion', () => {
    const g = newGame('8/P6k/8/8/8/8/8/K7 w - - 0 1')
    expect(playMove(g, 'a7', 'a8')!.plies[0].san).toBe('a8=Q')
  })
})

describe('parseInput', () => {
  it('loads a FEN', () => {
    const r = parseInput('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
    expect(r.ok && r.kind).toBe('fen')
  })

  it('loads a PGN with comments and headers', () => {
    const r = parseInput('[Event "x"]\n\n1. e4 {best} e5 2. Nf3 Nc6 *')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.game.plies).toHaveLength(4)
      expect(r.game.index).toBe(4)
      expect(r.game.startFen).toBe(START_FEN)
    }
  })

  it('reports bad input clearly', () => {
    expect(parseInput('').ok).toBe(false)
    expect(parseInput('hello world').ok).toBe(false)
    expect(parseInput('1. e4 e5 2. Ke4').ok).toBe(false)
    expect(parseInput('8/8/8/8/8/8/8/8 w - - 0 1').ok).toBe(false)
  })
})

describe('moveRows', () => {
  it('pairs white and black moves', () => {
    const r = parseInput('1. e4 e5 2. Nf3')
    if (!r.ok) throw new Error('parse')
    const rows = moveRows(r.game)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ number: 2, white: { san: 'Nf3', ply: 3 } })
  })

  it('handles a position where black moves first', () => {
    let g = newGame('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
    g = playMove(g, 'e7', 'e5')!
    g = playMove(g, 'g1', 'f3')!
    const rows = moveRows(g)
    expect(rows[0]).toEqual({ number: 1, black: { san: 'e5', ply: 1 } })
    expect(rows[1]).toEqual({ number: 2, white: { san: 'Nf3', ply: 2 } })
  })
})

describe('parseInput FEN errors', () => {
  it('explains a malformed FEN instead of a PGN error', () => {
    const r = parseInput('nonsense/1/2')
    expect(!r.ok && r.error).toMatch(/FEN/)
  })
  it('still treats a PGN ending in 1/2-1/2 as a PGN', () => {
    expect(parseInput('1. e4 e5 1/2-1/2').ok).toBe(true)
  })
})

describe('parseInput: sloppy and broken PGNs', () => {
  const err = (t: string) => {
    const r = parseInput(t)
    return r.ok ? null : r.error
  }

  it('says where an illegal move is', () => {
    expect(err('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 Nf6 5. Qh8 d6')).toBe("Move 5. Qh8 isn't legal in that position. Check the PGN for a typo or a missing move before it.")
    expect(err('1. e4 e5 2. Ke4')).toMatch(/^Move 2\. Ke4 isn't legal/)
    expect(err('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Qh5')).toMatch(/Move 9\.\.\. Qh5/)
  })

  it('says when a word is not a move at all', () => {
    expect(err('hello there')).toMatch(/couldn't understand “hello”/)
    expect(err('1. e4 e5 2. Nf3 banana')).toMatch(/“banana” at move 2\.\.\./)
  })

  it('accepts 0-0 and 0-0-0 for castling', () => {
    const r = parseInput('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. 0-0 Bc5 5. d3 d6 6. Be3 Be6 7. Nc3 Qd7 8. Qd2 0-0-0')
    expect(r.ok && r.game.plies.map((p) => p.san).slice(6, 8)).toEqual(['O-O', 'Bc5'])
    expect(r.ok && r.game.plies[r.game.plies.length - 1].san).toBe('O-O-O')
  })

  it('does not mistake results for castling', () => {
    expect(parseInput('1. e4 e5 0-1').ok).toBe(true)
    expect(parseInput('1. e4 e5 1-0').ok).toBe(true)
  })

  it('loads the first game of a multi-game file and says so', () => {
    const r = parseInput('[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. d4 d5 *')
    expect(r.ok && r.game.plies.map((p) => p.san)).toEqual(['e4', 'e5'])
    expect(r.ok && r.note).toBe('This file has 2 games. Loaded the first one.')
  })

  it('copes with comments, variations, NAGs, annotations and numbers glued to moves', () => {
    const r = parseInput('1.e4! {king pawn} e5?! (1... c5 2. Nf3 (2. c3)) 2. Nf3 $1 Nc6 ; the rest\n3. Bb5 1-0')
    expect(r.ok && r.game.plies).toHaveLength(5)
  })

  it('reports a bad move even when the PGN has comments and variations', () => {
    expect(err('1. e4 {good} e5 (1... c5) 2. Qd5')).toMatch(/Move 2\. Qd5 isn't legal/)
  })

  it('rejects a PGN with no moves, and absurdly long input', () => {
    expect(err('1-0')).toMatch(/No moves found/)
    expect(err('1. 2. 3.')).toMatch(/Couldn't read that PGN|couldn't understand/)
    expect(err('1. e4 '.repeat(40_000))).toMatch(/too long/)
  })

  it('honours a FEN header when diagnosing', () => {
    expect(err('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Ke6')).toMatch(/Move 1\.\.\. Ke6/)
  })
})
