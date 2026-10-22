import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvalCallbacks } from './evaluate'
import type { EngineLine } from './uci'

interface Pending {
  fen: string
  cb: EvalCallbacks
  cancel: ReturnType<typeof vi.fn>
}
const pending: Pending[] = []

vi.mock('./evaluate', () => ({
  evaluatePosition: (fen: string, cb: EvalCallbacks) => {
    const cancel = vi.fn()
    pending.push({ fen, cb, cancel })
    return { cancel }
  },
}))

const { analyzePositions, positionsToAnalyze } = await import('./gameAnalysis')
const { getAnalysis, getSource } = await import('./analysisStore')
const { newGame, playMove } = await import('./game')

const line = (cp: number): EngineLine[] => [{ multipv: 1, depth: 16, score: { type: 'cp', value: cp }, pv: ['e2e4'] }]
const tick = () => new Promise((r) => setTimeout(r, 0))

function fensOf(...moves: [string, string][]) {
  let g = newGame()
  const fens = [g.startFen]
  for (const [f, t] of moves) {
    g = playMove(g, f, t)!
    fens.push(g.plies[g.plies.length - 1].fen)
  }
  return fens
}

beforeEach(() => {
  pending.length = 0
})

describe('analyzePositions', () => {
  it('analyses positions one at a time, stores results with their source and counts cloud hits', async () => {
    const fens = fensOf(['a2', 'a3'], ['a7', 'a6'])
    const progress = vi.fn()
    const batch = analyzePositions(fens, progress)
    expect(batch.total).toBe(3)
    await tick()
    expect(pending).toHaveLength(1) // sequential, not parallel
    pending[0].cb.onDone(line(10), 'cloud')
    await tick()
    pending[1].cb.onDone(line(12), 'local')
    await tick()
    pending[2].cb.onDone(line(14), 'cloud')
    const result = await batch.done
    expect(result).toEqual({ result: 'complete', cloudHits: 2 })
    expect(progress.mock.calls.map((c) => c.join('/'))).toEqual(['1/3/1', '2/3/1', '3/3/2'])
    expect(getAnalysis(fens[1])).toEqual(line(12))
    expect(getSource(fens[0])).toBe('cloud')
    expect(getSource(fens[1])).toBe('local')
  })

  it('skips positions that are already analysed or finished', async () => {
    const fens = fensOf(['b2', 'b3'])
    const first = analyzePositions(fens, () => {})
    for (let i = 0; i < first.total; i++) {
      await tick()
      pending[i].cb.onDone(line(i), 'local')
    }
    await first.done
    expect(positionsToAnalyze(fens)).toEqual([])
    expect(analyzePositions(fens, () => {}).total).toBe(0)
    const mate = fensOf(['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
    expect(positionsToAnalyze(mate)).not.toContain(mate[4]) // checkmate needs no engine
  })

  it('cancel stops the running evaluation and reports "cancelled"', async () => {
    const fens = fensOf(['c2', 'c3'], ['c7', 'c6'])
    const batch = analyzePositions(fens, () => {})
    await tick()
    batch.cancel()
    expect(pending[0].cancel).toHaveBeenCalled()
    expect(await batch.done).toMatchObject({ result: 'cancelled' })
    expect(pending).toHaveLength(1) // nothing further started
  })

  it('reports an engine failure instead of hanging', async () => {
    const fens = fensOf(['d2', 'd3'], ['d7', 'd6'])
    const batch = analyzePositions(fens, () => {})
    await tick()
    pending[0].cb.onDone(line(5), 'local')
    await tick()
    pending[1].cb.onError('the engine crashed')
    expect(await batch.done).toEqual({ result: 'error', error: 'the engine crashed', cloudHits: 0 })
    expect(pending).toHaveLength(2)
  })
})
