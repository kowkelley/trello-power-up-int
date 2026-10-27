import type { Card, Snapshot } from '../../model'
import { complete, status } from '../../model'

export function CardMetadata({ card, data }: { card: Card; data: Snapshot }) {
  const done = complete(card, data.rules)
  const due = card.due ? new Date(card.due) : undefined
  const validDue = due && Number.isFinite(due.getTime()) ? due : undefined
  const overdue = validDue && !done && validDue.getTime() < Date.now()
  return <div className="card-metadata">
    <span className={`status-badge${done ? ' is-complete' : ''}`}>{done ? '✓ ' : ''}{status(card, data)}</span>
    <span className="list-badge">List: {data.lists.find(list => list.id === card.idList)?.name ?? 'Unavailable'}</span>
    {done && <span className="completion">Complete</span>}
    {validDue && <time className={overdue ? 'due overdue' : 'due'} dateTime={validDue.toISOString()}>
      {overdue ? 'Overdue · ' : 'Due '}{validDue.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      {card.dueComplete ? ' · checked' : ''}
    </time>}
    {card.labels.map(label => <span key={label.id} className="label-badge">{label.name || label.color || 'Unnamed label'}</span>)}
    {!!card.idMembers.length && <span className="members">
      Members: {card.idMembers.map(id => data.members.find(member => member.id === id)?.fullName ?? 'Unknown member').join(', ')}
    </span>}
  </div>
}
