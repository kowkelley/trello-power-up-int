import { useState } from 'react'
import type { Adapter, Rules, Snapshot } from '../../model'
import { Dialog } from '../../components/ui/Dialog'
import { Field } from '../../components/ui/Field'
import type { HierarchyStore } from '../hierarchy/store'

export function RulesDialog({ data, adapter, store, pending, loading, onClose }: {
  data: Snapshot; adapter: Adapter; store: HierarchyStore; pending: boolean; loading: boolean; onClose(): void
}) {
  const lists = data.lists.filter(list => !list.closed)
  const [rules, setRules] = useState<Rules>(() => Object.fromEntries(lists.map(list =>
    [list.id, data.rules[list.id] ?? { status: list.name, complete: false }])))
  const [error, setError] = useState('')
  return <Dialog title="List status rules"
    description="Map each active list to a status and mark lists whose cards count as complete. Trello’s checked due dates also count as complete. Board administrators only."
    submitText="Save rules" pending={pending} disabled={loading || !data.canWrite || !data.isAdmin || !lists.length}
    error={error} onClose={onClose} onSubmit={async event => {
      event.preventDefault()
      if (pending || loading || !data.canWrite || !data.isAdmin) return
      const updated = { ...data.rules }
      for (const [id, rule] of Object.entries(rules)) updated[id] = { ...rule, status: rule.status.trim() }
      setError('')
      if (await store.run(() => adapter.saveRules(updated), true, 'Status rules saved.')) onClose()
      else setError(store.getSnapshot().error)
    }}>
    {lists.map(list => <fieldset key={list.id} className="rule-row">
      <legend>{list.name}</legend>
      <Field title="Display status"><input type="text" maxLength={100} placeholder={list.name}
        value={rules[list.id].status} onChange={event => setRules({
          ...rules, [list.id]: { ...rules[list.id], status: event.target.value },
        })} /></Field>
      <Field title="Counts as complete"><input type="checkbox" checked={rules[list.id].complete}
        onChange={event => setRules({ ...rules, [list.id]: { ...rules[list.id], complete: event.target.checked } })} /></Field>
    </fieldset>)}
    {!lists.length && <p className="muted">There are no active lists to configure.</p>}
  </Dialog>
}
