export interface TabDef {
  id: string
  label: string
  /** Small red dot to draw attention (e.g. a piece is in danger). */
  alert?: boolean
}

interface Props {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
}

export default function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls="tab-panel"
          className={`tab${t.id === active ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.alert && <span className="tab-alert" aria-label="needs attention" />}
        </button>
      ))}
    </div>
  )
}
