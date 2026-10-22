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
  return (
    <div className="card summary">
      <div className="engine-head">
        <h2>Game summary</h2>
        {progress ? (
          <button className="secondary small" onClick={onCancel}>Cancel</button>
        ) : (
          <button className="small" onClick={onAnalyze} disabled={!hasMoves || unrated === 0}>
            {unrated === 0 && hasMoves ? 'All rated' : 'Analyze game'}
          </button>
        )}
      </div>
      {progress && (
        <p className="muted">
          Analyzing the game… {progress.done}/{progress.total} positions
          <progress value={progress.done} max={Math.max(1, progress.total)} />
        </p>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
      {!hasMoves ? (
        <p className="muted">Play or load some moves to see a summary.</p>
      ) : (
        <table>
          <thead>
            <tr><th></th><th>White</th><th>Black</th></tr>
          </thead>
          <tbody>
            <tr className="accuracy-row">
              <th>Accuracy</th><td>{pct(white.accuracy)}</td><td>{pct(black.accuracy)}</td>
            </tr>
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
      )}
    </div>
  )
}
