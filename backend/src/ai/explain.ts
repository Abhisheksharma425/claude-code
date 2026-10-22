import { findUnknownMoves } from './guard.js'
import { buildUserMessage, EXPLANATION_SCHEMA, parseExplanation, SCHEMA_NAME, SYSTEM_PROMPT } from './prompt.js'
import type { AIProvider } from './provider.js'
import { AIError, type Explanation, type ExplainRequest } from './types.js'

/**
 * Asks the provider to explain the data, then checks the answer: it must be valid JSON of the right shape
 * and must not mention moves that weren't in the data. One retry, then a clear error.
 */
export async function explain(provider: AIProvider, req: ExplainRequest): Promise<Explanation> {
  const user = buildUserMessage(req)
  let lastProblem = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    const message =
      attempt === 0
        ? user
        : `${user}\n\nYour previous answer was rejected: ${lastProblem} Answer again using only moves that appear in the data.`
    const raw = await provider.complete({ system: SYSTEM_PROMPT, user: message, schemaName: SCHEMA_NAME, schema: EXPLANATION_SCHEMA })
    try {
      const parsed = parseExplanation(raw)
      const unknown = findUnknownMoves(parsed, user)
      if (unknown.length === 0) return parsed
      lastProblem = `it mentioned moves that are not in the data (${unknown.join(', ')}).`
    } catch (e) {
      if (!(e instanceof AIError) || e.code !== 'bad_response') throw e
      lastProblem = e.message
    }
  }
  throw new AIError(
    'bad_response',
    "The AI's answer mentioned moves that Stockfish never suggested, so it was thrown away. Please try again.",
    502,
  )
}
