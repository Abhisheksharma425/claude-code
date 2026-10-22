import { useEffect, useRef } from 'react'
import { CATEGORY_META, type PlyClassification } from '../lib/classify'
import { moveRows, type GameState } from '../lib/game'

interface Props {
  game: GameState
  onJump: (index: number) => void
  /** Classification per ply (index = ply - 1), null while unrated. */
  classes: (PlyClassification | null)[]
}

export default function MoveList({ game, onJump, classes }: Props) {
  const rows = moveRows(game)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [game.index])

  const cat = (ply: number) => classes[ply - 1]?.category

  const cell = (m?: { san: string; ply: number }) =>
    m ? (
      <button
        className={`move${m.ply === game.index ? ' active' : ''}`}
        ref={m.ply === game.index ? activeRef : undefined}
        onClick={() => onJump(m.ply)}
      >
        {cat(m.ply) && (
          <span className={`badge cat-${cat(m.ply)}`} title={CATEGORY_META[cat(m.ply)!].label} aria-label={CATEGORY_META[cat(m.ply)!].label}>
            {CATEGORY_META[cat(m.ply)!].symbol}
          </span>
        )}
        {m.san}
      </button>
    ) : (
      <span className="move empty">…</span>
    )

  return (
    <div className="move-list" aria-label="Move list">
      {rows.length === 0 && <p className="empty-state">No moves yet. Drag a piece on the board, or load a game.</p>}
      {rows.map((r) => (
        <div className="move-row" key={r.number + (r.white ? 'w' : 'b')}>
          <span className="move-number">{r.number}.</span>
          {cell(r.white)}
          {cell(r.black)}
        </div>
      ))}
    </div>
  )
}
