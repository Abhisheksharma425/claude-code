import { PURPOSE_TAGS, type ExplainRequest, type Explanation, type Overview, type Purpose, type Text } from './types.js'
import { AIError } from './types.js'

export const SYSTEM_PROMPT =
  'You are a friendly chess coach for beginners. Only explain the engine analysis and facts given. ' +
  'Never invent moves or claim anything not in the data. Use simple words; explain any chess term you use. Keep it short.'

export const SCHEMA_NAME = 'chess_explanation'

const text = (description: string) => ({
  type: 'object',
  description,
  properties: {
    simple: { type: 'string', description: 'ONE short sentence with the key point.' },
    detailed: { type: 'string', description: 'Two or three short sentences.' },
  },
  required: ['simple', 'detailed'],
  additionalProperties: false,
})

const purpose = (description: string) => ({
  type: 'object',
  description,
  properties: {
    tag: { type: 'string', enum: [...PURPOSE_TAGS, 'None'], description: 'Must be one of the candidate tags given in the data.' },
    reason: { type: 'string', description: 'One sentence explaining why the move has this purpose.' },
  },
  required: ['tag', 'reason'],
  additionalProperties: false,
})

/** JSON Schema the model must follow (OpenAI strict structured outputs: every field required, no extras). */
export const EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    moveExplanation: { type: 'string', description: "Why the engine's best move is good and what it is trying to do." },
    lastMoveFeedback: { type: 'string', description: 'What went wrong with the last move and what was better. Empty string if there is no last move.' },
    threats: { type: 'string', description: 'What each side threatens and how to handle it.' },
    lesson: { type: 'string', description: 'One short tip.' },
    overview: {
      type: 'object',
      description: 'The Big Picture overview.',
      properties: {
        phase: text('The game phase and what matters in it.'),
        whoIsBetter: text('Who is better and why, in plain words.'),
        plans: {
          type: 'object',
          properties: {
            white: text("White's plan for the next few moves."),
            black: text("Black's plan for the next few moves."),
          },
          required: ['white', 'black'],
          additionalProperties: false,
        },
        playedMove: purpose('Purpose of the move that was just played ("None" if there is no last move).'),
        bestMove: purpose("Purpose of the engine's best move."),
        story: {
          type: 'array',
          description: "The engine's top line told as a short story, one item per move, in order.",
          items: text('What this move does and how the opponent can answer.'),
        },
        keyFeatures: {
          type: 'object',
          properties: {
            pawnStructure: text('Pawn structure.'),
            openFiles: text('Open and half-open files.'),
            weakSquares: text('Weak squares.'),
            pieceActivity: text('Active versus passive pieces.'),
          },
          required: ['pawnStructure', 'openFiles', 'weakSquares', 'pieceActivity'],
          additionalProperties: false,
        },
      },
      required: ['phase', 'whoIsBetter', 'plans', 'playedMove', 'bestMove', 'story', 'keyFeatures'],
      additionalProperties: false,
    },
  },
  required: ['moveExplanation', 'lastMoveFeedback', 'threats', 'lesson', 'overview'],
  additionalProperties: false,
} as const

/** The user message: conventions + the data. The data is the only source of chess knowledge the coach may use. */
export function buildUserMessage(req: ExplainRequest): string {
  const n = req.engine.topLine.plies.length
  return [
    'Explain this chess position to a beginner using ONLY the data below. Stockfish chose the moves; you only explain them.',
    '',
    'How to read the data:',
    '- Scores are in pawns from White\'s point of view (positive = White is better, negative = Black is better).',
    `- "you" means the player sitting on the ${req.viewer} side. "yourThreats" are things you can do to your opponent; "opponentThreats" are things your opponent can do to you.`,
    '- "purposes.tags" and "bestMovePurposes.tags" were worked out by code: they list why a move is played. "notes" are the facts behind them.',
    '- Only mention moves that appear in the data.',
    '',
    'Reply with JSON containing:',
    '- moveExplanation: why the engine\'s best move is good and what it is trying to do.',
    '- lastMoveFeedback: what went wrong with the last move and what was better (use the classification and betterMoveSan). If there is no last move, use an empty string.',
    '- threats: what each side threatens and how to handle it.',
    '- lesson: one short tip.',
    '- overview (the "Big Picture"). Every section marked TEXT has two versions: "simple" = ONE short sentence with the key point; "detailed" = two or three short sentences.',
    '  - phase (TEXT): the game phase and what matters in it (use facts.phase and facts.phaseTip).',
    '  - whoIsBetter (TEXT): who is better and why, in plain words (use engine.evalAfter, material and the facts).',
    "  - plans.white and plans.black (TEXT): each side's plan for the next few moves, based on the engine's top line and the facts.",
    '  - playedMove: { tag, reason }. tag must be one of lastMove.purposes.tags; reason is ONE sentence. If there is no last move: tag "None" and reason "".',
    '  - bestMove: { tag, reason }. tag must be one of engine.bestMovePurposes.tags; reason is ONE sentence. If bestMovePurposes is null: tag "None" and reason "".',
    `  - story: exactly ${n} item${n === 1 ? '' : 's'} (TEXT), one for each move of engine.topLine.plies, in order. Tell the engine's line as a short story: what the move does and how the other side can answer.`,
    '  - keyFeatures: pawnStructure, openFiles, weakSquares, pieceActivity (each TEXT), from the facts notes. If nothing notable, say so simply.',
    '',
    'DATA:',
    JSON.stringify(req, null, 2),
  ].join('\n')
}

