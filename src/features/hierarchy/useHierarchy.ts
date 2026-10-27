import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Adapter } from '../../model'
import { createHierarchyStore } from './store'

export function useHierarchy(adapter: Adapter, demo: boolean, editing: boolean) {
  const [store] = useState(() => createHierarchyStore(adapter))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const editingRef = useRef(editing)
  editingRef.current = editing

  useEffect(() => {
    void store.start()
    const refresh = () => store.requestRefresh()
    const reportError = (event: Event) => {
      if (event instanceof CustomEvent) store.showError(event.detail)
    }
    const poll = () => {
      if (!demo && !editingRef.current && document.visibilityState === 'visible'
        && document.querySelector('#app')?.getClientRects().length) store.poll()
    }
    const cleanup = () => {
      store.dispose()
      window.clearInterval(interval)
      window.removeEventListener('hierarchy-refresh', refresh)
      window.removeEventListener('hierarchy-error', reportError)
      document.removeEventListener('visibilitychange', poll)
      window.removeEventListener('pagehide', cleanup)
    }
    const interval = window.setInterval(poll, 60_000)
    window.addEventListener('hierarchy-refresh', refresh)
    window.addEventListener('hierarchy-error', reportError)
    document.addEventListener('visibilitychange', poll)
    window.addEventListener('pagehide', cleanup)
    return cleanup
  }, [store, demo])

  return { state, store }
}
