export const PURPOSE_TAGS = [
  'Develops', 'Controls center', 'Attacks', 'Defends', 'Creates threat', 'Trades', 'King safety', 'Prepares plan', 'Sets trap',
] as const
export type PurposeTag = (typeof PURPOSE_TAGS)[number]

/** Why a move is played, worked out by code. The AI may only pick from `tags`. */
export interface Purposes {
  tags: PurposeTag[]
  notes: string[]
}

/** What the browser sends to /api/explain. Everything here was computed by Stockfish or by code. */
export interface ExplainRequest {
  fen: string
  /** The side at the bottom of the board; "you" in the explanation. */
  viewer: 'white' | 'black'
  sideToMove: 'white' | 'black'
  lastMove: null | {
    san: string
    by: 'white' | 'black'
    /** e.g. "Capture with check". */
    label: string
    /** Candidate purposes for the move that was played, computed by code. */
    purposes: Purposes
    classification: null | {
      category: string
      label: string
      lossPawns: number
      betterMoveSan: string
      mateIn?: number
      allowsMateIn?: number
    }
  }
  engine: {
    depth: number
    bestMoveSan: string | null
    evalBefore: { score: string; words: string } | null
    evalAfter: { score: string; words: string }
    topLine: { score: string; moves: string; plies: string[]; firstMoveBy: 'white' | 'black' }
    /** Candidate purposes for the engine's best move, computed by code. */
    bestMovePurposes: Purposes | null
    otherLines: { score: string; moves: string }[]
  }
  facts: {
    phase: string
    phaseTip: string
    material: string
    notes: { label: string; text: string }[]
  }
  threats: { yours: string[]; opponents: string[] }
}

/** Two versions of the same sentence(s): "simple" is one short sentence, "detailed" is two or three. */
export interface Text {
  simple: string
  detailed: string
}

export interface Purpose {
  tag: PurposeTag | 'None'
  /** One sentence. */
  reason: string
}

/** "Big Picture" overview, part of the same /api/explain response. */
export interface Overview {
  phase: Text
  whoIsBetter: Text
  plans: { white: Text; black: Text }
  playedMove: Purpose
  bestMove: Purpose
  /** One entry per move of the engine's top line; `move` comes from the engine data, never from the AI. */
  story: { move: string; text: Text }[]
  keyFeatures: { pawnStructure: Text; openFiles: Text; weakSquares: Text; pieceActivity: Text }
}

export interface Explanation {
  moveExplanation: string
  lastMoveFeedback: string
  threats: string
  lesson: string
  overview: Overview
}

export type AIErrorCode =
  | 'not_configured'
  | 'bad_key'
  | 'no_credit'
  | 'rate_limit'
  | 'bad_model'
  | 'bad_request'
  | 'unavailable'
  | 'timeout'
  | 'refused'
  | 'bad_response'

/** A failure with a message that is safe to show to the user (never contains the API key). */
export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AIError'
  }
}
