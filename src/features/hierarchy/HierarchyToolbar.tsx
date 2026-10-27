import { useRef } from 'react'
import type { Snapshot } from '../../model'
import { Field } from '../../components/ui/Field'
import { filterOptions, hasFilters } from './selectors'
import type { Filters } from './selectors'

interface ToolbarProps {
  data: Snapshot
  filters: Filters
  blocked: boolean
  onChange(filters: Filters): void
  onExpand(): void
  onCollapse(): void
  onRules(): void
}

export function HierarchyToolbar({ data, filters, blocked, onChange, onExpand, onCollapse, onRules }: ToolbarProps) {
  const search = useRef<HTMLInputElement>(null)
  const options = filterOptions(data)
  const filtered = hasFilters(filters)
  return <>
    <section className="toolbar" aria-label="Hierarchy filters">
      <Field title="Search"><input ref={search} type="search" autoComplete="off"
        placeholder="Search cards, labels, people…" value={filters.query}
        onChange={event => onChange({ ...filters, query: event.target.value })} /></Field>
      <Field title="Status"><select value={filters.status} onChange={event => onChange({ ...filters, status: event.target.value })}>
        <option value="">All statuses</option>
        {options.statuses.map(status => <option key={status}>{status}</option>)}
      </select></Field>
      <Field title="Label"><select value={filters.label} onChange={event => onChange({ ...filters, label: event.target.value })}>
        <option value="">All labels</option>
        {options.labels.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></Field>
    </section>
    <div className="view-actions">
      <button type="button" className="quiet" disabled={filtered} onClick={onExpand}>Expand all</button>
      <button type="button" className="quiet" disabled={filtered} onClick={onCollapse}>Collapse all</button>
      {filtered && <button type="button" className="quiet" onClick={() => {
        onChange({ query: '', status: '', label: '' }); search.current?.focus()
      }}>Clear filters</button>}
      {data.isAdmin && <button type="button" className="quiet" aria-haspopup="dialog"
        disabled={blocked || !data.canWrite} onClick={onRules}>Status rules</button>}
    </div>
  </>
}
