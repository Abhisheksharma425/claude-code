import type { Explanation, Purpose, Text } from '../lib/explainTypes'
import type { ExplanationState } from '../lib/useExplanation'
import ExplainGate from './ExplainGate'

export type Detail = 'simple' | 'detailed'

interface Props {
  state: ExplanationState
  blockedReason: string | null
  onExplain: () => void
  detail: Detail
  onDetail: (d: Detail) => void
  /** Position being explained: used to number the engine line. */
  fen: string
  playedSan: string | null
  bestSan: string | null
}

const slug = (tag: string) => tag.toLowerCase().replace(/\s+/g, '-')

/** "1." / "2..." labels for a line that starts from `fen`. */
export function plyLabels(fen: string, sans: string[]): string[] {
  const parts = fen.split(' ')
  let black = parts[1] === 'b'
  let n = Number(parts[5]) || 1
  return sans.map((san) => {
    const label = black ? `${n}... ${san}` : `${n}. ${san}`
    if (black) n++
    black = !black
    return label
  })
}

function Segmented({ value, onChange }: { value: Detail; onChange: (d: Detail) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Level of detail">
      {(['simple', 'detailed'] as const).map((d) => (
        <button key={d} className={value === d ? 'active' : ''} aria-pressed={value === d} onClick={() => onChange(d)}>
          {d === 'simple' ? 'Simple' : 'Detailed'}
        </button>
      ))}
    </div>
  )
}

function PurposeRow({ label, san, purpose }: { label: string; san: string | null; purpose: Purpose }) {
  if (purpose.tag === 'None') return null
  return (
    <div className="purpose">
      <div className="purpose-head">
        <span className="purpose-label">{label}</span>
        {san && <b className="san">{san}</b>}
        <span className={`tag tag-${slug(purpose.tag)}`}>{purpose.tag}</span>
      </div>
      <p>{purpose.reason}</p>
    </div>
  )
}

function Body({ data, detail, fen, playedSan, bestSan }: { data: Explanation } & Pick<Props, 'detail' | 'fen' | 'playedSan' | 'bestSan'>) {
  const o = data.overview
  const t = (x: Text) => x[detail]
  const labels = plyLabels(fen, o.story.map((s) => s.move))
  const feat = o.keyFeatures

  return (
    <div className="overview">
      <section>
        <h3>Game phase</h3>
        <p>{t(o.phase)}</p>
      </section>

      <section>
        <h3>Who is better?</h3>
        <p>{t(o.whoIsBetter)}</p>
      </section>

      <section>
        <h3>Plans for the next few moves</h3>
        <div className="plans">
          <div className="plan"><span className="plan-who"><i className="pawn white" /> White</span><p>{t(o.plans.white)}</p></div>
          <div className="plan"><span className="plan-who"><i className="pawn black" /> Black</span><p>{t(o.plans.black)}</p></div>
        </div>
      </section>

      {(o.playedMove.tag !== 'None' || o.bestMove.tag !== 'None') && (
        <section>
          <h3>What the moves are for</h3>
          <PurposeRow label="Played" san={playedSan} purpose={o.playedMove} />
          <PurposeRow label="Engine’s best" san={bestSan} purpose={o.bestMove} />
        </section>
      )}

      {o.story.length > 0 && (
        <section>
          <h3>The engine’s line as a story</h3>
          <ol className="story">
            {o.story.map((s, i) => (
              <li key={i}>
                <span className="san-chip">{labels[i]}</span>
                <p>{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h3>Key features</h3>
        <dl className="features">
          <div><dt>Pawn structure</dt><dd>{t(feat.pawnStructure)}</dd></div>
          <div><dt>Open files</dt><dd>{t(feat.openFiles)}</dd></div>
          <div><dt>Weak squares</dt><dd>{t(feat.weakSquares)}</dd></div>
          <div><dt>Active vs passive pieces</dt><dd>{t(feat.pieceActivity)}</dd></div>
        </dl>
      </section>

      <p className="muted legend">Stockfish picks the moves. The AI only explains them.</p>
    </div>
  )
}

export default function OverviewPanel({ state, blockedReason, onExplain, detail, onDetail, fen, playedSan, bestSan }: Props) {
  return (
    <ExplainGate
      state={state}
      blockedReason={blockedReason}
      onExplain={onExplain}
      title="See the big picture"
      blurb="Who is better and why, each side’s plan, what the moves are for, and the engine’s line told as a short story."
      button="Show the big picture"
    >
      {(data) => (
        <>
          <div className="overview-head">
            <Segmented value={detail} onChange={onDetail} />
            <button className="btn ghost small" onClick={onExplain} disabled={blockedReason !== null}>Refresh</button>
          </div>
          <Body data={data} detail={detail} fen={fen} playedSan={playedSan} bestSan={bestSan} />
        </>
      )}
    </ExplainGate>
  )
}
