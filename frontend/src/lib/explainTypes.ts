// Mirrors backend/src/ai/types.ts (the two packages are separate, so keep them in sync).

export type PurposeTag =
  | 'Develops' | 'Controls center' | 'Attacks' | 'Defends' | 'Creates threat' | 'Trades' | 'King safety' | 'Prepares plan' | 'Sets trap'

export interface Purposes {
  tags: PurposeTag[]
  notes: string[]
}

export interface ExplainRequest {
  fen: string
  viewer: 'white' | 'black'
  sideToMove: 'white' | 'black'
  lastMove: null | {
    san: string
    by: 'white' | 'black'
    label: string
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

export interface Text {
  simple: string
  detailed: string
}

export interface Purpose {
  tag: PurposeTag | 'None'
  reason: string
}

export interface Overview {
  phase: Text
  whoIsBetter: Text
  plans: { white: Text; black: Text }
  playedMove: Purpose
  bestMove: Purpose
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

export interface ExplainError {
  code: string
  message: string
}
