import './style.css'
import { configured, demoAdapter, liveAdapter } from './adapter'
import type { Trello } from './adapter'
import { mount } from './ui'

const params = new URLSearchParams(location.search)
const view = params.get('view')
const base = new URL('./', location.href)
function url(view: string, extras: Record<string, string> = {}) {
  const target = new URL('index.html', base)
  target.search = new URLSearchParams({ view, ...extras }).toString()
  return target.href
}
const appName = 'Internal Hierarchy'
const restOptions = { appKey: import.meta.env.VITE_TRELLO_API_KEY, appName }
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
function connector() {
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
  document.querySelector('#app')!.textContent = 'Trello Hierarchy connector. Open ?demo=1 to preview without Trello.'
}
async function loadSdk() {
  if (window.TrelloPowerUp) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://p.trellocdn.com/power-up.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load the official Trello SDK. Check network access.'))
    document.head.append(script)
  })
}
async function start() {
  if (params.get('demo') === '1' || !view) {
    await mount(demoAdapter(), { demo: true })
    return
  }
  await loadSdk()
  if (view === 'connector') { connector(); return }
  if (!configured) throw new Error('Missing public Trello API key. Configure VITE_TRELLO_API_KEY and redeploy.')
  if (!window.TrelloPowerUp) throw new Error('Trello SDK unavailable.')
  const t = window.TrelloPowerUp.iframe(restOptions)
  const adapter = liveAdapter(t)
  if (view === 'authorize') {
    const button = document.createElement('button')
    button.textContent = 'Authorize Trello read/write access'
    button.onclick = () => { adapter.authorize().then(() => t.closePopup()).catch(showError) }
    document.querySelector('#app')!.append(button)
    return
  }
  const cardId = view === 'card' ? t.getContext().card : params.get('card') || undefined
  await mount(adapter, { demo: false, cardId })
  t.render(() => {
    window.dispatchEvent(new Event('hierarchy-refresh'))
    if (view === 'card') return t.sizeTo('#app').catch(() => {})
  })
}
function showError(error: unknown) {
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.textContent = error instanceof Error ? error.message : 'Unable to load Hierarchy.'
  document.querySelector('#app')!.append(message)
}
start().catch(showError)
