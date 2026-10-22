import { Chess } from 'chess.js'
import { ENGINE_DEPTH } from '../lib/engine'
import type { EngineStatus } from '../lib/useEngine'
import { evalInWords, formatLine, pvToSan, scoreLabel, type EngineLine } from '../lib/uci'

interface Props {
  fen: string
  enabled: boolean
  onToggle: (on: boolean) => void
  status: EngineStatus
  lines: EngineLine[]
  error?: string
  onRetry: () => void
}

export default function EnginePanel({ fen, enabled, onToggle, status, lines, error, onRetry }: Props) {
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
    : status === 'done' && top ? `Stockfish · depth ${top.depth}`
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
    </section>
  )
}
