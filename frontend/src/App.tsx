import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import BoardToolbar from './components/BoardToolbar'
import EnginePanel from './components/EnginePanel'
import ExplainPanel from './components/ExplainPanel'
import EvalBar from './components/EvalBar'
import FactsPanel from './components/FactsPanel'
import GameSummary from './components/GameSummary'
import LoadPanel from './components/LoadPanel'
import MovesPanel from './components/MovesPanel'
import OverviewPanel, { type Detail } from './components/OverviewPanel'
import Tabs, { type TabDef } from './components/Tabs'
import ThreatsPanel from './components/ThreatsPanel'
import {
  canRedo, canUndo, fenAt, jumpTo, lastPly, newGame, playMove, type GameState,
} from './lib/game'
import { getAnalysis, useAnalysisVersion } from './lib/analysisStore'
import { classifyGame, summarizeGame } from './lib/classify'
import { evalSeries, keyMoments, stepKeyMoment } from './lib/keyMoments'
import { analyzePositions, type Batch } from './lib/gameAnalysis'
import { analyzePosition } from './lib/facts'
import { buildThreatLists, highlightSquares } from './lib/threats'
import { buildExplainRequest } from './lib/explainPayload'
import { positionKey } from './lib/analysisStore'
import { pvToSan } from './lib/uci'
import { useEngine } from './lib/useEngine'
import { useExplanation } from './lib/useExplanation'
import { useCloudStatus } from './lib/useCloudStatus'
import { useMediaQuery } from './lib/useMediaQuery'
import { useThreat } from './lib/useThreat'

const BEST_ARROW_COLOR = 'rgba(34, 160, 60, 0.85)'
const THREAT_ARROW_COLOR = 'rgba(220, 38, 38, 0.85)'
const glow = (rgb: string) => ({ background: `radial-gradient(circle, rgba(${rgb}, 0.75) 0%, rgba(${rgb}, 0.25) 55%, rgba(${rgb}, 0) 75%)` })
const LAST_MOVE_STYLE = { backgroundColor: 'rgba(255, 213, 0, 0.42)' }
// Soft blue-grey board: green (best move), red (threat) and yellow (last move) all stand out on it.
const LIGHT_SQUARE = '#dfe5ea'
const DARK_SQUARE = '#86a1b3'
const BOARD_STYLE = { borderRadius: 8, overflow: 'hidden', boxShadow: '0 6px 24px rgba(15, 23, 42, 0.18)' }
const NOTATION = { fontSize: 11, fontWeight: 700 }

type TabId = 'moves' | 'coach' | 'overview' | 'threats' | 'facts' | 'summary' | 'load'

