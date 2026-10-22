import type { ExplainError, ExplainRequest, Explanation } from './explainTypes'

export class ExplainFailure extends Error {
  constructor(public info: ExplainError) {
    super(info.message)
  }
}

const NO_BACKEND: ExplainError = {
  code: 'network',
  message: "Can't reach the AI backend. Start it with `npm run dev:backend` and try again.",
}

/** Calls the Express backend. The OpenAI key never reaches the browser; only /api/explain is used. */
export async function fetchExplanation(req: ExplainRequest, signal: AbortSignal): Promise<Explanation> {
  let res: Response
  try {
    res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ExplainFailure(NO_BACKEND)
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // not JSON, e.g. the dev proxy couldn't reach the backend
  }

  if (!res.ok) {
    const err = (body as { error?: ExplainError } | null)?.error
    throw new ExplainFailure(err?.message ? err : res.status >= 500 ? NO_BACKEND : { code: 'unknown', message: `The server answered with an error (${res.status}).` })
  }

  const b = body as Partial<Explanation> | null
  if (!b || typeof b.moveExplanation !== 'string' || typeof b.lastMoveFeedback !== 'string' || typeof b.threats !== 'string' || typeof b.lesson !== 'string' || typeof b.overview !== 'object' || b.overview === null) {
    throw new ExplainFailure({ code: 'bad_response', message: 'The backend sent back an answer in an unexpected format.' })
  }
  return b as Explanation
}
