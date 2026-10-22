// Chess.com public API (no key needed): https://www.chess.com/news/view/published-data-api
// Called straight from the browser, like the Lichess cloud eval. Only public game data is read.

export interface ChessComGame {
  /** Link to the game on chess.com (also used as a unique id). */
  id: string
  pgn: string
  white: string
  black: string
  whiteRating: number | null
  blackRating: number | null
  /** The colour the searched player had. */
  userColor: 'white' | 'black'
  opponent: string
  opponentRating: number | null
  outcome: 'win' | 'loss' | 'draw'
  /** e.g. "Won by checkmate", "Lost on time", "Draw by repetition". */
  resultText: string
  timeClass: string
  /** Seconds since 1970. */
  endTime: number
}

export class ChessComError extends Error {}

const USERNAME = /^[A-Za-z0-9_-]{3,25}$/
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])
const MAX_GAMES = 30
const MAX_MONTHS = 3

/** Chess.com names are letters, digits, "_" and "-". Returns the cleaned name, or null when it can't be one. */
export function cleanUsername(raw: string): string | null {
  const name = raw.trim().replace(/^@/, '')
  return USERNAME.test(name) ? name : null
}

const how: Record<string, string> = {
  checkmated: 'by checkmate',
  resigned: 'by resignation',
  timeout: 'on time',
  abandoned: 'because the game was abandoned',
}

function describe(userResult: string, opponentResult: string): { outcome: ChessComGame['outcome']; text: string } {
  if (userResult === 'win') return { outcome: 'win', text: `Won ${how[opponentResult] ?? ''}`.trim() }
  if (DRAW_RESULTS.has(userResult)) {
    const why: Record<string, string> = {
      agreed: 'by agreement', repetition: 'by repetition', stalemate: 'by stalemate',
      insufficient: 'with insufficient material', '50move': 'by the 50-move rule', timevsinsufficient: 'on time vs insufficient material',
    }
    return { outcome: 'draw', text: `Draw ${why[userResult]}` }
  }
  return { outcome: 'loss', text: `Lost ${how[userResult] ?? ''}`.trim() }
}

interface RawPlayer { username?: unknown; rating?: unknown; result?: unknown }
interface RawGame { url?: unknown; pgn?: unknown; rules?: unknown; time_class?: unknown; end_time?: unknown; white?: RawPlayer; black?: RawPlayer }

const rating = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Turns one month of chess.com data into game summaries for `username`. Skips variants (chess960, ...) and odd rows. */
export function parseMonth(json: unknown, username: string): ChessComGame[] {
  const raw = (json as { games?: unknown } | null)?.games
  if (!Array.isArray(raw)) return []
  const me = username.toLowerCase()
  const out: ChessComGame[] = []
  for (const g of raw as RawGame[]) {
    if (!g || typeof g.pgn !== 'string' || !g.pgn.trim() || typeof g.url !== 'string') continue
    if (g.rules !== undefined && g.rules !== 'chess') continue
    const w = g.white ?? {}
    const b = g.black ?? {}
    if (typeof w.username !== 'string' || typeof b.username !== 'string') continue
    const isWhite = w.username.toLowerCase() === me
    if (!isWhite && b.username.toLowerCase() !== me) continue
    const mine = isWhite ? w : b
    const theirs = isWhite ? b : w
    const { outcome, text } = describe(String(mine.result ?? ''), String(theirs.result ?? ''))
    out.push({
      id: g.url,
      pgn: g.pgn,
      white: w.username,
      black: b.username,
      whiteRating: rating(w.rating),
      blackRating: rating(b.rating),
      userColor: isWhite ? 'white' : 'black',
      opponent: String(theirs.username),
      opponentRating: rating(theirs.rating),
      outcome,
      resultText: text,
      timeClass: typeof g.time_class === 'string' ? g.time_class : '',
      endTime: typeof g.end_time === 'number' ? g.end_time : 0,
    })
  }
  return out
}

type FetchFn = (url: string, init?: { signal?: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

async function getJson(fetchFn: FetchFn, url: string, signal: AbortSignal | undefined, name: string): Promise<unknown> {
  let res
  try {
    res = await fetchFn(url, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ChessComError("Couldn't reach chess.com. Check your internet connection and try again.")
  }
  if (res.status === 404) throw new ChessComError(`Chess.com has no player called "${name}". Check the spelling.`)
  if (res.status === 429) throw new ChessComError('Chess.com says we are asking too often. Wait a minute and try again.')
  if (!res.ok) throw new ChessComError(`Chess.com answered with an error (${res.status}). Please try again later.`)
  try {
    return await res.json()
  } catch {
    throw new ChessComError('Chess.com sent back something unexpected. Please try again later.')
  }
}

/** Newest games first (up to 30, from the latest 3 months that have any). */
export async function fetchRecentGames(
  username: string,
  signal?: AbortSignal,
  fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<ChessComGame[]> {
  const name = cleanUsername(username)
  if (!name) throw new ChessComError('A chess.com username has 3 to 25 letters, digits, "_" or "-".')
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}`
  const archives = (await getJson(fetchFn, `${base}/games/archives`, signal, name) as { archives?: unknown }).archives
  if (!Array.isArray(archives) || archives.length === 0) return []

  const games: ChessComGame[] = []
  const months = archives.filter((a): a is string => typeof a === 'string' && a.startsWith(`${base}/games/`)).slice(-MAX_MONTHS).reverse()
  for (const url of months) {
    games.push(...parseMonth(await getJson(fetchFn, url, signal, name), name))
    if (games.length >= MAX_GAMES) break
  }
  const seen = new Set<string>()
  return games
    .filter((g) => !seen.has(g.id) && !!seen.add(g.id))
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, MAX_GAMES)
}
