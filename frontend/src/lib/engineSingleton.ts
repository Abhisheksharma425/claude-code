import { StockfishEngine } from './engine'

let engine: StockfishEngine | null = null
let engineError: string | null = null

/** One shared engine worker for the whole app. Returns null if it failed to start. */
export function getEngine(): StockfishEngine | null {
  if (engineError) return null
  if (!engine) {
    try {
      engine = new StockfishEngine((message) => {
        engineError = message
        engine = null
      })
    } catch (e) {
      engineError = (e as Error).message
    }
  }
  return engine
}

export const peekEngine = () => engine
export const getEngineError = () => engineError

export function resetEngine(): void {
  engineError = null
  engine?.terminate()
  engine = null
}
