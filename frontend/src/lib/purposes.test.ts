import { describe, expect, it } from 'vitest'
import { START_FEN } from './game'
import { movePurposes, setsTrap } from './purposes'

describe('movePurposes', () => {
  it('1.e4 controls the center', () => {
    const p = movePurposes(START_FEN, 'e4')!
    expect(p.tags).toEqual(['Controls center'])
    expect(p.notes[0]).toBe('Controls center: increases control of the center squares (d4, e4, d5, e5)')
  })

  it('1.Nf3 develops and controls the center', () => {
    const p = movePurposes(START_FEN, 'Nf3')!
    expect(p.tags).toEqual(['Develops', 'Controls center'])
    expect(p.notes).toContain('Develops: brings the knight out from g1')
  })

  it('accepts UCI-style moves too', () => {
    expect(movePurposes(START_FEN, { from: 'g1', to: 'f3' })!.tags).toContain('Develops')
  })

  it('castling is king safety', () => {
    const p = movePurposes('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'O-O')!
    expect(p.tags).toContain('King safety')
    expect(p.notes.join(' ')).toContain('castles')
  })

  it('a capture that can be recaptured is a trade', () => {
    const p = movePurposes('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')!
    expect(p.tags).toContain('Trades')
  })

  it('winning a loose piece is an attack, not a trade', () => {
    const p = movePurposes('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'Qxd5')!
    expect(p.tags).toContain('Attacks')
    expect(p.tags).not.toContain('Trades')
    expect(p.notes.join(' ')).toContain('wins the knight on d5')
  })

  it('a move that attacks an undefended piece is an attack', () => {
    const p = movePurposes('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+')!
    expect(p.tags).toContain('Creates threat') // check
    const q = movePurposes('2r1k3/8/8/8/8/8/3N4/4K3 w - - 0 1', 'Nb3')!
    expect(q.tags).not.toContain('Attacks')
    const n = movePurposes('4k3/8/3r4/8/8/8/3N4/4K3 w - - 0 1', 'Nc4')!
    expect(n.tags).toContain('Attacks')
    expect(n.notes.join(' ')).toContain('attacks the rook on d6')
  })

  it('moving a threatened piece to safety counts as defending', () => {
    // White knight on d4 attacked by a pawn on e5; moving it away saves it.
    const p = movePurposes('4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1', 'Nf3')!
    expect(p.tags).toContain('Defends')
  })

  it('a check is a threat', () => {
    const p = movePurposes('4k3/8/8/8/8/8/R7/4K3 w - - 0 1', 'Re2+')!
    expect(p.tags).toContain('Creates threat')
    expect(p.notes).toContain('Creates threat: gives check')
  })

  it('threatening mate in one is a threat', () => {
    // White to play Rb1 (quiet) so that Rb8# follows.
    const p = movePurposes('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'Rb1')!
    expect(p.tags).toContain('Creates threat')
    expect(p.notes.join(' ')).toContain('threatens checkmate with Rb8#')
  })

  it('a quiet improving move falls back to Prepares plan', () => {
    const p = movePurposes('4k3/pppp1ppp/8/8/8/8/PPPP1PPP/4K3 w - - 0 1', 'Kd1')!
    expect(p.tags).toEqual(['Prepares plan'])
  })

  it('a rook to an open file prepares a plan', () => {
    const p = movePurposes('4k3/pppp1ppp/8/8/8/8/PPPP1PPP/R5K1 w - - 0 1', 'Re1')!
    expect(p.tags).toContain('Prepares plan')
    expect(p.notes.join(' ')).toContain('e-file')
  })

  it('returns null for an illegal move', () => {
    expect(movePurposes(START_FEN, 'Ke4')).toBeNull()
  })
})

describe('notes line up with tags', () => {
  it('every note starts with its tag, in the same order as the tags', () => {
    const p = movePurposes(START_FEN, 'Nf3')!
    expect(p.notes.map((n) => n.split(':')[0])).toEqual(p.tags)
    const castle = movePurposes('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'O-O')!
    expect(castle.notes.every((n) => castle.tags.includes(n.split(':')[0] as never))).toBe(true)
  })
})

describe('setsTrap', () => {
  it('finds poisoned bait that allows mate in one', () => {
    // Black queen can grab a2, but then Re8# is mate.
    expect(setsTrap('6k1/5ppp/8/q7/8/8/P4PPP/4R1K1 b - - 0 1')).toBe(true)
  })
  it('is false for ordinary positions and when the bait is real', () => {
    expect(setsTrap(START_FEN)).toBe(false)
    // Same but Black has luft (h6), so Re8+ Kh7 is not mate: Qxa2 is just a free pawn.
    expect(setsTrap('6k1/5pp1/7p/q7/8/8/P4PPP/4R1K1 b - - 0 1')).toBe(false)
  })
  it('tags the move that leaves the bait', () => {
    // White's Rd1-e1 leaves a2 en prise to the queen, but Qxa2 allows Re8#.
    const p = movePurposes('6k1/5ppp/8/q7/8/8/P4PPP/3R2K1 w - - 0 1', 'Re1')!
    expect(p.tags[0]).toBe('Sets trap')
    expect(p.notes.join(' ')).toContain('allows checkmate')
  })
})
