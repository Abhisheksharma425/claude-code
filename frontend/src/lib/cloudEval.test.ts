import { describe, expect, it, vi } from 'vitest'
import { CLOUD_URL, createCloudEval, normalizePvMoves, parseCloudResponse } from './cloudEval'
import { START_FEN } from './game'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const GOOD = { fen: START_FEN, knodes: 100000, depth: 42, pvs: [{ moves: 'e2e4 e7e5 g1f3', cp: 31 }, { moves: 'd2d4 d7d5', cp: 28 }, { moves: 'g1f3', mate: 5 }] }

describe('parseCloudResponse', () => {
  it('reads depth, scores (centipawns and mate) and moves', () => {
    expect(parseCloudResponse(GOOD, START_FEN)).toEqual([
      { multipv: 1, depth: 42, score: { type: 'cp', value: 31 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
      { multipv: 2, depth: 42, score: { type: 'cp', value: 28 }, pv: ['d2d4', 'd7d5'] },
      { multipv: 3, depth: 42, score: { type: 'mate', value: 5 }, pv: ['g1f3'] },
    ])
  })
  it('rejects unusable responses', () => {
    expect(parseCloudResponse(null, START_FEN)).toBeNull()
    expect(parseCloudResponse({ error: 'Not found' }, START_FEN)).toBeNull()
    expect(parseCloudResponse({ depth: 10, pvs: [] }, START_FEN)).toBeNull()
    expect(parseCloudResponse({ depth: 10, pvs: [{ moves: 'e2e5', cp: 1 }] }, START_FEN)).toBeNull() // illegal move
    expect(parseCloudResponse({ depth: 10, pvs: [{ moves: 'e2e4' }] }, START_FEN)).toBeNull() // no score
  })
  it('keeps going when one line is bad', () => {
    const r = parseCloudResponse({ depth: 9, pvs: [{ moves: 'zzzz', cp: 1 }, { moves: 'e2e4', cp: 20 }] }, START_FEN)!
    expect(r).toHaveLength(1)
    expect(r[0].multipv).toBe(1)
  })
})

describe('normalizePvMoves', () => {
  it('rewrites castling given as king-takes-rook to the standard king move', () => {
    const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'
    expect(normalizePvMoves(fen, ['e1h1', 'e8a8'])).toEqual(['e1g1', 'e8c8'])
    expect(normalizePvMoves(fen, ['e1g1'])).toEqual(['e1g1'])
  })
  it('keeps promotions and stops at an illegal move', () => {
    expect(normalizePvMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'])).toEqual(['a7a8q'])
    expect(normalizePvMoves(START_FEN, ['e2e4', 'e2e4', 'd7d5'])).toEqual(['e2e4'])
  })
})

function setup(responses: (() => Response | Promise<Response>)[], extra = {}) {
  let t = 0
  const calls: string[] = []
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url))
    const r = responses.shift()
    if (!r) throw new Error('no more responses')
    return r()
  }) as unknown as typeof fetch
  const cloud = createCloudEval({ fetchFn, now: () => t, minIntervalMs: 1000, burst: 1, rateLimitPauseMs: 60_000, outagePauseMs: 300_000, ...extra })
  return { cloud, calls, advance: (ms: number) => (t += ms), fetchFn }
}

