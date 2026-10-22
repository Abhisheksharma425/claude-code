import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import EnginePanel from './components/EnginePanel'
import EvalBar from './components/EvalBar'
import FactsPanel from './components/FactsPanel'
import GameSummary from './components/GameSummary'
import LoadPanel from './components/LoadPanel'
import MoveFeedback from './components/MoveFeedback'
import MoveList from './components/MoveList'
import ThreatsPanel from './components/ThreatsPanel'
import {
  canRedo, canUndo, fenAt, jumpTo, lastPly, newGame, playMove, type GameState,
} from './lib/game'
import { getAnalysis, useAnalysisVersion } from './lib/analysisStore'
import { classifyGame, summarizeGame } from './lib/classify'
import { analyzePositions, type Batch } from './lib/gameAnalysis'
import { analyzePosition } from './lib/facts'
import { buildThreatLists, highlightSquares } from './lib/threats'
import { useEngine } from './lib/useEngine'
import { useThreat } from './lib/useThreat'

const BEST_ARROW_COLOR = 'rgba(34, 160, 60, 0.85)'
const THREAT_ARROW_COLOR = 'rgba(220, 38, 38, 0.85)'
const glow = (rgb: string) => ({ background: `radial-gradient(circle, rgba(${rgb}, 0.75) 0%, rgba(${rgb}, 0.25) 55%, rgba(${rgb}, 0) 75%)` })
const LAST_MOVE_STYLE = { backgroundColor: 'rgba(255, 213, 0, 0.4)' }

export default function App() {
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const fen = fenAt(game)
  const chess = useMemo(() => new Chess(fen), [fen])
  const last = lastPly(game)
  const [engineOn, setEngineOn] = useState(true)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const batchRef = useRef<Batch | null>(null)
  const engine = useEngine(fen, engineOn, batchProgress !== null)

  // Ratings are derived from finished engine analyses, so they fill in as analyses complete.
  const analysisVersion = useAnalysisVersion()
  const classes = useMemo(
    () => classifyGame(game.startFen, game.plies, getAnalysis),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.startFen, game.plies, analysisVersion],
  )
  const summary = useMemo(() => summarizeGame(game.startFen, game.plies, classes), [game.startFen, game.plies, classes])

  // A batch belongs to one game: changing the moves cancels it.
  const gameSignature = game.startFen + game.plies.map((p) => p.san).join(' ')
  useEffect(() => () => batchRef.current?.cancel(), [gameSignature])

  const startBatch = () => {
    setBatchError(null)
    const fens = [game.startFen, ...game.plies.map((p) => p.fen)]
    const batch = analyzePositions(fens, (done, total) => setBatchProgress({ done, total }))
    batchRef.current = batch
    setBatchProgress({ done: 0, total: batch.total })
    batch.done.then(({ result, error }) => {
      if (batchRef.current === batch) batchRef.current = null
      setBatchProgress(null)
      if (result === 'error') setBatchError(error ?? 'Analysis failed.')
    })
  }

  const [threatOn, setThreatOn] = useState(false)
  const threat = useThreat(fen, threatOn, batchProgress !== null)
  const toggleThreat = useCallback(() => setThreatOn((on) => !on), [])

  // Computed facts (no engine): threats for each side from the point of view of whoever is at the bottom.
  const facts = useMemo(
    () => analyzePosition(fen, last ? { fenBefore: game.index > 1 ? game.plies[game.index - 2].fen : game.startFen, san: last.san } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, game.startFen, game.index],
  )
  const lists = useMemo(() => buildThreatLists(facts, orientation === 'white' ? 'w' : 'b'), [facts, orientation])
  const highlights = useMemo(() => highlightSquares(lists), [lists])

  const bestUci = engine.lines[0]?.pv[0]
  const arrows = []
  if (bestUci) arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: BEST_ARROW_COLOR })
  if (threat.status === 'done' && threat.verdict) {
    const u = threat.verdict.uci
    arrows.push({ startSquare: u.slice(0, 2), endSquare: u.slice(2, 4), color: THREAT_ARROW_COLOR })
  }

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
      else if (e.key === 'x' || e.key === 'X') toggleThreat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, toggleThreat])

  const squareStyles: Record<string, React.CSSProperties> = {}
  for (const sq of highlights.attacked) squareStyles[sq] = glow('255, 152, 0')
  for (const sq of highlights.danger) squareStyles[sq] = glow('220, 38, 38')
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
          <ThreatsPanel lists={lists} threat={threat} threatOn={threatOn} engineOn={engineOn} onToggle={toggleThreat} />
          <FactsPanel facts={facts} />
          <MoveFeedback ply={last} classification={game.index > 0 ? classes[game.index - 1] : null} engineOn={engineOn} />
          <div className="card">
            <h2>Moves</h2>
            <MoveList game={game} classes={classes} onJump={(i) => setGame((g) => jumpTo(g, i))} />
          </div>
          <GameSummary
            summary={summary}
            hasMoves={game.plies.length > 0}
            progress={batchProgress}
            error={batchError}
            onAnalyze={startBatch}
            onCancel={() => batchRef.current?.cancel()}
          />
          <LoadPanel onLoad={(g) => setGame(g)} />
        </aside>
      </main>
    </div>
  )
}
