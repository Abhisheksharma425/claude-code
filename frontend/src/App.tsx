import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import LoadPanel from './components/LoadPanel'
import MoveList from './components/MoveList'
import {
  canRedo, canUndo, fenAt, jumpTo, lastPly, newGame, playMove, type GameState,
} from './lib/game'

const LAST_MOVE_STYLE = { backgroundColor: 'rgba(255, 213, 0, 0.4)' }

export default function App() {
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const fen = fenAt(game)
  const chess = useMemo(() => new Chess(fen), [fen])
  const last = lastPly(game)

  const undo = useCallback(() => setGame((g) => jumpTo(g, g.index - 1)), [])
  const redo = useCallback(() => setGame((g) => jumpTo(g, g.index + 1)), [])
  const reset = () => { setGame(newGame()); setOrientation('white') }

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
    if (!targetSquare) return false
    const next = playMove(game, sourceSquare, targetSquare)
    if (!next) return false
    setGame(next)
    return true
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') undo()
      else if (e.key === 'ArrowRight') redo()
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (last) {
    squareStyles[last.from] = LAST_MOVE_STYLE
    squareStyles[last.to] = LAST_MOVE_STYLE
  }

  const status = chess.isCheckmate()
    ? `Checkmate. ${chess.turn() === 'w' ? 'Black' : 'White'} wins.`
    : chess.isStalemate() ? 'Stalemate. Draw.'
    : chess.isDraw() ? 'Draw.'
    : `${chess.turn() === 'w' ? 'White' : 'Black'} to move${chess.inCheck() ? ' (in check)' : ''}`

  return (
    <div className="app">
      <header>
        <h1>♞ Chess Analyser</h1>
        <span className="muted">{status}</span>
      </header>

      <main>
        <section className="board-col">
          <div className="board-wrap">
            <Chessboard
              options={{
                id: 'main-board',
                position: fen,
                boardOrientation: orientation,
                onPieceDrop,
                canDragPiece: ({ piece }) => piece.pieceType[0] === chess.turn(),
                squareStyles,
                animationDurationInMs: 150,
              }}
            />
          </div>
          <div className="controls">
            <button onClick={undo} disabled={!canUndo(game)} title="Undo (←)">◀ Undo</button>
            <button onClick={redo} disabled={!canRedo(game)} title="Redo (→)">Redo ▶</button>
            <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip (F)">⇅ Flip</button>
            <button className="secondary" onClick={reset}>Reset</button>
          </div>
        </section>

        <aside className="side-col">
          <div className="card">
            <h2>Moves</h2>
            <MoveList game={game} onJump={(i) => setGame((g) => jumpTo(g, i))} />
          </div>
          <LoadPanel onLoad={(g) => setGame(g)} />
        </aside>
      </main>
    </div>
  )
}
