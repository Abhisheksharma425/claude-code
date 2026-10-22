import type { ExplanationState } from '../lib/useExplanation'
import ExplainGate from './ExplainGate'

interface Props {
  state: ExplanationState
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
  return (
    <ExplainGate
      state={state}
      blockedReason={blockedReason}
      onExplain={onExplain}
      title="Ask the coach"
      blurb="A short, simple explanation of what the engine found: the best move, your last move, and threats."
      button="Explain this position"
    >
      {(data) => (
        <div className="explain">
          {SECTIONS.map(({ key, title }) =>
            data[key] ? (
              <section key={key} className={`explain-section ${key}`}>
                <h3>{title}</h3>
                <p>{data[key]}</p>
              </section>
            ) : null,
          )}
          <div className="explain-foot">
            <p className="muted">Stockfish picks the moves. The AI only explains them.</p>
            <button className="btn ghost small" onClick={onExplain} disabled={blockedReason !== null}>Explain again</button>
          </div>
        </div>
      )}
    </ExplainGate>
  )
}
