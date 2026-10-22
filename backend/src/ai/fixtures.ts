import type { ExplainRequest } from './types.js'

export const sampleRequest: ExplainRequest = {
  fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2',
  viewer: 'black',
  sideToMove: 'black',
  lastMove: {
    san: 'Qh5',
    by: 'white',
    label: 'Quiet move',
    purposes: { tags: ['Attacks', 'Prepares plan'], notes: ['attacks the pawn on e5 (nothing defends it)'] },
    classification: { category: 'inaccuracy', label: 'Inaccuracy', lossPawns: 0.6, betterMoveSan: 'Nf3' },
  },
  engine: {
    depth: 16,
    bestMoveSan: 'Nc6',
    bestMovePurposes: { tags: ['Defends', 'Develops'], notes: ['brings the knight out from b8'] },
    evalBefore: { score: '+0.30', words: 'White is slightly better' },
    evalAfter: { score: '-0.30', words: 'Black is slightly better' },
    topLine: { score: '-0.30', moves: '2... Nc6 3. Bc4 g6 4. Qf3 Nf6', plies: ['Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6'], firstMoveBy: 'black' },
    otherLines: [{ score: '-0.24', moves: '2... d6 3. Bc4 g6' }],
  },
  facts: {
    phase: 'opening',
    phaseTip: 'Opening: develop your pieces, fight for the center and castle.',
    material: 'Material is equal.',
    notes: [{ label: 'Center', text: 'Center control is balanced (4 to 3).' }],
  },
  threats: {
    yours: [],
    opponents: ['Your pawn on e5 is hanging: attacked by a queen on h5, and nothing defends it.', 'They can give check with Qxf7+, Qxe5+.'],
  },
}

const t = (simple: string, detailed = `${simple} More detail.`) => ({ simple, detailed })

/** What the model returns (story has no `move`: the backend adds it). */
export const goodModelAnswer = {
  moveExplanation: 'Nc6 defends your e5 pawn and develops a knight.',
  lastMoveFeedback: 'Qh5 brought the queen out too early. Nf3 was better.',
  threats: 'White attacks your e5 pawn with the queen, so defend it.',
  lesson: 'Do not bring your queen out too early.',
  overview: {
    phase: t('This is the opening.'),
    whoIsBetter: t('Black is slightly better.'),
    plans: { white: t('White wants to win the e5 pawn.'), black: t('Black wants to defend and develop.') },
    playedMove: { tag: 'Attacks', reason: 'It attacks the undefended pawn on e5.' },
    bestMove: { tag: 'Defends', reason: 'It defends the pawn on e5 and develops a knight.' },
    story: ['Nc6 defends the pawn.', 'Bc4 develops a bishop.', 'g6 attacks the queen.', 'Qf3 retreats.', 'Nf6 develops.'].map((s) => t(s)),
    keyFeatures: {
      pawnStructure: t('Pawns are healthy.'),
      openFiles: t('No open files yet.'),
      weakSquares: t('No weak squares.'),
      pieceActivity: t('Most pieces are still at home.'),
    },
  },
}

/** The same answer after the backend has processed it. */
export const goodAnswer = {
  ...goodModelAnswer,
  overview: {
    ...goodModelAnswer.overview,
    story: goodModelAnswer.overview.story.map((text, i) => ({ move: sampleRequest.engine.topLine.plies[i], text })),
  },
}
