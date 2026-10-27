import { useState } from 'react'
import type { Adapter, Card, Snapshot } from '../../model'
import { Dialog } from '../../components/ui/Dialog'
import { Field } from '../../components/ui/Field'
import { relationshipCandidates } from '../hierarchy/selectors'
import type { RelationshipKind } from '../hierarchy/selectors'
import type { HierarchyStore } from '../hierarchy/store'

interface RelationshipProps {
  kind: RelationshipKind
  card: Card
  data: Snapshot
  adapter: Adapter
  store: HierarchyStore
  pending: boolean
  loading: boolean
  onClose(): void
}

const titles = { create: 'Create a child card', link: 'Link an existing card', parent: 'Change parent', unlink: 'Unlink from parent' }

export function RelationshipDialog({ kind, card, data, adapter, store, pending, loading, onClose }: RelationshipProps) {
  const [name, setName] = useState('')
  const [selection, setSelection] = useState(() => kind === 'create'
    ? data.lists.find(list => list.id === card.idList && !list.closed)?.id ?? ''
    : kind === 'parent' ? data.parents[card.id] ?? '' : '')
  const [error, setError] = useState('')
  const lists = data.lists.filter(list => !list.closed)
  const candidates = relationshipCandidates(data, kind, card)
  const descriptions = {
    create: `Create a new card under “${card.name}”. Choose its actual Trello list.`,
    link: `Choose a card to nest under “${card.name}”. This replaces its previous parent, if any. Its list stays unchanged.`,
    parent: `Choose a parent for “${card.name}”. Its children stay attached and no cards move between lists.`,
    unlink: `Remove the parent relationship for “${card.name}”. The card and all its children are preserved. It becomes top-level in its actual list.`,
  }
  const unavailable = kind === 'create' ? !lists.length : kind !== 'unlink' && !candidates.length

  return <Dialog title={titles[kind]} description={descriptions[kind]}
    submitText={kind === 'create' ? 'Create child' : kind === 'unlink' ? 'Unlink card' : 'Save relationship'}
    pending={pending} disabled={loading || !data.canWrite || unavailable} error={error} onClose={onClose}
    onSubmit={async event => {
      event.preventDefault()
      if (!data.canWrite || pending || loading) return
      if (kind === 'create' && !name.trim()) { setError('Enter a card title.'); return }
      setError('')
      const saved = await store.run(async () => {
        if (kind === 'create') {
          await adapter.create(card.id, name.trim(), selection)
          store.reveal(card.id)
        } else if (kind === 'unlink') await adapter.link(card.id, null)
        else if (kind === 'parent') {
          await adapter.link(card.id, selection)
          store.reveal(selection)
        } else {
          await adapter.link(selection, card.id)
          store.reveal(card.id)
        }
      }, true, kind === 'unlink' ? 'Relationship removed. All cards were preserved.'
        : kind === 'create' ? 'Child card created.' : 'Relationship saved.')
      if (saved) onClose()
      else setError(store.getSnapshot().error)
    }}>
    {kind === 'create' && <Field title="Card title">
      <input type="text" required maxLength={16384} placeholder="What needs to be done?" autoFocus
        value={name} onChange={event => { setName(event.target.value); setError('') }} />
    </Field>}
    {kind !== 'unlink' && <Field title={kind === 'create' ? 'List' : kind === 'parent' ? 'New parent' : 'Child card'}>
      <select required autoFocus={kind !== 'create'} value={selection} onChange={event => setSelection(event.target.value)}>
        <option value="">Choose…</option>
        {kind === 'create' ? lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)
          : candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
            {candidate.name} · {data.lists.find(list => list.id === candidate.idList)?.name ?? 'Unavailable list'}
            {data.parents[candidate.id] ? ' · has a parent' : ''}
          </option>)}
      </select>
    </Field>}
    {unavailable && <p className="muted">{kind === 'create'
      ? 'No active lists are available.' : 'No eligible cards. A card cannot be its own ancestor.'}</p>}
  </Dialog>
}
