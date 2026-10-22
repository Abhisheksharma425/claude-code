import type { ExplainRequest } from './types.js'

export class ValidationError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(v: unknown, name: string, max = 600): string {
  if (typeof v !== 'string' || v.length > max) throw new ValidationError(`"${name}" must be a string of at most ${max} characters.`)
  return v
}
function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(`"${name}" must be a number.`)
  return v
}
function side(v: unknown, name: string): 'white' | 'black' {
  if (v !== 'white' && v !== 'black') throw new ValidationError(`"${name}" must be "white" or "black".`)
  return v
}
function arr<T>(v: unknown, name: string, max: number, item: (x: unknown, i: number) => T): T[] {
  if (!Array.isArray(v) || v.length > max) throw new ValidationError(`"${name}" must be a list of at most ${max} items.`)
  return v.map(item)
}
function obj(v: unknown, name: string): Record<string, unknown> {
  if (!isObj(v)) throw new ValidationError(`"${name}" must be an object.`)
  return v
}
const optNum = (v: unknown, name: string) => (v === undefined || v === null ? undefined : num(v, name))

function score(v: unknown, name: string) {
  const o = obj(v, name)
  return { score: str(o.score, `${name}.score`, 20), words: str(o.words, `${name}.words`, 120) }
}
function line(v: unknown, name: string) {
  const o = obj(v, name)
  return { score: str(o.score, `${name}.score`, 20), moves: str(o.moves, `${name}.moves`, 300) }
}

/** Checks and rebuilds the request so only known, size-limited fields reach the prompt. */
export function validateExplainRequest(body: unknown): ExplainRequest {
  const b = obj(body, 'body')
  const lm = b.lastMove
  const engine = obj(b.engine, 'engine')
  const facts = obj(b.facts, 'facts')
  const threats = obj(b.threats, 'threats')

  const fen = str(b.fen, 'fen', 120)
  if (fen.split(' ').length !== 6 || fen.split('/').length !== 8) throw new ValidationError('"fen" doesn\'t look like a FEN.')

  return {
    fen,
    viewer: side(b.viewer, 'viewer'),
    sideToMove: side(b.sideToMove, 'sideToMove'),
    lastMove:
      lm === null || lm === undefined
        ? null
        : (() => {
            const o = obj(lm, 'lastMove')
            const c = o.classification
            return {
              san: str(o.san, 'lastMove.san', 20),
              by: side(o.by, 'lastMove.by'),
              label: str(o.label, 'lastMove.label', 80),
              classification:
                c === null || c === undefined
                  ? null
                  : (() => {
                      const k = obj(c, 'lastMove.classification')
                      return {
                        category: str(k.category, 'category', 30),
                        label: str(k.label, 'label', 30),
                        lossPawns: num(k.lossPawns, 'lossPawns'),
                        betterMoveSan: str(k.betterMoveSan, 'betterMoveSan', 20),
                        mateIn: optNum(k.mateIn, 'mateIn'),
                        allowsMateIn: optNum(k.allowsMateIn, 'allowsMateIn'),
                      }
                    })(),
            }
          })(),
    engine: {
      depth: num(engine.depth, 'engine.depth'),
      bestMoveSan: engine.bestMoveSan === null ? null : str(engine.bestMoveSan, 'engine.bestMoveSan', 20),
      evalBefore: engine.evalBefore === null || engine.evalBefore === undefined ? null : score(engine.evalBefore, 'engine.evalBefore'),
      evalAfter: score(engine.evalAfter, 'engine.evalAfter'),
      topLine: line(engine.topLine, 'engine.topLine'),
      otherLines: arr(engine.otherLines, 'engine.otherLines', 3, (x, i) => line(x, `engine.otherLines[${i}]`)),
    },
    facts: {
      phase: str(facts.phase, 'facts.phase', 30),
      material: str(facts.material, 'facts.material', 120),
      notes: arr(facts.notes, 'facts.notes', 30, (x, i) => {
        const o = obj(x, `facts.notes[${i}]`)
        return { label: str(o.label, 'label', 60), text: str(o.text, 'text', 400) }
      }),
    },
    threats: {
      yours: arr(threats.yours, 'threats.yours', 12, (x, i) => str(x, `threats.yours[${i}]`, 400)),
      opponents: arr(threats.opponents, 'threats.opponents', 12, (x, i) => str(x, `threats.opponents[${i}]`, 400)),
    },
  }
}
