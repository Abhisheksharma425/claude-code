import { CATEGORY_META, feedbackText, type PlyClassification } from '../lib/classify'
import type { PlyInfo } from '../lib/game'

interface Props {
  ply: PlyInfo | null
  classification: PlyClassification | null
  engineOn: boolean
}

export default function MoveFeedback({ ply, classification, engineOn }: Props) {
  if (!ply) return null
  if (!classification) {
    return (
      <div className="card feedback">
        <p className="muted">
          {engineOn
            ? `Rating ${ply.san}… the engine is still checking this position.`
            : `${ply.san} isn't rated yet. Turn the engine on or press “Analyze game”.`}
        </p>
      </div>
    )
  }
  const meta = CATEGORY_META[classification.category]
  return (
    <div className={`card feedback border-${classification.category}`}>
      <p className="feedback-title">
        <span className={`badge cat-${classification.category}`}>{meta.symbol}</span> {meta.label}
      </p>
      <p>{feedbackText(classification, ply.san)}</p>
    </div>
  )
}
