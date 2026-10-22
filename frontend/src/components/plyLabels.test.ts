import { describe, expect, it } from 'vitest'
import { plyLabels } from './OverviewPanel'
import { START_FEN } from '../lib/game'

describe('plyLabels', () => {
  it('numbers a line that starts with White', () => {
    expect(plyLabels(START_FEN, ['e4', 'e5', 'Nf3'])).toEqual(['1. e4', '1... e5', '2. Nf3'])
  })
  it('numbers a line that starts with Black', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2'
    expect(plyLabels(fen, ['Nc6', 'Bc4', 'g6'])).toEqual(['2... Nc6', '3. Bc4', '3... g6'])
  })
})
