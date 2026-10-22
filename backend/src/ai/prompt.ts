import type { ExplainRequest, Explanation } from './types.js'
import { AIError } from './types.js'

export const SYSTEM_PROMPT =
  'You are a friendly chess coach for beginners. Only explain the engine analysis and facts given. ' +
  'Never invent moves or claim anything not in the data. Use simple words; explain any chess term you use. Keep it short.'

export const SCHEMA_NAME = 'chess_explanation'

export const EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    moveExplanation: { type: 'string', description: "Why the engine's best move is good and what it is trying to do." },
    lastMoveFeedback: { type: 'string', description: 'What went wrong with the last move and what was better. Empty string if there is no last move.' },
    threats: { type: 'string', description: 'What each side threatens and how to handle it.' },
    lesson: { type: 'string', description: 'One short tip.' },
  },
  required: ['moveExplanation', 'lastMoveFeedback', 'threats', 'lesson'],
  additionalProperties: false,
} as const

const FIELDS: (keyof Explanation)[] = ['moveExplanation', 'lastMoveFeedback', 'threats', 'lesson']

/** The user message: conventions + the data. The data is the only source of chess knowledge the coach may use. */
export function buildUserMessage(req: ExplainRequest): string {
  return [
    'Explain this chess position to a beginner using ONLY the data below. Stockfish chose the moves; you only explain them.',
    '',
    'How to read the data:',
    '- Scores are in pawns from White\'s point of view (positive = White is better, negative = Black is better).',
    `- "you" means the player sitting on the ${req.viewer} side. "yourThreats" are things you can do to your opponent; "opponentThreats" are things your opponent can do to you.`,
    '- Only mention moves that appear in the data.',
    '',
    'Reply with JSON containing:',
    '- moveExplanation: why the engine\'s best move is good and what it is trying to do.',
    '- lastMoveFeedback: what went wrong with the last move and what was better (use the classification and betterMoveSan). If there is no last move, use an empty string.',
    '- threats: what each side threatens and how to handle it.',
    '- lesson: one short tip.',
    '',
    'DATA:',
    JSON.stringify(req, null, 2),
  ].join('\n')
}

/** Parses and validates the model's JSON. Throws AIError('bad_response') if it doesn't match. */
export function parseExplanation(raw: string): Explanation {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new AIError('bad_response', 'The AI sent back something that wasn\'t valid JSON. Please try again.', 502)
  }
  if (typeof data !== 'object' || data === null) {
    throw new AIError('bad_response', 'The AI sent back an unexpected answer. Please try again.', 502)
  }
  const out = {} as Explanation
  for (const key of FIELDS) {
    const v = (data as Record<string, unknown>)[key]
    if (typeof v !== 'string') {
      throw new AIError('bad_response', `The AI's answer was missing "${key}". Please try again.`, 502)
    }
    out[key] = v.trim()
  }
  return out
}
