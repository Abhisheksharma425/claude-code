import { CATEGORY_META, type Category } from '../lib/classify'
import { graphPaths, indexAtFraction, type KeyMoment } from '../lib/keyMoments'

interface Props {
  /** White's share of the bar after each ply (start position first); null = not analysed yet. */
  series: (number | null)[]
  /** Index of the position shown on the board. */
  current: number
  moments: KeyMoment[]
  onJump: (index: number) => void
}

const W = 300
const H = 84
const COLORS: Record<Category, string> = {
  best: '#1e8e3e', good: '#6a9c2a', inaccuracy: '#f1c40f', mistake: '#e67e22', blunder: '#d93025', 'missed-mate': '#8e44ad',
}

/** Evaluation over the whole game. Click anywhere to jump to that position. */
export default function EvalGraph({ series, current, moments, onJump }: Props) {
  const n = series.length
  const { line, area } = graphPaths(series, W, H)
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)
  const known = series.filter((v) => v !== null).length

  return (
    <div className="eval-graph">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evaluation graph. ${known} of ${n} positions analysed.`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onJump(indexAtFraction((e.clientX - r.left) / r.width, n))
        }}
      >
        <rect x="0" y="0" width={W} height={H / 2} className="graph-black" />
        <rect x="0" y={H / 2} width={W} height={H / 2} className="graph-white" />
        {area && <path d={area} className="graph-area" />}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="graph-mid" />
        {line && <path d={line} className="graph-line" vectorEffect="non-scaling-stroke" />}
        {moments.map((m) => (
          <line key={m.ply} x1={x(m.ply)} x2={x(m.ply)} y1="0" y2={H} stroke={COLORS[m.category]} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.8">
            <title>{`${m.label}: ${CATEGORY_META[m.category].label}`}</title>
          </line>
        ))}
        <line x1={x(current)} x2={x(current)} y1="0" y2={H} className="graph-now" vectorEffect="non-scaling-stroke" />
      </svg>
      {known < n && <p className="muted">Analyse the full game to fill in the graph.</p>}
    </div>
  )
}
