import { useState } from 'react'
import type { Adapter, Card } from '../model'
import { AppLayout } from '../layouts/AppLayout'
import { useHierarchy } from '../features/hierarchy/useHierarchy'
import { Notifications } from '../features/hierarchy/Notifications'
import { HierarchyToolbar } from '../features/hierarchy/HierarchyToolbar'
import { HierarchyView } from '../features/hierarchy/HierarchyView'
import { emptyFilters, filterOptions } from '../features/hierarchy/selectors'
import type { RelationshipKind } from '../features/hierarchy/selectors'
import { RelationshipDialog } from '../features/relationships/RelationshipDialog'
import { RulesDialog } from '../features/settings/RulesDialog'

type Editor = { kind: 'rules' } | { kind: RelationshipKind; card: Card }

export function App({ adapter, demo, cardId }: { adapter: Adapter; demo: boolean; cardId?: string }) {
  const [editor, setEditor] = useState<Editor>()
  const [filters, setFilters] = useState(emptyFilters)
  const { state, store } = useHierarchy(adapter, demo, Boolean(editor))
  const { data, loading, pending } = state
  const blocked = pending || loading
  // Drop options removed by a refreshed board without resetting the search.
  const options = data && filterOptions(data)
  const activeFilters = {
    ...filters,
    status: options?.statuses.includes(filters.status) ? filters.status : '',
    label: options?.labels.some(([id]) => id === filters.label) ? filters.label : '',
  }
  const closeEditor = () => setEditor(undefined)

  return <AppLayout demo={demo} focused={Boolean(cardId)} actions={<>
    <button type="button" disabled={blocked} onClick={() => { store.dismissError(); void store.refresh() }}>
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
    {!demo && <>
      <button type="button" disabled={blocked} onClick={() => { void store.authorize() }}>Authorize Trello</button>
      <button type="button" className="quiet" disabled={blocked} onClick={() => { void store.disconnect() }}>Disconnect</button>
    </>}
  </>}>
    <Notifications state={state} onDismiss={store.dismissError} />
    {data && <HierarchyToolbar data={data} filters={activeFilters} blocked={blocked} onChange={setFilters}
      onExpand={() => {
        const activeIds = new Set(data.cards.filter(card => !card.closed).map(card => card.id))
        store.setExpanded(new Set(Object.values(data.parents).filter(id => activeIds.has(id))))
      }} onCollapse={() => store.setExpanded(new Set())} onRules={() => setEditor({ kind: 'rules' })} />}
    <HierarchyView data={data} loading={loading} cardId={cardId} filters={activeFilters}
      expanded={state.expanded} blocked={blocked} onToggle={store.toggle}
      onOpen={card => { void Promise.resolve().then(() => adapter.open(card)).catch(store.showError) }}
      onRelationship={(kind, card) => { if (!blocked && data?.canWrite) setEditor({ kind, card }) }} />
    {editor && data && (editor.kind === 'rules'
      ? <RulesDialog data={data} adapter={adapter} store={store} pending={pending} loading={loading} onClose={closeEditor} />
      : <RelationshipDialog kind={editor.kind} card={editor.card} data={data} adapter={adapter}
        store={store} pending={pending} loading={loading} onClose={closeEditor} />)}
  </AppLayout>
}
