import type { Color } from 'chess.js'
import type { ThreatItem, ThreatLists } from '../lib/threats'
import type { ThreatState } from '../lib/useThreat'

interface Props {
  lists: ThreatLists
  threat: ThreatState
  threatOn: boolean
  engineOn: boolean
  onToggle: () => void
}

function List({ title, items, empty }: { title: string; items: ThreatItem[]; empty: string }) {
  return (
    <div className="threat-list">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul>
          {items.map((i, n) => (
            <li key={n} className={`threat-${i.kind}`}>{i.text}</li>
          ))}
        </ul>
      )}
    </div>
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
    <div className="card threats">
      <div className="engine-head">
        <h2>Threats</h2>
        <button className={`small${threatOn ? '' : ' secondary'}`} onClick={onToggle} aria-pressed={threatOn} title="Show threat (X)">
          {threatOn ? 'Hide threat' : 'Show threat'} <kbd>X</kbd>
        </button>
      </div>

      {message && <p className="muted">{message}</p>}
      {threat.status === 'done' && threat.verdict && (
        <p className={`threat-result${threat.verdict.serious ? ' serious' : ''}`}>
          <strong>{threat.verdict.serious ? 'Serious threat' : 'Threat'}:</strong> if it were {sideName(threat.verdict.attacker)}&apos;s
          turn, they would play {threat.san} (red arrow).
          {threat.verdict.serious
            ? ` That would swing the evaluation by ${(threat.verdict.swingCp / 100).toFixed(1)} pawns in their favour.`
            : ' It would not change the evaluation much.'}
        </p>
      )}

      <List title="Your threats" items={lists.yours} empty="Nothing special right now." />
      <List title="Opponent's threats" items={lists.opponents} empty="Nothing to worry about right now." />
      <p className="muted legend">
        <span className="dot red" /> your piece in danger · <span className="dot orange" /> enemy piece you can attack
      </p>
    </div>
  )
}
