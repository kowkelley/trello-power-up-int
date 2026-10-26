export interface Card {
  id: string
  name: string
  idList: string
  idBoard: string
  url: string
  closed: boolean
  due: string | null
  dueComplete: boolean
  labels: { id: string; name: string; color: string | null }[]
  idMembers: string[]
}
export interface List { id: string; name: string; closed: boolean }
export interface Member { id: string; fullName: string }
export interface Rule { status: string; complete: boolean }
export type Rules = Record<string, Rule>
export type Parents = Record<string, string>
export interface Snapshot {
  boardId: string
  cards: Card[]
  lists: List[]
  members: Member[]
  parents: Parents
  rules: Rules
  canWrite: boolean
  isAdmin: boolean
  issues: string[]
}
export interface Preferences { expanded: string[] }
export interface Adapter {
  load(): Promise<Snapshot>
  link(child: string, parent: string | null): Promise<void>
  create(parent: string, name: string, list: string): Promise<void>
  saveRules(rules: Rules): Promise<void>
  preferences(): Promise<Preferences>
  savePreferences(prefs: Preferences): Promise<void>
  open(card: Card): Promise<void>
  authorize(): Promise<void>
  disconnect(): Promise<void>
}

export function assertLink(cards: Card[], parents: Parents, child: string, parent: string) {
  const c = cards.find(c => c.id === child)
  const p = cards.find(c => c.id === parent)
  if (!c || !p || c.closed || p.closed || c.idBoard !== p.idBoard)
    throw new Error('Both cards must be active and on this board.')
  const seen = new Set([child])
  let cursor: string | undefined = parent
  while (cursor) {
    if (seen.has(cursor)) throw new Error('This relationship would create a cycle.')
    seen.add(cursor)
    cursor = parents[cursor]
  }
}

// Invalid edges remain in storage for explicit repair; views use only safe edges.
export function safeParents(cards: Card[], raw: Parents) {
  const parents: Parents = {}
  const issues: string[] = []
  for (const [child, parent] of Object.entries(raw).sort()) {
    try { assertLink(cards, parents, child, parent); parents[child] = parent }
    catch { issues.push(`Ignored invalid relationship for ${cards.find(c => c.id === child)?.name ?? child} (${child}). Unlink or change its parent to repair.`) }
  }
  return { parents, issues }
}
export function descendants(id: string, parents: Parents): string[] {
  const result: string[] = []
  const seen = new Set([id])
  const visit = (parent: string) => {
    for (const [child, p] of Object.entries(parents)) {
      if (p === parent && !seen.has(child)) { seen.add(child); result.push(child); visit(child) }
    }
  }
  visit(id)
  return result
}
export function status(card: Card, data: Snapshot) {
  return data.rules[card.idList]?.status || data.lists.find(l => l.id === card.idList)?.name || 'Unavailable list'
}
export function complete(card: Card, rules: Rules) {
  return card.dueComplete || rules[card.idList]?.complete === true
}
export function rollup(id: string, data: Snapshot, now = Date.now()) {
  const ids = new Set(descendants(id, data.parents))
  const children = data.cards.filter(c => ids.has(c.id) && !c.closed)
  const done = children.filter(c => complete(c, data.rules)).length
  return { total: children.length, done, progress: children.length ? Math.round(done / children.length * 100) : 0,
    overdue: children.filter(c => !complete(c, data.rules) && c.due && Date.parse(c.due) < now).length }
}
export function assertWrite(data: Pick<Snapshot, 'canWrite'>) {
  if (!data.canWrite) throw new Error('Read-only: board membership with write permission is required.')
}
export function storageSize(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 3500)
    throw new Error('Power-Up storage budget reached. Reduce the number or length of saved settings.')
}