describe('cloud lookup', () => {
  it('asks the documented endpoint with an encoded FEN and multiPv=3', async () => {
    const { cloud, calls } = setup([() => json(GOOD)])
    const r = await cloud.lookup(START_FEN)
    expect(r.kind).toBe('hit')
    expect(calls[0]).toBe(`${CLOUD_URL}?fen=${encodeURIComponent(START_FEN)}&multiPv=3`)
    expect(calls[0]).toContain('rnbqkbnr%2Fpppppppp')
  })

  it('treats 404 as "unknown position" and never asks again for it', async () => {
    const { cloud, calls, advance } = setup([() => json({ error: 'Not found' }, 404)])
    expect((await cloud.lookup(START_FEN)).kind).toBe('miss')
    advance(5000)
    expect((await cloud.lookup(START_FEN)).kind).toBe('miss')
    expect(calls).toHaveLength(1)
  })

  it('skips instead of queueing when asked again within the minimum interval', async () => {
    const BLACK_REPLY = { depth: 30, pvs: [{ moves: 'e7e5 g1f3', cp: -25 }] }
    const { cloud, calls, advance } = setup([() => json(GOOD), () => json(BLACK_REPLY)])
    await cloud.lookup(START_FEN)
    const other = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    expect(await cloud.lookup(other)).toEqual({ kind: 'skipped', reason: 'rate' })
    advance(1000)
    expect((await cloud.lookup(other)).kind).toBe('hit')
    expect(calls).toHaveLength(2)
  })

  it('allows a short burst, then about one request per second', async () => {
    let t = 1
    const fetchFn = vi.fn(async () => json({ depth: 20, pvs: [{ moves: 'e2e4', cp: 10 }] })) as unknown as typeof fetch
    const cloud = createCloudEval({ fetchFn, now: () => t, minIntervalMs: 1000, burst: 3 })
    const kinds: string[] = []
    for (let i = 0; i < 5; i++) kinds.push((await cloud.lookup(START_FEN)).kind) // all at the same instant
    expect(kinds).toEqual(['hit', 'hit', 'hit', 'skipped', 'skipped'])
    expect(fetchFn).toHaveBeenCalledTimes(3)
    t += 1000 // one token comes back per second
    expect((await cloud.lookup(START_FEN)).kind).toBe('hit')
    expect((await cloud.lookup(START_FEN)).kind).toBe('skipped')
    t += 10_000 // a long pause refills the bucket, but never beyond the burst size
    const after = []
    for (let i = 0; i < 4; i++) after.push((await cloud.lookup(START_FEN)).kind)
    expect(after).toEqual(['hit', 'hit', 'hit', 'skipped'])
  })

  it('stops asking for a minute after HTTP 429, then resumes', async () => {
    const { cloud, calls, advance } = setup([() => json({}, 429), () => json(GOOD)])
    const r = await cloud.lookup(START_FEN)
    expect(r.kind).toBe('error')
    expect(cloud.status().state).toBe('rate-limited')
    advance(2000)
    expect(await cloud.lookup(START_FEN)).toEqual({ kind: 'skipped', reason: 'suspended' })
    advance(60_000)
    expect(cloud.status().state).toBe('ok')
    expect((await cloud.lookup(START_FEN)).kind).toBe('hit')
    expect(calls).toHaveLength(2)
  })

  it('backs off for a few minutes after repeated failures', async () => {
    const boom = () => Promise.reject(new Error('Failed to fetch'))
    const { cloud, advance } = setup([boom, boom, boom, () => json(GOOD)])
    for (let i = 0; i < 3; i++) {
      advance(1000)
      expect((await cloud.lookup(START_FEN)).kind).toBe('error')
    }
    expect(cloud.status().state).toBe('unavailable')
    advance(10_000)
    expect(await cloud.lookup(START_FEN)).toEqual({ kind: 'skipped', reason: 'suspended' })
    advance(300_000)
    expect((await cloud.lookup(START_FEN)).kind).toBe('hit')
  })

  it('a success resets the failure count', async () => {
    const boom = () => Promise.reject(new Error('offline'))
    const { cloud, advance } = setup([boom, boom, () => json(GOOD), boom, boom])
    for (let i = 0; i < 5; i++) {
      advance(1000)
      await cloud.lookup(START_FEN + i)
    }
    expect(cloud.status().state).toBe('ok')
  })

  it('treats server errors and garbage as errors, not as evaluations', async () => {
    const { cloud, advance } = setup([() => json({}, 500), () => new Response('not json', { status: 200 })])
    expect((await cloud.lookup(START_FEN)).kind).toBe('error')
    advance(1000)
    expect((await cloud.lookup(START_FEN)).kind).toBe('error')
  })

  it('does nothing while switched off', async () => {
    const { cloud, calls } = setup([() => json(GOOD)])
    cloud.setEnabled(false)
    expect(cloud.status().state).toBe('off')
    expect(await cloud.lookup(START_FEN)).toEqual({ kind: 'skipped', reason: 'off' })
    expect(calls).toHaveLength(0)
  })

  it('gives up when the caller moves on (abort)', async () => {
    const ctrl = new AbortController()
    const { cloud } = setup([() => new Promise<Response>((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))])
    const p = cloud.lookup(START_FEN, ctrl.signal)
    ctrl.abort()
    expect(await p).toEqual({ kind: 'skipped', reason: 'aborted' })
    expect(cloud.status().state).toBe('ok') // an abort is not a failure
  })

  it('times out slow answers', async () => {
    vi.useFakeTimers()
    try {
      const slow = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('t', 'AbortError')))))
      const cloud = createCloudEval({ fetchFn: slow as unknown as typeof fetch, timeoutMs: 100, now: () => 0 })
      const p = cloud.lookup(START_FEN)
      await vi.advanceTimersByTimeAsync(150)
      expect(await p).toEqual({ kind: 'error', message: 'Lichess did not answer in time.' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('notifies subscribers when status changes', async () => {
    const { cloud } = setup([() => json({}, 429)])
    const cb = vi.fn()
    const off = cloud.subscribe(cb)
    cloud.setEnabled(false)
    cloud.setEnabled(true)
    await cloud.lookup(START_FEN)
    expect(cb).toHaveBeenCalledTimes(3)
    off()
  })
})
