import { useEffect, useRef, useState } from 'react'
import { ChessComError, cleanUsername, fetchRecentGames, type ChessComGame } from '../lib/chesscom'
import { parseInput, type GameState } from '../lib/game'

interface Props {
  onLoad: (game: GameState, note: string | undefined, orientation: 'white' | 'black', analyze: boolean) => void
}

const STORAGE_KEY = 'chesscom-user'

const ago = (seconds: number) => {
  if (!seconds) return ''
  const days = Math.floor((Date.now() / 1000 - seconds) / 86400)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 31) return `${days} days ago`
  return new Date(seconds * 1000).toLocaleDateString()
}

/** "Your chess.com games": type a username, pick a recent game, load it with your side at the bottom. */
export default function ChessComGames({ onLoad }: Props) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [state, setState] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; user: string; games: ChessComGame[] }
  >({ status: 'idle' })
  const [pickError, setPickError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const find = async () => {
    const user = cleanUsername(name)
    if (!user) {
      setState({ status: 'error', message: 'Type your chess.com username (3 to 25 letters, digits, "_" or "-").' })
      return
    }
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setState({ status: 'loading' })
    setPickError(null)
    try {
      const games = await fetchRecentGames(user, c.signal)
      if (c.signal.aborted) return
      try {
        localStorage.setItem(STORAGE_KEY, user)
      } catch {
        // private mode: just don't remember it
      }
      setState({ status: 'done', user, games })
    } catch (e) {
      if (c.signal.aborted) return
      setState({ status: 'error', message: e instanceof ChessComError ? e.message : 'Something went wrong while asking chess.com. Please try again.' })
    }
  }

  const open = (g: ChessComGame, analyze: boolean) => {
    const r = parseInput(g.pgn)
    if (!r.ok) {
      setPickError(r.error)
      return
    }
    setPickError(null)
    onLoad(r.game, `${g.white} vs ${g.black}. ${g.resultText}.`, g.userColor, analyze && r.game.plies.length > 0)
  }

  return (
    <section className="chesscom" aria-labelledby="chesscom-title">
      <h3 id="chesscom-title" className="field-label">Your chess.com games</h3>
      <form className="row chesscom-form" onSubmit={(e) => { e.preventDefault(); void find() }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="chess.com username"
          aria-label="chess.com username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="btn" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Looking…' : 'Find games'}
        </button>
      </form>
      <p className="hint">Only public game data is read, straight from chess.com. No password needed.</p>

      {state.status === 'error' && <p className="callout error" role="alert">{state.message}</p>}
      {pickError && <p className="callout error" role="alert">{pickError}</p>}
      {state.status === 'done' && state.games.length === 0 && (
        <p className="callout warn" role="status">No recent standard games found for {state.user}.</p>
      )}
      {state.status === 'done' && state.games.length > 0 && (
        <ul className="game-list" aria-label={`Recent games of ${state.user}`}>
          {state.games.map((g) => (
            <li key={g.id} className={`game-item ${g.outcome}`}>
              <div className="game-info">
                <strong>
                  <span className={`dot ${g.userColor}`} aria-label={`played ${g.userColor}`} /> vs {g.opponent}
                  {g.opponentRating !== null && <span className="muted"> ({g.opponentRating})</span>}
                </strong>
                <span className="muted">{g.resultText}{g.timeClass ? ` · ${g.timeClass}` : ''}{g.endTime ? ` · ${ago(g.endTime)}` : ''}</span>
              </div>
              <div className="row">
                <button className="btn small" onClick={() => open(g, false)}>Load</button>
                <button className="btn small" onClick={() => open(g, true)} title="Load the game, then rate every move">Analyze</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