export default function App() {
  const [game, setGame] = useState<GameState>(() => newGame())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  // Wide screens show the move list as its own column; narrower ones make it the first tab.
  const wide = useMediaQuery('(min-width: 1400px)')
  const [chosenTab, setChosenTab] = useState<TabId | null>(null)
  const activeTab: TabId = chosenTab && !(wide && chosenTab === 'moves') ? chosenTab : wide ? 'coach' : 'moves'

  const fen = fenAt(game)
  const chess = useMemo(() => new Chess(fen), [fen])
  const last = lastPly(game)
  const [engineOn, setEngineOn] = useState(true)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; cloud: number } | null>(null)
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
  const moments = useMemo(() => keyMoments(game, classes), [game, classes])
  const series = useMemo(
    () => evalSeries(game, getAnalysis),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.startFen, game.plies, analysisVersion],
  )
  const cloud = useCloudStatus()
  const jumpMoment = useCallback(
    (dir: 1 | -1) => {
      const m = stepKeyMoment(moments, game.index, dir)
      if (m) setGame((g) => jumpTo(g, m.ply))
    },
    [moments, game.index],
  )

  // A batch belongs to one game: changing the moves cancels it.
  const gameSignature = game.startFen + game.plies.map((p) => p.san).join(' ')
  useEffect(() => () => batchRef.current?.cancel(), [gameSignature])

  const startBatch = () => {
    setBatchError(null)
    const fens = [game.startFen, ...game.plies.map((p) => p.fen)]
    const batch = analyzePositions(fens, (done, total, cloud) => setBatchProgress({ done, total, cloud }))
    batchRef.current = batch
    setBatchProgress({ done: 0, total: batch.total, cloud: 0 })
    batch.done.then(({ result, error }) => {
      if (batchRef.current === batch) batchRef.current = null
      setBatchProgress(null)
      if (result === 'error') setBatchError(error ?? 'Analysis failed.')
    })
  }

  // "Load and analyze": wait until the new game is in place, then start the batch.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 10_000)
    return () => window.clearTimeout(id)
  }, [notice])
  const [analyzeAfterLoad, setAnalyzeAfterLoad] = useState(false)
  useEffect(() => {
    if (analyzeAfterLoad && game.plies.length > 0) {
      setAnalyzeAfterLoad(false)
      startBatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeAfterLoad, gameSignature])

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

  // AI coach: explains only what Stockfish and the fact code produced.
  const viewer = orientation === 'white' ? 'w' : 'b'
  const lastClass = game.index > 0 ? classes[game.index - 1] : null
  const fenBefore = game.index > 0 ? (game.index > 1 ? game.plies[game.index - 2].fen : game.startFen) : null
  const explainKey = `${positionKey(fen)}|${last?.san ?? ''}|${viewer}|${lastClass?.category ?? ''}`
  const explanation = useExplanation(explainKey)
  // Simple/Detailed is only a display choice (both versions come in the same response), so remember it per browser.
  const [detail, setDetailState] = useState<Detail>(() => {
    try {
      return localStorage.getItem('detail') === 'detailed' ? 'detailed' : 'simple'
    } catch {
      return 'simple'
    }
  })
  const setDetail = (d: Detail) => {
    setDetailState(d)
    try {
      localStorage.setItem('detail', d)
    } catch {
      // private mode etc.: the toggle still works for this visit
    }
  }
  const explainBlocked =
    engine.status === 'gameover' ? 'The game is over, so there is nothing to explain.'
    : !engineOn ? 'Turn the engine on: the coach explains Stockfish’s analysis.'
    : engine.status !== 'done' ? 'Waiting for the engine to finish analysing…'
    : null
  const explainNow = () => {
    const req = buildExplainRequest({
      fen, viewer, facts, lists,
      lines: engine.lines,
      linesBefore: fenBefore ? (getAnalysis(fenBefore) ?? null) : null,
      lastPly: last,
      fenBefore,
      classification: lastClass,
    })
    if (req) void explanation.request(req)
  }

  const bestUci = engine.lines[0]?.pv[0]
  const arrows = []
  if (bestUci) arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: BEST_ARROW_COLOR })
  if (threat.status === 'done' && threat.verdict) {
    const u = threat.verdict.uci
    arrows.push({ startSquare: u.slice(0, 2), endSquare: u.slice(2, 4), color: THREAT_ARROW_COLOR })
  }

  const undo = useCallback(() => setGame((g) => jumpTo(g, g.index - 1)), [])
  const redo = useCallback(() => setGame((g) => jumpTo(g, g.index + 1)), [])
  const first = () => setGame((g) => jumpTo(g, 0))
  const lastMove = () => setGame((g) => jumpTo(g, g.plies.length))
  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), [])
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
      else if (e.key === 'f') flip()
      else if (e.key === 'x' || e.key === 'X') toggleThreat()
      else if (e.key === ']') jumpMoment(1)
      else if (e.key === '[') jumpMoment(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, flip, toggleThreat, jumpMoment])

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

  const danger = lists.opponents.some((t) => t.kind !== 'check')
  const tabs: TabDef[] = [
    ...(wide ? [] : [{ id: 'moves', label: 'Moves' }]),
    { id: 'coach', label: 'Coach' },
    { id: 'overview', label: 'Overview' },
    { id: 'threats', label: 'Threats', alert: danger },
    { id: 'facts', label: 'Facts' },
    { id: 'summary', label: 'Summary' },
    { id: 'load', label: 'Load' },
  ]

  const movesPanel = (
    <MovesPanel game={game} classes={classes} engineOn={engineOn} onJump={(i) => setGame((g) => jumpTo(g, i))} />
  )

  let tabBody: React.ReactNode
  switch (activeTab) {
    case 'moves': tabBody = movesPanel; break
    case 'coach': tabBody = <ExplainPanel state={explanation.state} blockedReason={explainBlocked} onExplain={explainNow} />; break
    case 'overview':
      tabBody = (
        <OverviewPanel
          state={explanation.state}
          blockedReason={explainBlocked}
          onExplain={explainNow}
          detail={detail}
          onDetail={setDetail}
          fen={fen}
          playedSan={last?.san ?? null}
          bestSan={engine.lines[0]?.pv[0] ? pvToSan(fen, [engine.lines[0].pv[0]])[0] ?? null : null}
        />
      )
      break
    case 'threats': tabBody = <ThreatsPanel lists={lists} threat={threat} threatOn={threatOn} engineOn={engineOn} onToggle={toggleThreat} />; break
    case 'facts': tabBody = <FactsPanel facts={facts} />; break
    case 'summary':
      tabBody = (
        <GameSummary
          summary={summary}
          hasMoves={game.plies.length > 0}
          progress={batchProgress}
          error={batchError}
          onAnalyze={startBatch}
          onCancel={() => batchRef.current?.cancel()}
          series={series}
          current={game.index}
          moments={moments}
          onJump={(i) => setGame((g) => jumpTo(g, i))}
          onStep={jumpMoment}
        />
      )
      break
    case 'load':
      tabBody = (
        <LoadPanel
          onLoad={(g, note) => { setGame(g); setChosenTab(null); setNotice(note ?? null) }}
          onLoadAndAnalyze={(g, note) => { setGame(g); setChosenTab('summary'); setAnalyzeAfterLoad(true); setNotice(note ?? null) }}
        />
      )
      break
  }

  const turnWhite = chess.turn() === 'w'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>♞</span>
          <h1>Chess Analyser</h1>
        </div>
        <div className="topbar-right">
          <span className="turn-pill" role="status">
            <i className={`pawn ${turnWhite ? 'white' : 'black'}`} />
            {status}
          </span>
          <button className="btn ghost small" onClick={() => setChosenTab('load')}>Load game</button>
        </div>
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <main className={`workspace${wide ? ' wide' : ''}`}>
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
                  lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
                  darkSquareStyle: { backgroundColor: DARK_SQUARE },
                  boardStyle: BOARD_STYLE,
                  lightSquareNotationStyle: { ...NOTATION, color: DARK_SQUARE },
                  darkSquareNotationStyle: { ...NOTATION, color: LIGHT_SQUARE },
                }}
              />
            </div>
          </div>
          <BoardToolbar
            canUndo={canUndo(game)}
            canRedo={canRedo(game)}
            onFirst={first}
            onUndo={undo}
            onRedo={redo}
            onLast={lastMove}
            onFlip={flip}
            onReset={reset}
          />
        </section>

        {wide && <aside className="panel moves-col" aria-label="Moves">{movesPanel}</aside>}

        <aside className="panel analysis-col">
          <EnginePanel
            fen={fen}
            enabled={engineOn}
            onToggle={setEngineOn}
            status={engine.status}
            lines={engine.lines}
            source={engine.source}
            error={engine.error}
            onRetry={engine.retry}
            cloud={cloud}
          />
          <Tabs tabs={tabs} active={activeTab} onChange={(id) => setChosenTab(id as TabId)} />
          <div className="tab-body" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${activeTab}`}>
            {tabBody}
          </div>
        </aside>
      </main>
    </div>
  )
}
