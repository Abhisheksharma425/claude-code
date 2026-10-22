import { useSyncExternalStore } from 'react'
import type { EngineLine } from './uci'

// Finished engine analyses, keyed by position (move counters dropped) so revisiting
// a position is instant and move classification can look up any position it needs.
export type AnalysisSource = 'local' | 'cloud'

interface Entry {
  lines: EngineLine[]
  source: AnalysisSource
}

const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export function getAnalysis(fen: string): EngineLine[] | undefined {
  return cache.get(positionKey(fen))?.lines
}

/** Where a finished analysis came from (Lichess cloud or the local engine). */
export function getSource(fen: string): AnalysisSource | undefined {
  return cache.get(positionKey(fen))?.source
}

export function setAnalysis(fen: string, lines: EngineLine[], source: AnalysisSource = 'local'): void {
  cache.set(positionKey(fen), { lines, source })
  version++
  listeners.forEach((l) => l())
}

/** Re-renders the component whenever any analysis finishes. Returns a version number. */
export function useAnalysisVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
  )
}
