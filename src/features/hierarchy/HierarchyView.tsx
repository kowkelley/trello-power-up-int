import { EmptyState } from '../../components/ui/EmptyState'
import { CardTree } from './CardTree'
import type { CardTreeProps } from './CardTree'
import { selectHierarchy } from './selectors'
import type { Filters } from './selectors'
import type { Snapshot } from '../../model'

interface ViewProps extends Omit<CardTreeProps, 'card' | 'tree' | 'data'> {
  data?: Snapshot
  loading: boolean
  cardId?: string
  filters: Filters
}

export function HierarchyView({ data, loading, cardId, filters, ...actions }: ViewProps) {
  if (!data) return <section className="tree-content" aria-label="Cards" aria-busy={loading}>
    <EmptyState title={loading ? 'Loading your hierarchy…' : 'No board loaded'}>
      <p>{loading ? 'Fetching cards and relationships.' : 'Refresh to try again, or authorize Trello access in live mode.'}</p>
    </EmptyState>
  </section>

  const tree = selectHierarchy(data, filters, cardId)
  if (cardId && !tree.focus) return <section className="tree-content" aria-label="Cards" aria-busy={loading}>
    <EmptyState>This card is archived, unavailable, or no longer on this board. Refresh to check again.</EmptyState>
  </section>
  const parent = tree.focus && tree.cards.get(data.parents[tree.focus.id])
  const activeLists = data.lists.filter(list => !list.closed)
  const excluded = tree.active.filter(card => !tree.cards.has(data.parents[card.id])
    && !activeLists.some(list => list.id === card.idList)).length
  const renderCard = (card: Snapshot['cards'][number]) =>
    <CardTree key={card.id} {...actions} card={card} data={data} tree={tree} />

  return <>
    <p className="view-summary" role="status">{tree.filtered
      ? `${tree.matches.size} matching card${tree.matches.size === 1 ? '' : 's'} · Ancestors and matching descendants are revealed, even in collapsed branches. Clear filters to restore your expansion.`
      : `${tree.scope.size} active card${tree.scope.size === 1 ? '' : 's'} · Children stay under their parent, with their actual list shown.`}</p>
    <section className="tree-content" aria-label="Cards" aria-busy={loading}>
      {tree.focus ? <>
        <div className="focus-context">{parent
          ? <>Parent: <button type="button" className="text-button" onClick={() => actions.onOpen(parent)}>{parent.name}</button></>
          : 'Top-level card · No parent'}</div>
        {tree.visible.has(tree.focus.id) && <ul className="root-tree focused-tree">{renderCard(tree.focus)}</ul>}
      </> : <>
        <div className="board-columns">{activeLists.map(list => {
          const roots = tree.active.filter(card => card.idList === list.id && !tree.cards.has(data.parents[card.id]))
          const shown = roots.filter(card => tree.visible.has(card.id))
          return <section key={list.id} className="board-column">
            <div className="column-header">
              <h2>{list.name}</h2><span className="column-count">{shown.length}{tree.filtered ? `/${roots.length}` : ''} roots</span>
            </div>
            <ul className="root-tree">{shown.map(renderCard)}</ul>
            {!shown.length && <p className="column-empty">{tree.filtered ? 'No matching branches' : 'No top-level cards'}</p>}
          </section>
        })}</div>
        {!!excluded && <p className="muted">{excluded} top-level card(s) in archived or unavailable lists are outside this active-list view.</p>}
        {!activeLists.length && <EmptyState>This board has no active lists.</EmptyState>}
      </>}
      {!tree.matches.size && tree.filtered && <EmptyState>No cards match these filters. Try a different search or clear filters.</EmptyState>}
      {!tree.active.length && <EmptyState>No active cards yet. Create a card in Trello, then refresh to start linking related work.</EmptyState>}
    </section>
  </>
}
