import Icon, { type IconName } from './Icon'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onFirst: () => void
  onUndo: () => void
  onRedo: () => void
  onLast: () => void
  onFlip: () => void
  onReset: () => void
}

export default function BoardToolbar(p: Props) {
  const btn = (icon: IconName, label: string, onClick: () => void, disabled = false) => (
    <button className="icon-btn" onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  )
  return (
    <div className="toolbar" role="toolbar" aria-label="Board controls">
      {btn('first', 'Go to start', p.onFirst, !p.canUndo)}
      {btn('prev', 'Previous move (←)', p.onUndo, !p.canUndo)}
      {btn('next', 'Next move (→)', p.onRedo, !p.canRedo)}
      {btn('last', 'Go to end', p.onLast, !p.canRedo)}
      <span className="toolbar-sep" />
      {btn('flip', 'Flip board (F)', p.onFlip)}
      {btn('reset', 'New game', p.onReset)}
    </div>
  )
}