const bad = (message: string) => new AIError('bad_response', message, 502)

function parseText(v: unknown, name: string): Text {
  if (typeof v !== 'object' || v === null) throw bad(`The AI's answer was missing "${name}". Please try again.`)
  const o = v as Record<string, unknown>
  const simple = typeof o.simple === 'string' ? o.simple.trim() : ''
  const detailed = typeof o.detailed === 'string' ? o.detailed.trim() : ''
  if (!simple || !detailed) throw bad(`The AI's answer for "${name}" was incomplete. Please try again.`)
  return { simple, detailed }
}

function parsePurpose(v: unknown, name: string, allowed: readonly string[] | null): Purpose {
  // No move, no purpose: don't trust the model on this.
  if (allowed === null) return { tag: 'None', reason: '' }
  if (typeof v !== 'object' || v === null) throw bad(`The AI's answer was missing "${name}". Please try again.`)
  const o = v as Record<string, unknown>
  const reason = typeof o.reason === 'string' ? o.reason.trim() : ''
  if (!reason) throw bad(`The AI's answer for "${name}" had no reason. Please try again.`)
  // The tags come from code. If the model picks something else, fall back to the code's top candidate.
  const tag = typeof o.tag === 'string' && allowed.includes(o.tag) ? (o.tag as Purpose['tag']) : (allowed[0] as Purpose['tag'])
  return { tag, reason }
}

function parseOverview(v: unknown, req: ExplainRequest): Overview {
  if (typeof v !== 'object' || v === null) throw bad('The AI\'s answer was missing "overview". Please try again.')
  const o = v as Record<string, any>
  const plies = req.engine.topLine.plies

  if (!Array.isArray(o.story) || o.story.length < plies.length) {
    throw bad(`The AI's story had ${Array.isArray(o.story) ? o.story.length : 0} steps but ${plies.length} were needed. Please try again.`)
  }
  const kf = o.keyFeatures ?? {}
  return {
    phase: parseText(o.phase, 'phase'),
    whoIsBetter: parseText(o.whoIsBetter, 'whoIsBetter'),
    plans: { white: parseText(o.plans?.white, 'plans.white'), black: parseText(o.plans?.black, 'plans.black') },
    playedMove: parsePurpose(o.playedMove, 'playedMove', req.lastMove ? req.lastMove.purposes.tags : null),
    bestMove: parsePurpose(o.bestMove, 'bestMove', req.engine.bestMovePurposes && req.engine.bestMoveSan ? req.engine.bestMovePurposes.tags : null),
    // The moves themselves come from the engine data, in order; the AI only supplies the words.
    story: plies.map((move, i) => ({ move, text: parseText(o.story[i], `story[${i}]`) })),
    keyFeatures: {
      pawnStructure: parseText(kf.pawnStructure, 'keyFeatures.pawnStructure'),
      openFiles: parseText(kf.openFiles, 'keyFeatures.openFiles'),
      weakSquares: parseText(kf.weakSquares, 'keyFeatures.weakSquares'),
      pieceActivity: parseText(kf.pieceActivity, 'keyFeatures.pieceActivity'),
    },
  }
}

const TOP_FIELDS = ['moveExplanation', 'lastMoveFeedback', 'threats', 'lesson'] as const

/** Parses and validates the model's JSON. Throws AIError('bad_response') if it doesn't match. */
export function parseExplanation(raw: string, req: ExplainRequest): Explanation {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw bad("The AI sent back something that wasn't valid JSON. Please try again.")
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw bad('The AI sent back an unexpected answer. Please try again.')
  }
  const d = data as Record<string, unknown>
  const out: Partial<Explanation> = {}
  for (const key of TOP_FIELDS) {
    const v = d[key]
    if (typeof v !== 'string') throw bad(`The AI's answer was missing "${key}". Please try again.`)
    out[key] = v.trim()
  }
  out.overview = parseOverview(d.overview, req)
  return out as Explanation
}
