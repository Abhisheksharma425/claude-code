import { useRef, useState } from 'react'
import { parseInput, type GameState } from '../lib/game'
import { gameFileProblem } from '../lib/gameFile'
import ChessComGames from './ChessComGames'

interface Props {
  /** `orientation`: which side to show at the bottom (set when the game is someone's own, e.g. from chess.com). */
  onLoad: (game: GameState, note?: string, orientation?: 'white' | 'black') => void
  /** Load the game and immediately analyse all of it. */
  onLoadAndAnalyze: (game: GameState, note?: string, orientation?: 'white' | 'black') => void
}

const EXAMPLE = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. d4 c6'

export default function LoadPanel({ onLoad, onLoadAndAnalyze }: Props) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = (input: string, analyze = false) => {
    const r = parseInput(input)
    if (r.ok) {
      if (analyze && r.game.plies.length > 0) onLoadAndAnalyze(r.game, r.note)
      else onLoad(r.game, r.note)
      const base = r.kind === 'fen' ? 'Position loaded.' : `Game loaded (${r.game.plies.length} moves).`
      setMessage({ ok: true, text: r.note ? `${base} ${r.note}` : base })
    } else {
      setMessage({ ok: false, text: r.error })
    }
  }

  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '' // so choosing the same file again still triggers
    if (!file) return
    const problem = gameFileProblem(file)
    if (problem) {
      setMessage({ ok: false, text: problem })
      return
    }
    try {
      const content = await file.text()
      setText(content)
      load(content)
    } catch {
      setMessage({ ok: false, text: "Couldn't read that file. Try another one, or paste its contents below." })
    }
  }

  return (
    <div className="load-panel">
      <ChessComGames
        onLoad={(game, note, orientation, analyze) => {
          if (analyze) onLoadAndAnalyze(game, note, orientation)
          else onLoad(game, note, orientation)
          setMessage(null)
        }}
      />
      <hr className="divider" />
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
        <button className="btn" onClick={() => load(text, true)} title="Load the game, then rate every move">Load and analyze</button>
        <button className="btn" onClick={() => fileInput.current?.click()} title="Open a .pgn file from your computer">Upload PGN file</button>
        <button className="btn ghost" onClick={() => { setText(EXAMPLE); load(EXAMPLE) }}>Try an example</button>
        <button className="btn ghost" onClick={() => { setText(''); setMessage(null) }}>Clear</button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".pgn,.txt,text/plain,application/x-chess-pgn"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
        aria-label="Upload a PGN file"
      />
      {message && <p className={`callout ${message.ok ? 'ok' : 'error'}`} role="status">{message.text}</p>}
    </div>
  )
}
