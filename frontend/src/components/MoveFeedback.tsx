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
      <div className="feedback pending">
        <span className="spinner small" aria-hidden />
        <p className="muted">
          {engineOn
            ? `Rating ${ply.san}… the engine is still checking.`
            : `${ply.san} isn’t rated yet. Turn the engine on or analyze the game.`}
        </p>
      </div>
    )
  }
  const meta = CATEGORY_META[classification.category]
  return (
    <div className={`feedback border-${classification.category}`}>
      <span className={`badge big cat-${classification.category}`}>{meta.symbol}</span>
      <div>
        <p className="feedback-title">{meta.label}</p>
        <p>{feedbackText(classification, ply.san)}</p>
      </div>
    </div>
  )
}
