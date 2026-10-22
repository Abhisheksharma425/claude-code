import { Chess } from 'chess.js'
import { getAnalysis, setAnalysis, type AnalysisSource } from './analysisStore'
import { evaluatePosition } from './evaluate'
import type { EngineLine } from './uci'

export type BatchResult = 'complete' | 'cancelled' | 'error'

export interface Batch {
  total: number
  cancel(): void
  done: Promise<{ result: BatchResult; error?: string; cloudHits: number }>
}

/** Positions that still need an engine analysis (deduplicated, skipping finished games). */
export function positionsToAnalyze(fens: string[]): string[] {
  const seen = new Set<string>()
  return fens.filter((fen) => {
    if (getAnalysis(fen) || seen.has(fen)) return false
    seen.add(fen)
    return !new Chess(fen).isGameOver()
  })
}

type Outcome = { lines: EngineLine[]; source: AnalysisSource } | { error: string } | null

/**
 * Analyses the given positions one after another (Lichess cloud first, local Stockfish otherwise),
 * storing each in the analysis store.
 */
export function analyzePositions(fens: string[], onProgress: (done: number, total: number, cloudHits: number) => void): Batch {
  const todo = positionsToAnalyze(fens)
  let cancelled = false
  let cloudHits = 0
  let current: { cancel(): void; release(): void } | null = null

  const run = async (): Promise<{ result: BatchResult; error?: string; cloudHits: number }> => {
    for (let i = 0; i < todo.length; i++) {
      if (cancelled) return { result: 'cancelled', cloudHits }
      const outcome = await new Promise<Outcome>((resolve) => {
        const handle = evaluatePosition(todo[i], {
          onUpdate: () => {},
          onDone: (lines, source) => resolve({ lines, source }),
          onError: (error) => resolve({ error }),
        })
        current = { cancel: () => handle.cancel(), release: () => resolve(null) }
      })
      current = null
      if (!outcome) return { result: 'cancelled', cloudHits }
      if ('error' in outcome) return { result: 'error', error: outcome.error, cloudHits }
      setAnalysis(todo[i], outcome.lines, outcome.source)
      if (outcome.source === 'cloud') cloudHits++
      onProgress(i + 1, todo.length, cloudHits)
    }
    return { result: 'complete', cloudHits }
  }

  return {
    total: todo.length,
    cancel() {
      cancelled = true
      current?.cancel()
      current?.release()
    },
    done: run(),
  }
}
