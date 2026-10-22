import { Chess } from 'chess.js'
import type { AnalysisSource } from '../lib/analysisStore'
import type { CloudStatus } from '../lib/cloudEval'
import { ENGINE_DEPTH } from '../lib/engine'
import type { EngineStatus } from '../lib/useEngine'
import { evalInWords, formatLine, pvToSan, scoreLabel, type EngineLine } from '../lib/uci'

interface Props {
  fen: string
  enabled: boolean
  onToggle: (on: boolean) => void
  status: EngineStatus
  lines: EngineLine[]
  source?: AnalysisSource
  error?: string
  onRetry: () => void
  cloud: { enabled: boolean; status: CloudStatus; setEnabled: (on: boolean) => void }
}

const clock = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

function cloudNote(enabled: boolean, status: CloudStatus): string {
  if (!enabled) return 'Lichess cloud is off: local Stockfish only.'
  if (status.state === 'rate-limited') return `Lichess asked us to slow down. Using the local engine until ${clock(status.until)}.`
  if (status.state === 'unavailable') return `Can't reach Lichess. Using the local engine until ${clock(status.until)}.`
  return 'Lichess cloud is on: positions others have analysed load instantly.'
}

export default function EnginePanel({ fen, enabled, onToggle, status, lines, source, error, onRetry, cloud }: Props) {
  const top = lines[0]
  const chess = new Chess(fen)

  let headline: string
  if (status === 'gameover') {
    headline = chess.isCheckmate() ? `Checkmate. ${chess.turn() === 'w' ? 'Black' : 'White'} wins.` : 'The game is a draw.'
  } else if (top) {
    headline = evalInWords(top.score)
  } else {
    headline = status === 'off' ? 'Engine is off' : status === 'paused' ? 'Analyzing the whole game…' : 'Starting the engine…'
  }

  const progress =
    status === 'thinking' && top ? `Thinking… depth ${top.depth}/${ENGINE_DEPTH}`
    : status === 'done' && top ? `${source === 'cloud' ? 'Lichess cloud' : 'Stockfish'} · depth ${top.depth}`
    : status === 'loading' ? 'Loading engine…'
    : ''
  const pct = status === 'done' ? 100 : status === 'thinking' && top ? Math.min(100, (top.depth / ENGINE_DEPTH) * 100) : 0
  const leader = !top ? 'none' : top.score.value >= 0 ? 'white' : 'black'

  return (
    <section className="engine" aria-label="Engine">
      <div className="engine-top">
        <span className={`score-chip ${leader}`}>{top ? scoreLabel(top.score) : '–'}</span>
        <div className="engine-words">
          <strong>{headline}</strong>
          {progress && <span className="muted">{progress}</span>}
        </div>
        <label className="toggle" title="Turn the engine on or off">
          <input type="checkbox" role="switch" checked={enabled} onChange={(e) => onToggle(e.target.checked)} aria-label="Engine" />
          <span className="track" />
        </label>
      </div>
      <div className={`depth-bar${status === 'thinking' ? ' busy' : ''}`}><i style={{ width: `${pct}%` }} /></div>

      {status === 'error' ? (
        <div className="callout error" role="alert">
          <p>The engine couldn’t run: {error}</p>
          <button className="btn small" onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <ol className="pv-list">
          {lines.map((l) => {
            const text = formatLine(fen, pvToSan(fen, l.pv.slice(0, 10)))
            return (
              <li key={l.multipv} className={l.multipv === 1 ? 'best' : ''} title={text}>
                <span className="pv-score">{scoreLabel(l.score)}</span>
                <span className="pv-moves">{text}</span>
              </li>
            )
          })}
        </ol>
      )}
      <div className="engine-foot">
        <button
          className={`chip-toggle${cloud.enabled ? ' on' : ''}${cloud.enabled && cloud.status.state !== 'ok' ? ' paused' : ''}`}
          aria-pressed={cloud.enabled}
          onClick={() => cloud.setEnabled(!cloud.enabled)}
          title="Use Lichess's free cloud evaluations for positions that have already been analysed. Turning this off keeps every position on your computer."
        >
          <i aria-hidden /> Lichess cloud
        </button>
        <span className="muted">{cloudNote(cloud.enabled, cloud.status)}</span>
      </div>
    </section>
  )
}
