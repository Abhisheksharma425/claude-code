import { useEffect, useMemo } from 'react'
import { Chess } from 'chess.js'
import { getAnalysis, setAnalysis, useAnalysisVersion } from './analysisStore'
import { evaluatePosition } from './evaluate'
import { evaluateThreat, threatFen, type ThreatVerdict } from './threats'
import { pvToSan } from './uci'

export type ThreatStatus = 'off' | 'unavailable' | 'waiting' | 'thinking' | 'done'

export interface ThreatState {
  status: ThreatStatus
  /** Why no threat can be shown. */
  reason?: string
  verdict?: ThreatVerdict
  san?: string
}

/**
 * "Show threat" like Lichess: give the opponent a free move (flip the side to move in the FEN)
 * and ask Stockfish what it would play. Skipped when the side to move is in check.
 * Waits until the real position has been evaluated (needed for the eval swing), so it never
 * competes with the main analysis for the engine.
 */
export function useThreat(fen: string, active: boolean, paused: boolean): ThreatState {
  useAnalysisVersion() // re-render when any analysis finishes
  const tfen = useMemo(() => threatFen(fen), [fen])
  const current = getAnalysis(fen)
  const threat = tfen ? getAnalysis(tfen) : undefined
  const haveCurrent = !!current
  const haveThreat = !!threat

  useEffect(() => {
    if (!active || !tfen || !haveCurrent || haveThreat || paused) return
    const handle = evaluatePosition(tfen, {
      onUpdate: () => {},
      onDone: (lines, source) => setAnalysis(tfen, lines, source),
      onError: () => {}, // the main engine panel already shows engine problems
    })
    return () => handle.cancel()
  }, [active, tfen, haveCurrent, haveThreat, paused])

  if (!active) return { status: 'off' }
  if (!tfen) {
    const chess = new Chess(fen)
    return {
      status: 'unavailable',
      reason: chess.isGameOver() ? 'The game is over.' : 'The side to move is in check, so there is no free move to show. The check has to be dealt with first.',
    }
  }
  if (!current) return { status: 'waiting' }
  if (!threat) return { status: 'thinking' }
  const verdict = evaluateThreat(fen, current, threat)
  if (!verdict) return { status: 'unavailable', reason: 'The engine found no threatening move.' }
  return { status: 'done', verdict, san: pvToSan(tfen, [verdict.uci])[0] ?? verdict.uci }
}
