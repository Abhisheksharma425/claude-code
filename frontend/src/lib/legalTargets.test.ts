import { describe, expect, it } from 'vitest'
import { clickOutcome, hintStyles, legalTargets } from './legalTargets'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('legalTargets', () => {
  it('lists the moves of a pawn and a knight', () => {
    expect(legalTargets(START, 'e2').map((t) => t.square).sort()).toEqual(['e3', 'e4'])
    expect(legalTargets(START, 'g1').map((t) => t.square).sort()).toEqual(['f3', 'h3'])
  })
  it('is empty for the other side, empty squares and blocked pieces', () => {
    expect(legalTargets(START, 'e7')).toEqual([])
    expect(legalTargets(START, 'e4')).toEqual([])
    expect(legalTargets(START, 'a1')).toEqual([])
  })
  it('marks captures, including en passant', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3p4/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 3'
    expect(legalTargets(fen, 'e3').find((t) => t.square === 'd4')?.capture).toBe(true)
    const ep = 'rnbqkbnr/pp1ppppp/8/8/4Pp2/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3'
    expect(legalTargets(ep, 'f4').find((t) => t.square === 'e3')?.capture).toBe(true)
    expect(legalTargets(START, 'e2').every((t) => !t.capture)).toBe(true)
  })
  it("doesn't show moves that leave the king in check (pinned piece), and lists a promotion square once", () => {
    const pinned = '4k3/8/8/8/8/4r3/4N3/4K3 w - - 0 1'
    expect(legalTargets(pinned, 'e2')).toEqual([])
    const promo = '1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1'
    expect(legalTargets(promo, 'a7').map((t) => t.square).sort()).toEqual(['a8', 'b8'])
  })
  it('survives a bad FEN', () => {
    expect(legalTargets('nonsense', 'e2')).toEqual([])
  })
})

describe('clickOutcome', () => {
  it('selects your piece, then plays to a highlighted square', () => {
    expect(clickOutcome(START, null, 'e2')).toEqual({ selected: 'e2' })
    expect(clickOutcome(START, 'e2', 'e4')).toEqual({ selected: null, move: { from: 'e2', to: 'e4' } })
  })
  it('clicking the selected piece again, or an empty/illegal square, clears it', () => {
    expect(clickOutcome(START, 'e2', 'e2')).toEqual({ selected: null })
    expect(clickOutcome(START, 'e2', 'e5')).toEqual({ selected: null })
    expect(clickOutcome(START, null, 'e5')).toEqual({ selected: null })
  })
  it("can't select the opponent's pieces, and switches between your own", () => {
    expect(clickOutcome(START, null, 'e7')).toEqual({ selected: null })
    expect(clickOutcome(START, 'e2', 'g1')).toEqual({ selected: 'g1' })
  })
})

describe('hintStyles', () => {
  it('adds dots and rings and keeps the last-move colour under them', () => {
    const base = { e4: { backgroundColor: 'yellow' } }
    const s = hintStyles(START, 'e2', base)
    expect(s.e3.backgroundImage).toMatch(/radial-gradient/)
    expect(s.e4.backgroundColor).toBe('yellow')
    expect(s.e2.backgroundColor).toBeTruthy()
  })
  it('returns the styles untouched when nothing is selected', () => {
    const base = {}
    expect(hintStyles(START, null, base)).toBe(base)
  })
})
