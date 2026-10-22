import type { PlyClassification } from '../lib/classify'
import { lastPly, type GameState } from '../lib/game'
import MoveFeedback from './MoveFeedback'
import MoveList from './MoveList'

interface Props {
  game: GameState
  classes: (PlyClassification | null)[]
  engineOn: boolean
  onJump: (index: number) => void
}

/** Move list (click to jump) with the rating of the current move pinned underneath. */
export default function MovesPanel({ game, classes, engineOn, onJump }: Props) {
  return (
    <div className="moves-panel">
      <MoveList game={game} classes={classes} onJump={onJump} />
      <MoveFeedback ply={lastPly(game)} classification={game.index > 0 ? classes[game.index - 1] : null} engineOn={engineOn} />
    </div>
  )
}
