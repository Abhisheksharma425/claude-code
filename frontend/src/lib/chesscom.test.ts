import { describe, expect, it } from 'vitest'
import { ChessComError, cleanUsername, fetchRecentGames, parseMonth } from './chesscom'

const game = (over: Record<string, unknown> = {}) => ({
  url: 'https://www.chess.com/game/live/1',
  pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
  rules: 'chess',
  time_class: 'rapid',
  end_time: 1000,
  white: { username: 'Magnus', rating: 2800, result: 'win' },
  black: { username: 'Hikaru', rating: 2790, result: 'checkmated' },
  ...over,
})

describe('cleanUsername', () => {
  it('accepts normal names and an @ prefix, trims spaces', () => {
    expect(cleanUsername('  Magnus_C-1 ')).toBe('Magnus_C-1')
    expect(cleanUsername('@hikaru')).toBe('hikaru')
  })
  it('rejects names that could never exist (also keeps odd characters out of the URL)', () => {
    for (const bad of ['', 'ab', 'a'.repeat(26), 'foo/bar', 'a b c', '../x', 'name?x=1']) expect(cleanUsername(bad)).toBeNull()
  })
})

describe('parseMonth', () => {
  it('describes a win as white', () => {
    const [g] = parseMonth({ games: [game()] }, 'magnus')
    expect(g).toMatchObject({ userColor: 'white', opponent: 'Hikaru', opponentRating: 2790, outcome: 'win', resultText: 'Won by checkmate', timeClass: 'rapid' })
  })
  it('describes a loss as black, matching the name in any case', () => {
    const [g] = parseMonth({ games: [game()] }, 'HIKARU')
    expect(g).toMatchObject({ userColor: 'black', opponent: 'Magnus', outcome: 'loss', resultText: 'Lost by checkmate' })
  })
  it('knows draws, resignations and time-outs', () => {
    const rows = parseMonth(
      { games: [
        game({ url: 'a', white: { username: 'me', result: 'agreed' }, black: { username: 'x', result: 'agreed' } }),
        game({ url: 'b', white: { username: 'me', result: 'win' }, black: { username: 'x', result: 'resigned' } }),
        game({ url: 'c', white: { username: 'me', result: 'timeout' }, black: { username: 'x', result: 'win' } }),
      ] },
      'me',
    )
    expect(rows.map((r) => r.resultText)).toEqual(['Draw by agreement', 'Won by resignation', 'Lost on time'])
  })
  it('skips variants, games without a PGN, games of other players and malformed rows', () => {
    const rows = parseMonth(
      { games: [game({ rules: 'chess960' }), game({ pgn: '' }), game({ white: { username: 'a' }, black: { username: 'b' } }), null, 5, game({ url: 'ok' })] },
      'magnus',
    )
    expect(rows.map((r) => r.id)).toEqual(['ok'])
  })
  it('returns nothing for unexpected data', () => {
    expect(parseMonth(null, 'x')).toEqual([])
    expect(parseMonth({ games: 'no' }, 'x')).toEqual([])
  })
})

describe('fetchRecentGames', () => {
  const base = 'https://api.chess.com/pub/player/magnus'
  const reply = (status: number, body: unknown = {}) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })

  it('reads the newest months first, sorts newest first and stops once it has enough', async () => {
    const asked: string[] = []
    const fake = (url: string) => {
      asked.push(url)
      if (url.endsWith('/archives')) return reply(200, { archives: [`${base}/games/2026/07`, `${base}/games/2026/08`, `${base}/games/2026/09`] })
      const many = Array.from({ length: 20 }, (_, i) => game({ url: `${url}#${i}`, end_time: url.endsWith('09') ? 3000 + i : 2000 + i }))
      return reply(200, { games: many })
    }
    const games = await fetchRecentGames('Magnus', undefined, fake)
    expect(games).toHaveLength(30)
    expect(games[0].endTime).toBe(3019)
    expect(games.every((g, i) => i === 0 || games[i - 1].endTime >= g.endTime)).toBe(true)
    expect(asked).toEqual([`${base}/games/archives`, `${base}/games/2026/09`, `${base}/games/2026/08`])
  })
  it('lists each game once', async () => {
    const fake = (url: string) =>
      url.endsWith('/archives') ? reply(200, { archives: [`${base}/games/2026/08`, `${base}/games/2026/09`] }) : reply(200, { games: [game()] })
    expect(await fetchRecentGames('magnus', undefined, fake)).toHaveLength(1)
  })
  it('gives an empty list for a player with no games', async () => {
    expect(await fetchRecentGames('magnus', undefined, () => reply(200, { archives: [] }))).toEqual([])
  })
  it('explains unknown players, rate limits, server errors and no network', async () => {
    await expect(fetchRecentGames('magnus', undefined, () => reply(404))).rejects.toThrow(/no player called "magnus"/)
    await expect(fetchRecentGames('magnus', undefined, () => reply(429))).rejects.toThrow(/too often/)
    await expect(fetchRecentGames('magnus', undefined, () => reply(500))).rejects.toThrow(/error \(500\)/)
    await expect(fetchRecentGames('magnus', undefined, () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow(/Couldn't reach chess.com/)
  })
  it('rejects bad names without calling the network', async () => {
    let called = false
    await expect(fetchRecentGames('a/b', undefined, () => ((called = true), reply(200)))).rejects.toBeInstanceOf(ChessComError)
    expect(called).toBe(false)
  })
  it('ignores archive links that point somewhere else', async () => {
    const asked: string[] = []
    const fake = (url: string) => {
      asked.push(url)
      return url.endsWith('/archives') ? reply(200, { archives: ['https://evil.example/x'] }) : reply(200, { games: [] })
    }
    expect(await fetchRecentGames('magnus', undefined, fake)).toEqual([])
    expect(asked).toHaveLength(1)
  })
})
