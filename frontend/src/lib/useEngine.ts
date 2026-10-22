import { useCallback, useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { getAnalysis, getSource, setAnalysis, type AnalysisSource } from './analysisStore'
import { evaluatePosition } from './evaluate'
import { getEngineError, resetEngine } from './engineSingleton'
import type { EngineLine } from './uci'

export type EngineStatus = 'off' | 'loading' | 'thinking' | 'done' | 'gameover' | 'error' | 'paused'

export interface EngineState {
  status: EngineStatus
  lines: EngineLine[]
  /** Who produced `lines`: Lichess's cloud database or our local Stockfish. */
  source?: AnalysisSource
  error?: string
}

/**
 * Analyses `fen` with Stockfish while `enabled`; stops stale work whenever the position changes.
 * While `paused` (a full-game analysis owns the engine) it only shows what is already known.
 */
export function useEngine(fen: string, enabled: boolean, paused = false) {
  const [state, setState] = useState<EngineState>({ status: 'off', lines: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off', lines: [] })
      return
    }
    if (new Chess(fen).isGameOver()) {
      setState({ status: 'gameover', lines: [] })
      return
    }
    const hit = getAnalysis(fen)
    if (hit) {
      setState({ status: 'done', lines: hit, source: getSource(fen) })
      return
    }
    if (paused) {
      setState({ status: 'paused', lines: [] })
      return
    }
    setState({ status: 'loading', lines: [] })
    const handle = evaluatePosition(fen, {
      onUpdate: (lines) => setState({ status: 'thinking', lines, source: 'local' }),
      onDone: (lines, source) => {
        setAnalysis(fen, lines, source)
        setState({ status: 'done', lines, source })
      },
      onError: (message) => setState({ status: 'error', lines: [], error: message }),
    })
    return () => handle.cancel()
  }, [fen, enabled, paused, attempt])

  // If the worker dies while analysing, surface it.
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      const err = getEngineError()
      if (err) {
        setState({ status: 'error', lines: [], error: err })
        window.clearInterval(id)
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [enabled, attempt])

  const retry = useCallback(() => {
    resetEngine()
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, retry }
}
