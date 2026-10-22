import { parseInfo, type EngineLine } from './uci'

export const ENGINE_DEPTH = 16
const STARTUP_TIMEOUT_MS = 20_000
export const MULTI_PV = 3

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

interface Job {
  id: number
  fen: string
  depth: number
  onUpdate: (lines: EngineLine[]) => void
  onDone: (lines: EngineLine[]) => void
  /** Called if the engine dies before this job finishes. */
  onError?: (message: string) => void
  lines: Map<number, EngineLine>
  cancelled: boolean
}

/**
 * Thin UCI wrapper around the Stockfish WASM web worker.
 * Only one search runs at a time. A new request stops the old one and starts only after the
 * engine reports `bestmove` for it, so stale output can never be mixed into the new analysis.
 */
export class StockfishEngine {
  private worker: Worker
  private ready = false
  private running: Job | null = null
  private pending: Job | null = null
  private failed = false
  private nextId = 1
  private onFailure: (message: string) => void

  constructor(onFailure: (message: string) => void) {
    this.onFailure = onFailure
    this.worker = new Worker(ENGINE_URL)
    this.worker.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') this.onLine(e.data)
    }
    this.worker.onerror = (e) => this.fail(e.message || 'The chess engine failed to load or crashed.')
    this.worker.onmessageerror = () => this.fail('The chess engine sent a message the browser could not read.')
    this.worker.postMessage('uci')
    // If the engine never answers the handshake, don't wait forever.
    this.startupTimer = setTimeout(() => {
      if (!this.ready) this.fail('The chess engine did not start. Your browser may be blocking WebAssembly workers.')
    }, STARTUP_TIMEOUT_MS)
  }

  private startupTimer: ReturnType<typeof setTimeout> | undefined

  /** The worker is unusable: tell everyone waiting on it, once. */
  private fail(message: string): void {
    if (this.failed) return
    this.failed = true
    clearTimeout(this.startupTimer)
    const waiting = [this.running, this.pending].filter((j): j is Job => j !== null)
    this.running = null
    this.pending = null
    this.worker.terminate()
    this.onFailure(message)
    for (const job of waiting) if (!job.cancelled) job.onError?.(message)
  }

  /** Starts analysing `fen`, replacing whatever was running. Returns an id for `stop(id)`. */
  analyze(fen: string, depth: number, onUpdate: Job['onUpdate'], onDone: Job['onDone'], onError?: Job['onError']): number {
    const id = this.nextId++
    if (this.failed) {
      onError?.('The chess engine is not running.')
      return id
    }
    this.pending = { id, fen, depth, onUpdate, onDone, onError, lines: new Map(), cancelled: false }
    if (this.running) {
      this.running.cancelled = true
      this.worker.postMessage('stop')
    } else {
      this.startPending()
    }
    return id
  }

  /**
   * Stops the analysis started by `analyze` (returned id). With no id, stops everything.
   * An id that has already been replaced by a newer request is ignored, so a component
   * cleaning up can never cancel someone else's search.
   */
  stop(id?: number): void {
    if (id === undefined || this.pending?.id === id) this.pending = null
    if (this.running && (id === undefined || this.running.id === id)) {
      // Already told to stop (e.g. replaced by a newer request)? Don't send a second stop.
      if (!this.running.cancelled) this.worker.postMessage('stop')
      this.running.cancelled = true
    }
  }

  terminate(): void {
    clearTimeout(this.startupTimer)
    this.worker.terminate()
  }

  private startPending(): void {
    if (!this.ready || this.running || !this.pending) return
    this.running = this.pending
    this.pending = null
    this.worker.postMessage(`position fen ${this.running.fen}`)
    this.worker.postMessage(`go depth ${this.running.depth}`)
  }

  private onLine(line: string): void {
    if (line === 'uciok') {
      this.worker.postMessage(`setoption name MultiPV value ${MULTI_PV}`)
      this.worker.postMessage('isready')
    } else if (line === 'readyok') {
      this.ready = true
      clearTimeout(this.startupTimer)
      this.startPending()
    } else if (line.startsWith('bestmove')) {
      const job = this.running
      this.running = null
      if (job && !job.cancelled) job.onDone(sorted(job.lines))
      this.startPending()
    } else if (this.running && !this.running.cancelled) {
      const job = this.running
      const info = parseInfo(line, job.fen.split(' ')[1] === 'w')
      if (info) {
        job.lines.set(info.multipv, info)
        job.onUpdate(sorted(job.lines))
      }
    }
  }
}

function sorted(lines: Map<number, EngineLine>): EngineLine[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv)
}
