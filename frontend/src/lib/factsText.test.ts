import { describe, expect, it } from 'vitest'
import { analyzePosition } from './facts'
import { factLines } from './factsText'
import { START_FEN } from './game'

describe('factLines', () => {
  it('summarises the start position', () => {
    const lines = factLines(analyzePosition(START_FEN))
    const get = (label: string) => lines.find((l) => l.label === label)?.text
    expect(get('Phase')).toMatch(/^Opening/)
    expect(get('Material')).toBe('Material is equal.')
    expect(get('White king')).toBe("hasn't castled yet, 3 of 3 shield pawns. It is okay.")
    expect(get('Center')).toBe('Center control is balanced (0 to 0).')
    expect(get('White development')).toBe('4 minor pieces still at home (b1, g1, c1, f1).')
    expect(lines.find((l) => l.label.includes('pawns'))).toBeUndefined()
  })

  it('mentions structure, files and weak squares', () => {
    const lines = factLines(analyzePosition('4k3/pp3p2/8/8/8/P7/P1P5/4K3 w - - 0 1'))
    expect(lines.find((l) => l.label === 'White pawns')!.text).toContain('doubled pawns on a2, a3')
    expect(lines.find((l) => l.label === 'Black pawns')!.text).toContain('passed pawns on f7')
    expect(lines.find((l) => l.label === 'Files')!.text).toContain('open: d, e, g, h')
  })

  it('includes the last move type', () => {
    const f = analyzePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', { fenBefore: START_FEN, san: 'e4' })
    expect(factLines(f).find((l) => l.label === 'Last move')!.text).toBe('e4: pawn push.')
  })
})

describe('factLines piece activity', () => {
  it('names active and passive pieces', () => {
    const lines = factLines(analyzePosition('rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2'))
    expect(lines.find((l) => l.label === 'White pieces')!.text).toContain('active: knight on f3')
    expect(lines.find((l) => l.label === 'White pieces')!.text).toContain('passive')
  })
})
