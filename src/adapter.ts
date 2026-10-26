import type { Adapter, Card, Parents, Preferences, Rules, Snapshot } from './model'
import { assertLink, assertWrite, safeParents, storageSize } from './model.ts'

// Live views load the SDK from Trello's official CDN.
export type Trello = any
declare global { interface Window { TrelloPowerUp?: any } }
export const configured = Boolean(import.meta.env?.VITE_TRELLO_API_KEY)
const relationKey = 'parent-v1'
const ruleKey = 'list-rules-v1'
const preferenceKey = 'expanded-v1'
export function liveAdapter(t: Trello): Adapter {
  const api = t.getRestApi()
  async function request(path: string, method = 'GET', body?: Record<string, string>) {
    const token = await api.getToken()
    if (!token) throw new Error('Authorize Trello access to load this private board.')
    const url = new URL(`https://api.trello.com/1/${path}`)
    const response = await fetch(url, {
      method,
      headers: { Authorization: `OAuth oauth_consumer_key="${import.meta.env?.VITE_TRELLO_API_KEY}", oauth_token="${token}"`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? new URLSearchParams(body) : undefined,
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error(`Trello request failed (${response.status}). ${response.status === 429 ? 'Rate limited; wait before refreshing.' : 'Check authorization and board access.'}`)
    return response.json()
  }
  async function load(strict = false): Promise<Snapshot> {
    const boardId = t.getContext().board
    const [cards, lists, members, board, me, canWrite, rules] = await Promise.all([
      request(`boards/${boardId}/cards?filter=all&fields=id,name,idList,idBoard,url,closed,due,dueComplete,labels,idMembers`),
      request(`boards/${boardId}/lists?filter=all`),
      request(`boards/${boardId}/members?fields=fullName`),
      request(`boards/${boardId}?fields=id&memberships=all`),
      t.member('id'), t.memberCanWriteToModel('board'),
      t.get('board', 'shared', ruleKey, {}),
    ])
    const raw: Parents = {}
    const unavailable: string[] = []
    // Bound concurrent SDK requests on large boards.
    for (let start = 0; start < cards.length; start += 20) {
      await Promise.all(cards.slice(start, start + 20).map(async (card: Card) => {
        try {
          const parent = await t.get(card.id, 'shared', relationKey)
          if (typeof parent === 'string' && parent) raw[card.id] = parent
        } catch {
          if (strict) throw new Error('Some relationship metadata is unavailable. Refresh before editing.')
          unavailable.push(`Relationship unavailable for ${card.name} (${card.id}); shown without a parent until refresh.`)
        }
      }))
    }
    const safe = safeParents(cards, raw)
    return { boardId, cards, lists, members, ...safe, issues: [...safe.issues, ...unavailable], rules: validRules(rules),
      canWrite: Boolean(canWrite),
      isAdmin: board.memberships?.some((m: any) => m.idMember === me.id && m.memberType === 'admin') ?? false }
  }
  async function link(child: string, parent: string | null) {
    const data = await load(true)
    assertWrite(data)
    if (!data.cards.some(c => c.id === child)) throw new Error('Card is no longer on this board.')
    if (parent) {
      assertLink(data.cards, data.parents, child, parent)
      await t.set(child, 'shared', relationKey, parent)
    } else await t.remove(child, 'shared', relationKey)
    const current = await load(true)
    if (parent && current.parents[child] !== parent)
      throw new Error('A concurrent edit or invalid relationship was detected. Refresh and change/unlink the parent to repair.')
  }
  return {
    load, link,
    async create(parent, name, list) {
      const data = await load(true)
      assertWrite(data)
      if (!name.trim()) throw new Error('Enter a card title.')
      const p = data.cards.find(c => c.id === parent && !c.closed)
      if (!p || !data.lists.some(l => l.id === list && !l.closed)) throw new Error('Choose an active parent and list.')
      const card = await request('cards', 'POST', { name: name.trim(), idList: list })
      try { await link(card.id, parent) }
      catch { throw new Error(`Card created (${card.url}) but linking failed. Refresh and use Link existing card; the new card was preserved.`) }
    },
    async saveRules(rules) {
      const data = await load()
      assertWrite(data)
      if (!data.isAdmin) throw new Error('Only board administrators can change status rules.')
      storageSize(rules)
      await t.set('board', 'shared', ruleKey, rules)
    },
    async preferences() { return { expanded: await t.get('board', 'private', preferenceKey, []) } },
    async savePreferences(prefs) { storageSize(prefs.expanded); await t.set('board', 'private', preferenceKey, prefs.expanded) },
    async open(card) { await t.showCard(card.id) },
    async authorize() { await api.authorize({ scope: 'read,write', expiration: 'never' }) },
    async disconnect() { await api.clearToken() },
  }
}
function validRules(raw: unknown): Rules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter(([, value]) =>
    value && typeof value.status === 'string' && typeof value.complete === 'boolean'))
}
export function demoAdapter(): Adapter {
  const boardId = 'demo'
  const lists = [{ id: 'todo', name: 'To do', closed: false }, { id: 'doing', name: 'In progress', closed: false }, { id: 'done', name: 'Done', closed: false }]
  const make = (id: string, name: string, idList: string, extra = {}): Card => ({
    id, name, idList, idBoard: boardId, url: 'https://trello.com', closed: false, due: null,
    dueComplete: false, labels: [], idMembers: ['alex'], ...extra,
  })
  let cards = [
    make('launch', 'Launch customer help center', 'doing', { labels: [{ id: 'customer', name: 'Customer experience', color: 'blue' }] }),
    make('articles', 'Write onboarding articles', 'doing', { due: new Date(Date.now() - 86400000).toISOString() }),
    make('review', 'Review accessibility', 'todo'),
    make('design', 'Approve navigation design', 'done', { dueComplete: true }),
    make('translations', 'Translate welcome article', 'todo'),
    make('security', 'Quarterly access review', 'todo', { labels: [{ id: 'ops', name: 'Operations', color: 'green' }] }),
  ]
  let parents: Parents = { articles: 'launch', review: 'launch', design: 'launch', translations: 'articles' }
  let rules: Rules = { done: { status: 'Complete', complete: true } }
  let prefs: Preferences = { expanded: ['launch', 'articles'] }
  return {
    async load() { return { boardId, cards, lists, members: [{ id: 'alex', fullName: 'Alex (demo)' }], parents, rules, canWrite: true, isAdmin: true, issues: [] } },
    async link(child, parent) { if (parent) { assertLink(cards, parents, child, parent); parents = { ...parents, [child]: parent } } else { parents = { ...parents }; delete parents[child] } },
    async create(parent, name, list) { const id = crypto.randomUUID(); cards = [...cards, make(id, name, list)]; parents = { ...parents, [id]: parent } },
    async saveRules(value) { rules = value },
    async preferences() { return prefs },
    async savePreferences(value) { storageSize(value.expanded); prefs = value },
    async open(card) { window.alert(`Demo card: ${card.name}. Live mode opens the real Trello card.`) },
    async authorize() {},
    async disconnect() {},
  }
}
