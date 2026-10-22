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
    : status === 'done' && top ? `Analysis complete (depth ${top.depth})`
    : status === 'loading' ? 'Loading engine…'
    : ''

  return (
    <div className="card engine-panel">
      <div className="engine-head">
        <h2>Engine</h2>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span>{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {status === 'error' ? (
        <div className="msg error" role="alert">
          <p>The engine couldn't run: {error}</p>
          <button onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <>
          <p className="eval-words">{headline}</p>
          {progress && <p className="muted">{progress}</p>}
          <ol className="pv-list">
            {lines.map((l) => {
              const sans = pvToSan(fen, l.pv)
              return (
                <li key={l.multipv} className={l.multipv === 1 ? 'best' : ''}>
                  <span className="pv-score">{scoreLabel(l.score)}</span>
                  <span className="pv-moves">{formatLine(fen, sans.slice(0, 8))}</span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
