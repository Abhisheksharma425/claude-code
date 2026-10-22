import { scoreLabel, whiteBarPercent, type Score } from '../lib/uci'

interface Props {
  score: Score | null
  /** Which colour is at the bottom of the board. */
  orientation: 'white' | 'black'
}

export default function EvalBar({ score, orientation }: Props) {
  const white = score ? whiteBarPercent(score) : 50
  const whiteAtBottom = orientation === 'white'
  const label = score ? scoreLabel(score) : '–'
  const whiteLeading = white >= 50
  return (
    <div
      className="eval-bar"
      role="img"
      aria-label={score ? `Evaluation ${label}` : 'No evaluation'}
      style={{ flexDirection: whiteAtBottom ? 'column-reverse' : 'column' }}
    >
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-label ${whiteLeading === whiteAtBottom ? 'at-bottom' : 'at-top'} ${whiteLeading ? 'on-white' : 'on-black'}`}>
        {label.replace(/^\+/, '')}
      </span>
    </div>
  )
}
