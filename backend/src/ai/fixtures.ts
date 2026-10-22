import type { ExplainRequest } from './types.js'

export const sampleRequest: ExplainRequest = {
  fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2',
  viewer: 'black',
  sideToMove: 'black',
  lastMove: {
    san: 'Qh5',
    by: 'white',
    label: 'Quiet move',
    classification: { category: 'inaccuracy', label: 'Inaccuracy', lossPawns: 0.6, betterMoveSan: 'Nf3' },
  },
  engine: {
    depth: 16,
    bestMoveSan: 'Nc6',
    evalBefore: { score: '+0.30', words: 'White is slightly better' },
    evalAfter: { score: '-0.30', words: 'Black is slightly better' },
    topLine: { score: '-0.30', moves: '2... Nc6 3. Bc4 g6 4. Qf3 Nf6' },
    otherLines: [{ score: '-0.24', moves: '2... d6 3. Bc4 g6' }],
  },
  facts: {
    phase: 'opening',
    material: 'Material is equal.',
    notes: [{ label: 'Center', text: 'Center control is balanced (4 to 3).' }],
  },
  threats: {
    yours: [],
    opponents: ['Your pawn on e5 is hanging: attacked by a queen on h5, and nothing defends it.', 'They can give check with Qxf7+, Qxe5+.'],
  },
}

export const goodAnswer = {
  moveExplanation: 'Nc6 defends your e5 pawn and develops a knight.',
  lastMoveFeedback: 'Qh5 brought the queen out too early. Nf3 was better.',
  threats: 'White attacks your e5 pawn with the queen, so defend it.',
  lesson: 'Do not bring your queen out too early.',
}
