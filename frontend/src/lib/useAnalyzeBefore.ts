import { useEffect } from 'react'
import { getAnalysis, setAnalysis } from './analysisStore'
import { evaluatePosition } from './evaluate'

/**
 * Rating a move needs the engine's view of the position *before* it. When you play moves yourself that position was
 * analysed a moment ago, but after loading a game and landing on a move it never was, so the rating would wait forever.
 * Once `ready` (the live position is finished, so the engine is free), analyse the position before the shown move too.
 */
export function useAnalyzeBefore(fenBefore: string | null, ready: boolean) {
  useEffect(() => {
    if (!ready || !fenBefore || getAnalysis(fenBefore)) return
    const handle = evaluatePosition(fenBefore, {
      onUpdate: () => {},
      onDone: (lines, source) => setAnalysis(fenBefore, lines, source),
      onError: () => {}, // the live panel already reports engine problems
    })
    return () => handle.cancel()
  }, [fenBefore, ready])
}
