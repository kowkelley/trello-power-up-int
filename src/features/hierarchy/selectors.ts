import type { Card, Snapshot } from '../../model.ts'
import { descendants, status } from '../../model.ts'

export interface Filters { query: string; status: string; label: string }
export const emptyFilters: Filters = { query: '', status: '', label: '' }

export function hasFilters(filters: Filters) {
  return Boolean(filters.query.trim() || filters.status || filters.label)
}

export function filterOptions(data: Snapshot) {
  const active = data.cards.filter(card => !card.closed)
  const labels = new Map<string, string>()
  for (const card of active) {
    for (const label of card.labels) labels.set(label.id, label.name || label.color || 'Unnamed label')
  }
  return {
    statuses: [...new Set(active.map(card => status(card, data)))].sort(),
    labels: [...labels].sort((a, b) => a[1].localeCompare(b[1])),
  }
}

export function selectHierarchy(data: Snapshot, filters: Filters, cardId?: string) {
  const active = data.cards.filter(card => !card.closed)
  const cards = new Map(active.map(card => [card.id, card]))
  const children = new Map<string, Card[]>()
  for (const card of active) {
    const parent = data.parents[card.id]
    if (parent && cards.has(parent)) {
      const siblings = children.get(parent) ?? []
      siblings.push(card)
      children.set(parent, siblings)
    }
  }
  const focus = cardId ? cards.get(cardId) : undefined
  const scope = focus ? new Set([focus.id, ...descendants(focus.id, data.parents)]) : new Set(cards.keys())
  const members = new Map(data.members.map(member => [member.id, member.fullName]))
  const query = filters.query.trim().toLocaleLowerCase()
  const matches = new Set(active.filter(card => {
    const text = [card.name, status(card, data), data.lists.find(list => list.id === card.idList)?.name,
      ...card.labels.map(label => label.name || label.color), ...card.idMembers.map(id => members.get(id))]
      .join(' ').toLocaleLowerCase()
    return scope.has(card.id) && (!query || text.includes(query))
      && (!filters.status || status(card, data) === filters.status)
      && (!filters.label || card.labels.some(label => label.id === filters.label))
  }).map(card => card.id))
  const visible = new Set(matches)
  for (const id of matches) {
    let parent = data.parents[id]
    while (parent && scope.has(parent)) {
      visible.add(parent)
      parent = data.parents[parent]
    }
  }
  return { active, cards, children, focus, scope, matches, visible, filtered: hasFilters(filters) }
}

export type RelationshipKind = 'create' | 'link' | 'parent' | 'unlink'

export function relationshipCandidates(data: Snapshot, kind: RelationshipKind, card: Card) {
  const forbidden = new Set([card.id, ...(kind === 'parent' ? descendants(card.id, data.parents) : [])])
  if (kind === 'link') {
    let ancestor: string | undefined = data.parents[card.id]
    while (ancestor) {
      forbidden.add(ancestor)
      ancestor = data.parents[ancestor]
    }
  }
  return data.cards.filter(candidate => !candidate.closed && !forbidden.has(candidate.id)
    && candidate.idBoard === card.idBoard && (kind !== 'link' || data.parents[candidate.id] !== card.id))
}
