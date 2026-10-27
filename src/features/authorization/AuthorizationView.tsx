import { useState } from 'react'
import type { Adapter } from '../../model'
import { errorMessage } from '../../utils/errors'

export function AuthorizationView({ adapter, onAuthorized }: { adapter: Adapter; onAuthorized(): Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <main className="hierarchy-app">
    <button type="button" disabled={pending} onClick={async () => {
      setPending(true)
      setError('')
      try { await adapter.authorize(); await onAuthorized() }
      catch (error) { setError(errorMessage(error)) }
      finally { setPending(false) }
    }}>Authorize Trello read/write access</button>
    {error && <p role="alert">{error}</p>}
  </main>
}
