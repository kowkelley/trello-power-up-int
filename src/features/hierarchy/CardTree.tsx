import { useRef } from 'react'
import type { Card, Snapshot } from '../../model'
import { rollup } from '../../model'
import { CardMetadata } from './CardMetadata'
import type { RelationshipKind, selectHierarchy } from './selectors'

export interface CardTreeProps {
  card: Card
  data: Snapshot
  tree: ReturnType<typeof selectHierarchy>
  expanded: ReadonlySet<string>
  blocked: boolean
  onToggle(id: string): void
  onOpen(card: Card): void
  onRelationship(kind: RelationshipKind, card: Card): void
}

const actions: [RelationshipKind, string][] = [
  ['create', 'Create child'], ['link', 'Link existing card'],
  ['parent', 'Change parent'], ['unlink', 'Unlink from parent'],
]

export function CardTree(props: CardTreeProps) {
  const { card, data, tree, expanded, blocked, onToggle, onOpen, onRelationship } = props
  const menu = useRef<HTMLDetailsElement>(null)
  const children = tree.children.get(card.id) ?? []
  const visibleChildren = children.filter(child => tree.visible.has(child.id))
  const isExpanded = tree.filtered || expanded.has(card.id)
  const progress = children.length ? rollup(card.id, data) : undefined
  return <li className="tree-item">
    <article className={`card${tree.filtered && !tree.matches.has(card.id) ? ' ancestor-card' : ''}`}>
      <div className="card-title-row">
        <button type="button" className="tree-toggle" disabled={!children.length || tree.filtered}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${card.name}`}
          aria-expanded={children.length ? isExpanded : undefined} onClick={() => onToggle(card.id)}>
          {children.length ? (isExpanded ? '▾' : '▸') : '·'}
        </button>
        <button type="button" className="card-title" onClick={() => onOpen(card)}>{card.name || 'Untitled card'}</button>
        <details ref={menu} className="card-menu" onKeyDown={event => {
          if (event.key === 'Escape' && menu.current?.open) {
            menu.current.open = false
            menu.current.querySelector('summary')?.focus()
            event.preventDefault()
            event.stopPropagation()
          }
        }}>
          <summary aria-label={`Actions for ${card.name}`} data-focus={`actions-${card.id}`}>•••</summary>
          <div className="card-menu-body">
            {actions.map(([kind, name]) => <button key={kind} type="button" aria-haspopup="dialog"
              disabled={blocked || !data.canWrite} title={!data.canWrite ? 'Board write access is required.' : ''}
              onClick={() => {
                if (menu.current) menu.current.open = false
                onRelationship(kind, card)
              }}>{name}</button>)}
          </div>
        </details>
      </div>
      <CardMetadata card={card} data={data} />
      {progress && <div className="rollup">
        <progress max={progress.total} value={progress.done} aria-label={`${progress.done} of ${progress.total} descendants complete`} />
        <span>{progress.done}/{progress.total} descendants complete · {progress.progress}%{progress.overdue ? ` · ${progress.overdue} overdue` : ''}</span>
      </div>}
    </article>
    {isExpanded && !!visibleChildren.length && <ul className="children">
      {visibleChildren.map(child => <CardTree key={child.id} {...props} card={child} />)}
    </ul>}
  </li>
}
