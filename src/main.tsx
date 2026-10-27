import './style.css'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AuthorizationView } from './features/authorization/AuthorizationView'
import { configured, demoAdapter, liveAdapter } from './adapter'
import { initializeConnector, loadSdk, restOptions } from './integrations/trello'
import { errorMessage } from './utils/errors'

const container = document.getElementById('app')
if (!container) throw new Error('The application container #app is missing.')
const root = createRoot(container)

function showError(error: unknown) {
  root.render(<p role="alert">{errorMessage(error)}</p>)
}

async function start() {
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  if (params.get('demo') === '1' || !view) {
    root.render(<App adapter={demoAdapter()} demo />)
    return
  }
  await loadSdk()
  if (view === 'connector') {
    initializeConnector()
    root.render(<p>Trello Hierarchy connector. Open ?demo=1 to preview without Trello.</p>)
    return
  }
  if (!configured) throw new Error('Missing public Trello API key. Configure VITE_TRELLO_API_KEY and redeploy.')
  if (!window.TrelloPowerUp) throw new Error('Trello SDK unavailable.')
  const t = window.TrelloPowerUp.iframe(restOptions)
  const adapter = liveAdapter(t)
  if (view === 'authorize') {
    root.render(<AuthorizationView adapter={adapter} onAuthorized={() => t.closePopup()} />)
    return
  }
  const cardId = view === 'card' ? t.getContext().card : params.get('card') || undefined
  root.render(<App adapter={adapter} demo={false} cardId={cardId} />)
  t.render(() => { window.dispatchEvent(new Event('hierarchy-refresh')) })
  if (view === 'card') {
    const observer = new ResizeObserver(() => {
      void t.sizeTo('#app').catch((error: unknown) => {
        window.dispatchEvent(new CustomEvent('hierarchy-error', { detail: error }))
      })
    })
    observer.observe(container!)
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
  }
}

start().catch(showError)
