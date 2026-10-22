import { ENGINE_DEPTH, type StockfishEngine } from './engine'
import { cloudEval as defaultCloud, type CloudEval } from './cloudEval'
import { getEngine as defaultGetEngine, getEngineError } from './engineSingleton'
import type { AnalysisSource } from './analysisStore'
import type { EngineLine } from './uci'

/** If Lichess hasn't answered by then, start the local engine too (whichever finishes first wins). */
export const LOCAL_HEDGE_MS = 700

export interface EvalCallbacks {
  /** Partial results from the local engine while it searches. */
  onUpdate: (lines: EngineLine[]) => void
  onDone: (lines: EngineLine[], source: AnalysisSource) => void
  onError: (message: string) => void
}

export interface EvalDeps {
  cloud: Pick<CloudEval, 'lookup'>
  getEngine: () => StockfishEngine | null
  engineError: () => string | null
}

export interface EvalHandle {
  cancel(): void
}

const defaults: EvalDeps = { cloud: defaultCloud, getEngine: defaultGetEngine, engineError: getEngineError }

/**
 * Evaluates one position: Lichess Cloud Eval first (instant for positions people have analysed),
 * local Stockfish otherwise. Nothing else in the app needs to know which one answered.
 */
export function evaluatePosition(fen: string, cb: EvalCallbacks, deps: EvalDeps = defaults): EvalHandle {
  let finished = false
  let cancelled = false
  let localId: number | undefined
  let localEngine: StockfishEngine | null = null
  const abort = new AbortController()
  let hedge: ReturnType<typeof setTimeout> | undefined

  const stopLocal = () => {
    if (localEngine && localId !== undefined) localEngine.stop(localId)
  }
  const finish = (lines: EngineLine[], source: AnalysisSource) => {
    if (finished || cancelled) return
    finished = true
    clearTimeout(hedge)
    if (source === 'cloud') stopLocal()
    else abort.abort()
    cb.onDone(lines, source)
  }

  const startLocal = () => {
    if (finished || cancelled || localId !== undefined) return
    clearTimeout(hedge)
    const eng = deps.getEngine()
    if (!eng) {
      finished = true
      cb.onError(deps.engineError() ?? 'The chess engine could not start.')
      return
    }
    localEngine = eng
    localId = eng.analyze(
      fen,
      ENGINE_DEPTH,
      (lines) => {
        if (!finished && !cancelled) cb.onUpdate(lines)
      },
      (lines) => finish(lines, 'local'),
      (message) => {
        if (finished || cancelled) return
        finished = true
        abort.abort()
        cb.onError(message)
      },
    )
  }

  hedge = setTimeout(startLocal, LOCAL_HEDGE_MS)
  deps.cloud
    .lookup(fen, abort.signal)
    .then((r) => {
      if (r.kind === 'hit') finish(r.lines, 'cloud')
      else startLocal() // unknown position, rate limit, offline, switched off...: the local engine takes over at once
    })
    .catch(startLocal)

  return {
    cancel() {
      if (cancelled) return
      cancelled = true
      clearTimeout(hedge)
      abort.abort()
      stopLocal()
    },
  }
}
