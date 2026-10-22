import type { ExplanationState } from '../lib/useExplanation'
import Icon from './Icon'

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
  if (state.status === 'loading') {
    return (
      <div className="explain" role="status" aria-live="polite">
        <p className="explain-loading"><span className="spinner" aria-hidden /> Asking the coach to explain the engine’s analysis…</p>
        <div className="skeleton" aria-hidden><i /><i /><i style={{ width: '70%' }} /></div>
        <div className="skeleton" aria-hidden><i /><i style={{ width: '55%' }} /></div>
      </div>
    )
  }

  if (state.status === 'done') {
    return (
      <div className="explain">
        {SECTIONS.map(({ key, title }) =>
          state.data[key] ? (
            <section key={key} className={`explain-section ${key}`}>
              <h3>{title}</h3>
              <p>{state.data[key]}</p>
            </section>
          ) : null,
        )}
        <div className="explain-foot">
          <p className="muted">Stockfish picks the moves. The AI only explains them.</p>
          <button className="btn ghost small" onClick={onExplain} disabled={blockedReason !== null}>Explain again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="explain">
      {state.status === 'error' && (
        <div className="callout error" role="alert">
          <p>{state.error.message}</p>
        </div>
      )}
      <div className="cta">
        <span className="cta-icon"><Icon name="spark" size={26} /></span>
        <h3>{state.status === 'error' ? 'Try again?' : 'Ask the coach'}</h3>
        <p className="muted">A short, simple explanation of what the engine found: the best move, your last move, and threats.</p>
        <button className="btn primary" onClick={onExplain} disabled={blockedReason !== null}>
          {state.status === 'error' ? 'Try again' : 'Explain this position'}
        </button>
        {blockedReason && <p className="hint">{blockedReason}</p>}
      </div>
    </div>
  )
}
