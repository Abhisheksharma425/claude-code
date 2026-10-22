import { useState } from 'react'
import { parseInput, type GameState } from '../lib/game'

interface Props {
  onLoad: (game: GameState) => void
}

export default function LoadPanel({ onLoad }: Props) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    const r = parseInput(text)
    if (r.ok) {
      onLoad(r.game)
      setMessage({
        ok: true,
        text: r.kind === 'fen' ? 'Position loaded.' : `Game loaded (${r.game.plies.length} moves).`,
      })
    } else {
      setMessage({ ok: false, text: r.error })
    }
  }

  return (
    <details className="card load-panel">
      <summary>Load PGN or FEN</summary>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a PGN (1. e4 e5 2. Nf3 …) or a FEN here"
        rows={5}
        spellCheck={false}
      />
      <div className="row">
        <button onClick={load}>Load</button>
        <button className="secondary" onClick={() => { setText(''); setMessage(null) }}>
          Clear
        </button>
      </div>
      {message && <p className={message.ok ? 'msg ok' : 'msg error'} role="status">{message.text}</p>}
    </details>
  )
}
