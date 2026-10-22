import type { Color } from 'chess.js'
import type { ThreatItem, ThreatLists } from '../lib/threats'
import type { ThreatState } from '../lib/useThreat'
import Icon from './Icon'

interface Props {
  lists: ThreatLists
  threat: ThreatState
  threatOn: boolean
  engineOn: boolean
  onToggle: () => void
}

function Group({ title, items, empty }: { title: string; items: ThreatItem[]; empty: string }) {
  return (
    <section className="threat-group">
      <h3>{title} <span className="count">{items.length}</span></h3>
      {items.length === 0 ? (
        <p className="empty"><Icon name="check" size={16} /> {empty}</p>
      ) : (
        <ul>
          {items.map((i, n) => (
            <li key={n} className={`threat-${i.kind}`}>{i.text}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black')

export default function ThreatsPanel({ lists, threat, threatOn, engineOn, onToggle }: Props) {
  let message: string | null = null
  if (threat.status === 'waiting') {
    message = engineOn ? 'Waiting for the engine to finish evaluating this position…' : 'Turn the engine on to see the threat.'
  } else if (threat.status === 'thinking') {
    message = 'Checking what the opponent would do with a free move…'
  } else if (threat.status === 'unavailable') {
    message = threat.reason ?? null
  }

  return (
    <div className="threats">
      <button className={`btn wide${threatOn ? ' primary' : ''}`} onClick={onToggle} aria-pressed={threatOn} title="Show threat (X)">
        <Icon name="target" size={18} /> {threatOn ? 'Hide threat' : 'Show opponent’s threat'} <kbd>X</kbd>
      </button>

      {message && <p className="muted note">{message}</p>}
      {threat.status === 'done' && threat.verdict && (
        <div className={`callout${threat.verdict.serious ? ' danger' : ' warn'}`}>
          <p>
            <strong>{threat.verdict.serious ? 'Serious threat' : 'Threat'}:</strong> if it were {sideName(threat.verdict.attacker)}’s turn,
            they would play <strong>{threat.san}</strong> (red arrow).{' '}
            {threat.verdict.serious
              ? `That would swing the evaluation by ${(threat.verdict.swingCp / 100).toFixed(1)} pawns in their favour.`
              : 'It would not change the evaluation much.'}
          </p>
        </div>
      )}

      <Group title="Your threats" items={lists.yours} empty="Nothing special right now." />
      <Group title="Opponent’s threats" items={lists.opponents} empty="Nothing to worry about right now." />
      <p className="legend">
        <span className="dot red" /> your piece in danger <span className="dot orange" /> enemy piece you can attack
      </p>
    </div>
  )
}
