import { useState } from 'react'
import { parseInput, type GameState } from '../lib/game'

interface Props {
  onLoad: (game: GameState) => void
}

const EXAMPLE = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. d4 c6'

export default function LoadPanel({ onLoad }: Props) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = (input: string) => {
    const r = parseInput(input)
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
    <div className="load-panel">
      <label htmlFor="pgn-input" className="field-label">Paste a PGN (a list of moves) or a FEN (one position)</label>
      <textarea
        id="pgn-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="1. e4 e5 2. Nf3 Nc6 …   or   rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        rows={7}
        spellCheck={false}
      />
      <div className="row">
        <button className="btn primary" onClick={() => load(text)}>Load</button>
        <button className="btn ghost" onClick={() => { setText(EXAMPLE); load(EXAMPLE) }}>Try an example</button>
        <button className="btn ghost" onClick={() => { setText(''); setMessage(null) }}>Clear</button>
      </div>
      {message && <p className={`callout ${message.ok ? 'ok' : 'error'}`} role="status">{message.text}</p>}
    </div>
  )
}
