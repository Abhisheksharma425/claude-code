import type { ExplanationState } from '../lib/useExplanation'

interface Props {
  state: ExplanationState
  /** Why the button is disabled, or null when explaining is possible. */
  blockedReason: string | null
  onExplain: () => void
}

const SECTIONS = [
  { key: 'moveExplanation', title: 'The best move' },
  { key: 'lastMoveFeedback', title: 'Your last move' },
  { key: 'threats', title: 'Threats' },
  { key: 'lesson', title: 'Lesson' },
] as const

export default function ExplainPanel({ state, blockedReason, onExplain }: Props) {
  const busy = state.status === 'loading'
  return (
    <div className="card explain">
      <div className="engine-head">
        <h2>Coach</h2>
        <button className="small" onClick={onExplain} disabled={busy || blockedReason !== null}>
          {state.status === 'done' ? 'Explain again' : busy ? 'Thinking…' : 'Explain this position'}
        </button>
      </div>

      {state.status === 'idle' && (
        <p className="muted">{blockedReason ?? 'Get a simple explanation of the engine’s analysis.'}</p>
      )}
      {state.status === 'idle' && blockedReason === null && <p className="muted">Uses your OpenAI key through the local backend.</p>}

      {busy && (
        <div className="explain-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden /> Asking the coach to explain the engine’s analysis…
        </div>
      )}

      {state.status === 'error' && (
        <div className="msg error" role="alert">
          <p>{state.error.message}</p>
          <button className="small" onClick={onExplain} disabled={blockedReason !== null}>Try again</button>
        </div>
      )}

      {state.status === 'done' &&
        SECTIONS.map(({ key, title }) =>
          state.data[key] ? (
            <section key={key} className={`explain-section ${key}`}>
              <h3>{title}</h3>
              <p>{state.data[key]}</p>
            </section>
          ) : null,
        )}

      {(state.status === 'done' || busy) && (
        <p className="muted legend">Stockfish picks the moves. The AI only explains them.</p>
      )}
    </div>
  )
}
