import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import EnginePanel from './components/EnginePanel'
import EvalBar from './components/EvalBar'
import LoadPanel from './components/LoadPanel'
import MoveList from './components/MoveList'
import {
  canRedo, canUndo, fenAt, jumpTo, lastPly, newGame, playMove, type GameState,
} from './lib/game'
import { useEngine } from './lib/useEngine'

const BEST_ARROW_COLOR = 'rgba(34, 160, 60, 0.85)'
const LAST_MOVE_STYLE = { backgroundColor: 'rgba(255, 213, 0, 0.4)' }

export default function App() {
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const fen = fenAt(game)
  const chess = useMemo(() => new Chess(fen), [fen])
  const last = lastPly(game)
  const [engineOn, setEngineOn] = useState(true)
  const engine = useEngine(fen, engineOn)
  const bestUci = engine.lines[0]?.pv[0]
  const arrows = bestUci
    ? [{ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: BEST_ARROW_COLOR }]
    : []

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
            <EvalBar score={engine.lines[0]?.score ?? null} orientation={orientation} />
            <div className="board">
            <Chessboard
              options={{
                id: 'main-board',
                position: fen,
                boardOrientation: orientation,
                onPieceDrop,
                canDragPiece: ({ piece }) => piece.pieceType[0] === chess.turn(),
                squareStyles,
                arrows,
                allowDrawingArrows: false,
                animationDurationInMs: 150,
              }}
            />
            </div>
          </div>
          <div className="controls">
            <button onClick={undo} disabled={!canUndo(game)} title="Undo (←)">◀ Undo</button>
            <button onClick={redo} disabled={!canRedo(game)} title="Redo (→)">Redo ▶</button>
            <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip (F)">⇅ Flip</button>
            <button className="secondary" onClick={reset}>Reset</button>
          </div>
        </section>

        <aside className="side-col">
          <EnginePanel
            fen={fen}
            enabled={engineOn}
            onToggle={setEngineOn}
            status={engine.status}
            lines={engine.lines}
            error={engine.error}
            onRetry={engine.retry}
          />
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
