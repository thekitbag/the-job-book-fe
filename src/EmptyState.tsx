import type { ReactNode } from 'react'

// Empty-section card (Manual Add V2): says in plain language what belongs in
// the section and offers the relevant manual add action. Deliberately no
// Record button or microphone action here — voice capture stays with the one
// global fixed Record bar. Copy may mention Record as text to keep the
// voice-first mental model, but the only tappable action is manual add.
export default function EmptyState({ title, hint, action }: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-card">
      <p className="empty-card-title">{title}</p>
      {hint && <p className="empty-card-hint">{hint}</p>}
      {action && <div className="empty-card-action">{action}</div>}
    </div>
  )
}
