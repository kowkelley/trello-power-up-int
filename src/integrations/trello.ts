import type { Trello } from '../adapter'

const base = new URL('./', location.href)
function url(view: string, extras: Record<string, string> = {}) {
  const target = new URL('index.html', base)
  target.search = new URLSearchParams({ view, ...extras }).toString()
  return target.href
}
const appName = 'Internal Hierarchy'
export const restOptions = { appKey: import.meta.env.VITE_TRELLO_API_KEY, appName }
let badgeCache: { board: string; expires: number; counts: Promise<Map<string, number>> } | undefined
function childCounts(t: Trello): Promise<Map<string, number>> {
  const board = t.getContext().board
  if (badgeCache && badgeCache.board === board && badgeCache.expires > Date.now()) return badgeCache.counts
  const counts = (async () => {
    const cards = await t.cards('id')
    const result = new Map<string, number>()
    for (let start = 0; start < cards.length; start += 20) {
      await Promise.all(cards.slice(start, start + 20).map(async (card: { id: string }) => {
        const parent = await t.get(card.id, 'shared', 'parent-v1')
        if (typeof parent === 'string' && parent)
          result.set(parent, (result.get(parent) || 0) + 1)
      }))
    }
    return result
  })()
  badgeCache = { board, expires: Date.now() + 15_000, counts }
  counts.catch(() => { badgeCache = undefined })
  return counts
}
function modal(t: Trello, cardId?: string) {
  return t.modal({ title: cardId ? 'Card hierarchy' : 'Hierarchy',
    url: url(cardId ? 'card-modal' : 'board', cardId ? { card: cardId } : {}),
    fullscreen: true })
}
export function initializeConnector() {
  const sdk = window.TrelloPowerUp
  if (!sdk) throw new Error('The official Trello SDK could not load. Check network access.')
  sdk.initialize({
    'board-buttons': () => [{ icon: { dark: new URL('hierarchy.svg', base).href, light: new URL('hierarchy.svg', base).href },
      text: 'Hierarchy', condition: 'always', callback: (t: Trello) => modal(t) }],
    'card-buttons': () => [{ icon: new URL('hierarchy.svg', base).href, text: 'Hierarchy · create/link/unlink',
      callback: (t: Trello) => modal(t, t.getContext().card) }],
    'card-back-section': (t: Trello) => ({
      title: 'Child hierarchy', icon: new URL('hierarchy.svg', base).href,
      content: { type: 'iframe', url: t.signUrl(url('card')), height: 450 },
    }),
    'card-badges': (t: Trello) => [{
      dynamic: async () => {
        const children = (await childCounts(t)).get(t.getContext().card) || 0
        const parent = await t.get('card', 'shared', 'parent-v1')
        const text = [children ? `${children} direct children` : '', parent ? 'Child card' : ''].filter(Boolean).join(' · ')
        return { text, color: children ? 'blue' : 'light-gray', refresh: 60 }
      },
    }],
    'authorization-status': async (t: Trello) => ({ authorized: await t.getRestApi().isAuthorized() }),
    'show-authorization': (t: Trello) => t.popup({ title: 'Authorize Hierarchy', url: url('authorize'), height: 260 }),
    'show-settings': (t: Trello) => modal(t),
  }, restOptions)
}
export async function loadSdk() {
  if (window.TrelloPowerUp) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://p.trellocdn.com/power-up.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load the official Trello SDK. Check network access.'))
    document.head.append(script)
  })
}
