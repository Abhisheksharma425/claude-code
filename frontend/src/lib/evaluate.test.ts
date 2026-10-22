import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluatePosition, LOCAL_HEDGE_MS, type EvalDeps } from './evaluate'
import { START_FEN } from './game'
import type { CloudResult } from './cloudEval'
import type { EngineLine } from './uci'

const line = (cp: number): EngineLine => ({ multipv: 1, depth: 16, score: { type: 'cp', value: cp }, pv: ['e2e4'] })

class FakeEngine {
  analyzed: string[] = []
  stopped: number[] = []
  next = 1
  handlers: { onUpdate: (l: EngineLine[]) => void; onDone: (l: EngineLine[]) => void; onError?: (m: string) => void }[] = []
  analyze(fen: string, _d: number, onUpdate: never, onDone: never, onError?: never) {
    this.analyzed.push(fen)
    this.handlers.push({ onUpdate, onDone, onError })
    return this.next++
  }
  stop(id?: number) {
    if (id !== undefined) this.stopped.push(id)
  }
}

function setup(result: () => Promise<CloudResult>, engine: FakeEngine | null = new FakeEngine()) {
  const lookup = vi.fn((_fen: string, signal?: AbortSignal) => {
    void signal
    return result()
  })
  const deps = { cloud: { lookup }, getEngine: () => engine as never, engineError: () => 'engine down' } as EvalDeps
  const cb = { onUpdate: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
  return { deps, cb, engine, lookup }
}
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('evaluatePosition', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses the Lichess answer and never starts the local engine when it arrives quickly', async () => {
    const { deps, cb, engine } = setup(async () => ({ kind: 'hit', lines: [line(30)] }))
    evaluatePosition(START_FEN, cb, deps)
    await flush()
    expect(cb.onDone).toHaveBeenCalledWith([line(30)], 'cloud')
    expect(engine!.analyzed).toEqual([])
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS * 2)
    expect(engine!.analyzed).toEqual([]) // the hedge timer was cleared
  })

  it('falls back to local Stockfish at once when Lichess does not know the position', async () => {
    const { deps, cb, engine } = setup(async () => ({ kind: 'miss' }))
    evaluatePosition(START_FEN, cb, deps)
    await flush()
    expect(engine!.analyzed).toEqual([START_FEN])
    engine!.handlers[0].onUpdate([line(10)])
    expect(cb.onUpdate).toHaveBeenCalledWith([line(10)])
    engine!.handlers[0].onDone([line(12)])
    expect(cb.onDone).toHaveBeenCalledWith([line(12)], 'local')
  })

  it.each<CloudResult>([
    { kind: 'skipped', reason: 'off' },
    { kind: 'skipped', reason: 'rate' },
    { kind: 'skipped', reason: 'suspended' },
    { kind: 'error', message: 'offline' },
  ])('also falls back to local for %j', async (r) => {
    const { deps, cb, engine } = setup(async () => r)
    evaluatePosition(START_FEN, cb, deps)
    await flush()
    expect(engine!.analyzed).toHaveLength(1)
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('starts the local engine too if Lichess is slow, and a late cloud answer wins and stops it', async () => {
    let resolve!: (r: CloudResult) => void
    const { deps, cb, engine } = setup(() => new Promise<CloudResult>((r) => (resolve = r)))
    evaluatePosition(START_FEN, cb, deps)
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS + 1)
    expect(engine!.analyzed).toHaveLength(1)
    resolve({ kind: 'hit', lines: [line(40)] })
    await flush()
    expect(cb.onDone).toHaveBeenCalledWith([line(40)], 'cloud')
    expect(engine!.stopped).toEqual([1])
    engine!.handlers[0].onDone([line(99)]) // the stopped local search can't override it
    expect(cb.onDone).toHaveBeenCalledTimes(1)
  })

  it('a finished local search aborts the pending Lichess request', async () => {
    let signal: AbortSignal | undefined
    const lookup = vi.fn((_f: string, s?: AbortSignal) => {
      signal = s
      return new Promise<CloudResult>(() => {})
    })
    const engine = new FakeEngine()
    const deps = { cloud: { lookup }, getEngine: () => engine as never, engineError: () => null } as EvalDeps
    const cb = { onUpdate: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    evaluatePosition(START_FEN, cb, deps)
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS + 1)
    engine.handlers[0].onDone([line(5)])
    expect(signal?.aborted).toBe(true)
    expect(cb.onDone).toHaveBeenCalledWith([line(5)], 'local')
  })

  it('cancel stops everything and reports nothing', async () => {
    const { deps, cb, engine } = setup(() => new Promise<CloudResult>(() => {}))
    const h = evaluatePosition(START_FEN, cb, deps)
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS + 1)
    h.cancel()
    expect(engine!.stopped).toEqual([1])
    engine!.handlers[0].onDone([line(1)])
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onUpdate).not.toHaveBeenCalled()
  })

  it('cancelling before the hedge timer means the local engine never starts', async () => {
    const { deps, cb, engine } = setup(() => new Promise<CloudResult>(() => {}))
    evaluatePosition(START_FEN, cb, deps).cancel()
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS * 2)
    expect(engine!.analyzed).toEqual([])
    expect(cb.onDone).not.toHaveBeenCalled()
  })

  it('reports an error when the engine cannot start and the cloud has nothing', async () => {
    const { deps, cb } = setup(async () => ({ kind: 'miss' }), null)
    evaluatePosition(START_FEN, cb, deps)
    await flush()
    expect(cb.onError).toHaveBeenCalledWith('engine down')
  })

  it('reports an engine crash mid-search', async () => {
    const { deps, cb, engine } = setup(async () => ({ kind: 'miss' }))
    evaluatePosition(START_FEN, cb, deps)
    await flush()
    engine!.handlers[0].onError!('boom')
    expect(cb.onError).toHaveBeenCalledWith('boom')
  })

  it('after a crash was reported, a late cloud answer is ignored', async () => {
    let resolve!: (r: CloudResult) => void
    const { deps, cb, engine } = setup(() => new Promise<CloudResult>((r) => (resolve = r)))
    evaluatePosition(START_FEN, cb, deps)
    await vi.advanceTimersByTimeAsync(LOCAL_HEDGE_MS + 1)
    engine!.handlers[0].onError!('boom')
    expect(cb.onError).toHaveBeenCalledTimes(1) // the caller is told; later results are ignored
    resolve({ kind: 'hit', lines: [line(1)] })
    await flush()
    expect(cb.onDone).not.toHaveBeenCalled()
  })
})
