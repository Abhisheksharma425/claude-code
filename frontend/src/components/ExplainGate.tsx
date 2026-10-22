import type { ReactNode } from 'react'
import type { Explanation } from '../lib/explainTypes'
import type { ExplanationState } from '../lib/useExplanation'
import Icon from './Icon'
import ProviderPicker from './ProviderPicker'

interface Props {
  state: ExplanationState
  /** Why the button is disabled, or null when explaining is possible. */
  blockedReason: string | null
  onExplain: () => void
  title: string
  blurb: string
  button: string
  /** Rendered once the explanation has arrived. */
  children: (data: Explanation) => ReactNode
}

/** Shared loading / error / "ask" states for the tabs that show the AI's answer (one request fills them all). */
export default function ExplainGate({ state, blockedReason, onExplain, title, blurb, button, children }: Props) {
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
      <>
        <ProviderPicker />
        {children(state.data)}
      </>
    )
  }

  return (
    <div className="explain">
      <ProviderPicker />
      {state.status === 'error' && (
        <div className="callout error" role="alert">
          <p>{state.error.message}</p>
        </div>
      )}
      <div className="cta">
        <span className="cta-icon"><Icon name="spark" size={26} /></span>
        <h3>{state.status === 'error' ? 'Try again?' : title}</h3>
        <p className="muted">{blurb}</p>
        <button className="btn primary" onClick={onExplain} disabled={blockedReason !== null}>
          {state.status === 'error' ? 'Try again' : button}
        </button>
        {blockedReason && <p className="hint">{blockedReason}</p>}
      </div>
    </div>
  )
}
