import { factLines } from '../lib/factsText'
import type { PositionFacts } from '../lib/facts'

export default function FactsPanel({ facts }: { facts: PositionFacts }) {
  return (
    <dl className="facts">
      {factLines(facts).map((l) => (
        <div key={l.label + l.text}>
          <dt>{l.label}</dt>
          <dd>{l.text}</dd>
        </div>
      ))}
    </dl>
  )
}
