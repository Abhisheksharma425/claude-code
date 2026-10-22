import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeWorker {
  static last: FakeWorker
  sent: string[] = []
  terminated = false
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWorker.last = this
  }
  postMessage(m: string) {
    this.sent.push(m)
  }
  terminate() {
    this.terminated = true
  }
  say(line: string) {
    this.onmessage?.({ data: line })
  }
}

const { StockfishEngine } = await import('./engine')

function boot() {
  const onFailure = vi.fn()
  const engine = new StockfishEngine(onFailure)
  const w = FakeWorker.last
  return { engine, w, onFailure }
}
function ready(w: FakeWorker) {
  w.say('uciok')
  w.say('readyok')
}

describe('StockfishEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does the UCI handshake, sets MultiPV 3, then searches the position', () => {
    const { engine, w } = boot()
    expect(w.url).toMatch(/engine\/stockfish-19-lite-single\.js$/)
    expect(w.sent).toEqual(['uci'])
    engine.analyze('FEN-A', 16, vi.fn(), vi.fn())
    expect(w.sent).toEqual(['uci']) // not ready yet: queued
    w.say('uciok')
    expect(w.sent).toContain('setoption name MultiPV value 3')
    w.say('readyok')
    expect(w.sent.slice(-2)).toEqual(['position fen FEN-A', 'go depth 16'])
  })

  it('collects MultiPV lines (White view) and reports them on bestmove', () => {
    const { engine, w } = boot()
    const onUpdate = vi.fn()
    const onDone = vi.fn()
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1' // Black to move
    engine.analyze(fen, 16, onUpdate, onDone)
    ready(w)
    w.say('info depth 10 multipv 1 score cp 40 pv e7e5')
    w.say('info depth 10 multipv 2 score cp 55 pv c7c5')
    w.say('bestmove e7e5')
    const lines = onDone.mock.calls[0][0]
    expect(lines.map((l: { score: { value: number } }) => l.score.value)).toEqual([-40, -55]) // flipped to White's view
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('a new request stops the old search and starts only after its bestmove', () => {
    const { engine, w } = boot()
    const doneA = vi.fn()
    const doneB = vi.fn()
    engine.analyze('A', 16, vi.fn(), doneA)
    ready(w)
    engine.analyze('B', 16, vi.fn(), doneB)
    expect(w.sent.at(-1)).toBe('stop')
    expect(w.sent).not.toContain('position fen B')
    w.say('info depth 3 multipv 1 score cp 1 pv e2e4') // stale output must not leak into B
    w.say('bestmove e2e4') // A ends
    expect(doneA).not.toHaveBeenCalled() // cancelled
    expect(w.sent.slice(-2)).toEqual(['position fen B', 'go depth 16'])
    w.say('bestmove d2d4')
    expect(doneB).toHaveBeenCalledWith([])
  })

  it('stop(id) only cancels its own job', () => {
    const { engine, w } = boot()
    const idA = engine.analyze('A', 16, vi.fn(), vi.fn())
    ready(w)
    const idB = engine.analyze('B', 16, vi.fn(), vi.fn())
    engine.stop(idA) // A was already replaced by B: must not touch B
    expect(w.sent.filter((m) => m === 'stop')).toHaveLength(1)
    engine.stop(idB)
    expect(w.sent.filter((m) => m === 'stop')).toHaveLength(1) // B is only queued: dropped, nothing running to stop
    w.say('bestmove e2e4')
    expect(w.sent).not.toContain('position fen B')
  })

  it('tells running and queued jobs when the worker crashes, and refuses new work', () => {
    const { engine, w, onFailure } = boot()
    const errA = vi.fn()
    const errB = vi.fn()
    engine.analyze('A', 16, vi.fn(), vi.fn(), errA)
    ready(w)
    engine.analyze('B', 16, vi.fn(), vi.fn(), errB)
    w.onerror?.({ message: 'out of memory' })
    expect(onFailure).toHaveBeenCalledWith('out of memory')
    expect(errA).not.toHaveBeenCalled() // A had already been replaced by B, so nobody is waiting for it
    expect(errB).toHaveBeenCalledWith('out of memory')
    expect(w.terminated).toBe(true)
    const errC = vi.fn()
    engine.analyze('C', 16, vi.fn(), vi.fn(), errC)
    expect(errC).toHaveBeenCalledWith('The chess engine is not running.')
  })

  it('does not call onError for jobs that were already cancelled', () => {
    const { engine, w } = boot()
    const err = vi.fn()
    const id = engine.analyze('A', 16, vi.fn(), vi.fn(), err)
    ready(w)
    engine.stop(id)
    w.onerror?.({ message: 'late crash' })
    expect(err).not.toHaveBeenCalled()
  })

  it('gives up if the engine never answers the handshake', () => {
    const { w, onFailure } = boot()
    vi.advanceTimersByTime(19_000)
    expect(onFailure).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(onFailure).toHaveBeenCalledWith(expect.stringMatching(/did not start/))
    expect(w.terminated).toBe(true)
  })

  it('does not time out once the handshake has finished', () => {
    const { w, onFailure } = boot()
    ready(w)
    vi.advanceTimersByTime(60_000)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('reports a failure only once even if errors repeat', () => {
    const { w, onFailure } = boot()
    w.onerror?.({ message: 'x' })
    w.onerror?.({ message: 'y' })
    w.onmessageerror?.()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })
})
