import { CATEGORIES, CATEGORY_META, type GameSummary as Summary } from '../lib/classify'

interface Props {
  summary: Summary
  hasMoves: boolean
  progress: { done: number; total: number } | null
  error: string | null
  onAnalyze: () => void
  onCancel: () => void
}

const pct = (a: number | null) => (a === null ? '–' : `${a.toFixed(0)}%`)

export default function GameSummary({ summary, hasMoves, progress, error, onAnalyze, onCancel }: Props) {
  const { white, black } = summary
  const unrated = white.total + black.total - white.rated - black.rated

  if (!hasMoves) return <p className="empty-state">Play or load some moves to see how each side did.</p>

  return (
    <div className="summary">
      <div className="acc-tiles">
        <div className="acc-tile"><span className="acc-who"><i className="pawn white" /> White</span><strong>{pct(white.accuracy)}</strong><span className="muted">accuracy</span></div>
        <div className="acc-tile"><span className="acc-who"><i className="pawn black" /> Black</span><strong>{pct(black.accuracy)}</strong><span className="muted">accuracy</span></div>
      </div>

      {progress ? (
        <div className="analyze-progress">
          <p className="muted">Analyzing the game… {progress.done}/{progress.total} positions</p>
          <progress value={progress.done} max={Math.max(1, progress.total)} />
          <button className="btn ghost small" onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <button className="btn primary wide" onClick={onAnalyze} disabled={unrated === 0}>
          {unrated === 0 ? 'All moves rated' : 'Analyze full game'}
        </button>
      )}
      {error && <p className="callout error" role="alert">{error}</p>}

      <table>
        <thead>
          <tr><th></th><th>White</th><th>Black</th></tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c}>
              <th><span className={`badge cat-${c}`}>{CATEGORY_META[c].symbol}</span> {CATEGORY_META[c].label}</th>
              <td>{white.counts[c]}</td>
              <td>{black.counts[c]}</td>
            </tr>
          ))}
          <tr className="muted-row">
            <th>Moves rated</th>
            <td>{white.rated}/{white.total}</td>
            <td>{black.rated}/{black.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
