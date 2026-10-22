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
    topLine: { score: string; moves: string }
    otherLines: { score: string; moves: string }[]
  }
  facts: {
    phase: string
    material: string
    notes: { label: string; text: string }[]
  }
  threats: { yours: string[]; opponents: string[] }
}

export interface Explanation {
  moveExplanation: string
  lastMoveFeedback: string
  threats: string
  lesson: string
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
