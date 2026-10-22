import { Chess } from 'chess.js'
import { positionKey } from './analysisStore'
import type { EngineLine } from './uci'

/**
 * Client for Lichess's public Cloud Eval API (https://lichess.org/api/cloud-eval).
 * We only *call* the public HTTP API; none of Lichess's code is used. Positions that other users have
 * already analysed come back instantly; for everything else (HTTP 404) we fall back to local Stockfish.
 *
 * Response shape (documented by Lichess): { fen, knodes, depth, pvs: [{ moves: "e2e4 e7e5 ...", cp?: n, mate?: n }] }
 * with scores from White's point of view.
 */

export const CLOUD_URL = 'https://lichess.org/api/cloud-eval'
export const CLOUD_MULTI_PV = 3

export type CloudResult =
  | { kind: 'hit'; lines: EngineLine[] }
  | { kind: 'miss' } // Lichess has no evaluation for this position
  | { kind: 'skipped'; reason: 'off' | 'rate' | 'suspended' | 'aborted' } // we chose not to ask (or the caller gave up)
  | { kind: 'error'; message: string }

export interface CloudStatus {
  state: 'ok' | 'off' | 'rate-limited' | 'unavailable'
  /** Epoch ms when we will try again (when state is not "ok"/"off"). */
  until?: number
}

/**
 * Lichess may report castling as "king takes own rook" (e1h1). chess.js and our arrows use e1g1,
 * so rewrite those while replaying the line. Stops at the first move that doesn't fit.
 */
export function normalizePvMoves(fen: string, moves: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of moves) {
    let from = uci.slice(0, 2)
    let to = uci.slice(2, 4)
    const promotion = uci[4]
    const piece = chess.get(from as never)
    const target = chess.get(to as never)
    if (piece?.type === 'k' && target?.type === 'r' && target.color === piece.color) {
      to = (to[0] > from[0] ? 'g' : 'c') + to[1]
    }
    try {
      chess.move({ from, to, promotion })
    } catch {
      break
    }
    from = ''
    out.push(uci.slice(0, 2) + to + (promotion ?? ''))
  }
  return out
}

/** Turns a Cloud Eval response into engine lines, or null if it isn't usable. */
export function parseCloudResponse(json: unknown, fen: string): EngineLine[] | null {
  if (typeof json !== 'object' || json === null) return null
  const j = json as { depth?: unknown; pvs?: unknown }
  if (!Array.isArray(j.pvs) || j.pvs.length === 0) return null
  const depth = typeof j.depth === 'number' ? j.depth : 0
  const lines: EngineLine[] = []
  for (const pv of j.pvs) {
    if (typeof pv !== 'object' || pv === null) continue
    const p = pv as { moves?: unknown; cp?: unknown; mate?: unknown }
    if (typeof p.moves !== 'string') continue
    const moves = normalizePvMoves(fen, p.moves.trim().split(/\s+/).filter(Boolean))
    if (moves.length === 0) continue
    if (typeof p.mate === 'number') lines.push({ multipv: lines.length + 1, depth, score: { type: 'mate', value: p.mate }, pv: moves })
    else if (typeof p.cp === 'number') lines.push({ multipv: lines.length + 1, depth, score: { type: 'cp', value: p.cp }, pv: moves })
  }
  return lines.length > 0 ? lines : null
}

interface Options {
  fetchFn?: typeof fetch
  now?: () => number
  /** One request is allowed per this many ms on average (a polite ~1 per second). */
  minIntervalMs?: number
  /** How many requests may go out back-to-back before the average rate applies (quick navigation, double renders). */
  burst?: number
  timeoutMs?: number
  /** How long to stop asking after HTTP 429. */
  rateLimitPauseMs?: number
  /** How long to stop asking after repeated failures (offline, blocked, server errors). */
  outagePauseMs?: number
}

export function createCloudEval(opts: Options = {}) {
  const now = opts.now ?? (() => Date.now())
  const minInterval = opts.minIntervalMs ?? 1000
  const burst = opts.burst ?? 3
  const timeoutMs = opts.timeoutMs ?? 2500
  const rateLimitPause = opts.rateLimitPauseMs ?? 65_000
  const outagePause = opts.outagePauseMs ?? 300_000

  let enabled = true
  let tokens = burst // token bucket: refills one token per minInterval, holds at most `burst`
  let refilledAt: number | null = null
  let pausedUntil = 0
  let pauseKind: 'rate-limited' | 'unavailable' = 'unavailable'
  let failures = 0
  const noEval = new Set<string>() // positions Lichess told us it doesn't know
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  function status(): CloudStatus {
    if (!enabled) return { state: 'off' }
    if (now() < pausedUntil) return { state: pauseKind, until: pausedUntil }
    return { state: 'ok' }
  }

  function pause(kind: 'rate-limited' | 'unavailable', ms: number) {
    pauseKind = kind
    pausedUntil = now() + ms
    notify()
  }

  async function lookup(fen: string, signal?: AbortSignal): Promise<CloudResult> {
    if (!enabled) return { kind: 'skipped', reason: 'off' }
    if (now() < pausedUntil) return { kind: 'skipped', reason: 'suspended' }
    const key = positionKey(fen)
    if (noEval.has(key)) return { kind: 'miss' }
    // Be polite: skip the cloud (rather than queueing) if we've been asking too often. Local Stockfish handles it.
    const t = now()
    tokens = Math.min(burst, tokens + (refilledAt === null ? 0 : (t - refilledAt) / minInterval))
    refilledAt = t
    if (tokens < 1) return { kind: 'skipped', reason: 'rate' }
    tokens -= 1

    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onAbort)
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const url = `${CLOUD_URL}?fen=${encodeURIComponent(fen)}&multiPv=${CLOUD_MULTI_PV}`
      const res = await (opts.fetchFn ?? fetch)(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (res.status === 404) {
        noEval.add(key)
        failures = 0
        return { kind: 'miss' }
      }
      if (res.status === 429) {
        pause('rate-limited', rateLimitPause)
        return { kind: 'error', message: 'Lichess asked us to slow down; using the local engine for a minute.' }
      }
      if (!res.ok) throw new Error(`Lichess answered ${res.status}`)
      const lines = parseCloudResponse(await res.json(), fen)
      failures = 0
      if (!lines) {
        noEval.add(key)
        return { kind: 'miss' }
      }
      return { kind: 'hit', lines }
    } catch (e) {
      if (signal?.aborted) return { kind: 'skipped', reason: 'aborted' } // caller moved on
      failures++
      if (failures >= 3) {
        failures = 0
        pause('unavailable', outagePause)
      }
      return { kind: 'error', message: e instanceof Error && e.name !== 'AbortError' ? e.message : 'Lichess did not answer in time.' }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    lookup,
    status,
    isEnabled: () => enabled,
    setEnabled(on: boolean) {
      enabled = on
      notify()
    },
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

export type CloudEval = ReturnType<typeof createCloudEval>

// ---- The shared instance used by the app ----

const STORAGE_KEY = 'cloudEval'
export const cloudEval: CloudEval = createCloudEval()
try {
  if (localStorage.getItem(STORAGE_KEY) === 'off') cloudEval.setEnabled(false)
} catch {
  // storage unavailable: keep the default (on)
}
export function setCloudEnabled(on: boolean): void {
  cloudEval.setEnabled(on)
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // ignore
  }
}
