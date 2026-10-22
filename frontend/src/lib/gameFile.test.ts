import { describe, expect, it } from 'vitest'
import { gameFileProblem } from './gameFile'

const f = (name: string, size = 100, type = '') => ({ name, size, type })

describe('gameFileProblem', () => {
  it('accepts PGN and text files', () => {
    expect(gameFileProblem(f('game.pgn'))).toBeNull()
    expect(gameFileProblem(f('notes.txt', 100, 'text/plain'))).toBeNull()
    expect(gameFileProblem(f('x', 100, 'application/x-chess-pgn'))).toBeNull()
  })
  it('explains that pictures are not supported (png is easy to mix up with pgn)', () => {
    expect(gameFileProblem(f('board.png', 5000, 'image/png'))).toMatch(/picture/)
    expect(gameFileProblem(f('board.PNG'))).toMatch(/picture/)
  })
  it('rejects other binary kinds, empty and huge files', () => {
    expect(gameFileProblem(f('a.pdf'))).toMatch(/PGN/)
    expect(gameFileProblem(f('a.pgn', 0))).toMatch(/empty/)
    expect(gameFileProblem(f('a.pgn', 2_000_000))).toMatch(/too big/)
  })
})
