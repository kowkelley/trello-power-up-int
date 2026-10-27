import type { Adapter, Snapshot } from '../../model.ts'
import { safeParents } from '../../model.ts'
import { errorMessage } from '../../utils/errors.ts'

export interface HierarchyState {
  data?: Snapshot
  expanded: ReadonlySet<string>
  loading: boolean
  pending: boolean
  error: string
  warning: string
  notice: string
}

export function createHierarchyStore(adapter: Adapter) {
  let state: HierarchyState = {
    expanded: new Set(), loading: false, pending: false, error: '', warning: '', notice: '',
  }
  const listeners = new Set<() => void>()
  let alive = true
  let loadPromise: Promise<boolean> | undefined
  let preferencesTouched = false
  let preferencesSaving = false
  let preferencesQueued = false
  let refreshQueued = false
  let disconnected = false
  let lastLoaded = 0

  function update(patch: Partial<HierarchyState>) {
    if (!alive) return
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }

  function showError(error: unknown) { update({ error: errorMessage(error) }) }

  async function refresh(): Promise<boolean> {
    if (!alive) return false
    if (loadPromise) return loadPromise
    update({ loading: true })
    loadPromise = (async () => {
      try {
        const loaded = await adapter.load()
        if (!alive) return false
        const safe = safeParents(loaded.cards, loaded.parents)
        lastLoaded = Date.now()
        update({ data: { ...loaded, parents: safe.parents, issues: [...new Set([...loaded.issues, ...safe.issues])] } })
        return true
      } catch (error) {
        showError(error)
        return false
      } finally {
        loadPromise = undefined
        update({ loading: false })
      }
    })()
    return loadPromise
  }

  async function loadPreferences() {
    try {
      const prefs = await adapter.preferences()
      if (!preferencesTouched) {
        update({ expanded: new Set(Array.isArray(prefs.expanded)
          ? prefs.expanded.filter((id): id is string => typeof id === 'string') : []) })
      }
    } catch (error) {
      update({ warning: `Expansion preferences could not be loaded: ${errorMessage(error)}. You can still use this view.` })
    }
  }

  async function saveExpansion() {
    preferencesQueued = true
    if (preferencesSaving) return
    preferencesSaving = true
    try {
      while (preferencesQueued && alive) {
        preferencesQueued = false
        try {
          await adapter.savePreferences({ expanded: [...state.expanded] })
          if (state.warning.startsWith('Expansion')) update({ warning: '' })
        } catch (error) {
          update({ warning: `Expansion could not be saved: ${errorMessage(error)}` })
        }
      }
    } finally { preferencesSaving = false }
  }

  function setExpanded(expanded: Set<string>) {
    preferencesTouched = true
    update({ expanded })
    void saveExpansion()
  }

  async function run(action: () => Promise<void>, reload = true, success = ''): Promise<boolean> {
    if (state.pending || state.loading || !alive) return false
    update({ pending: true, error: '', notice: '' })
    try {
      await action()
      if (!alive) return false
      update({ notice: success })
      if (reload && !await refresh()) {
        update({ error: `The action completed, but refreshing failed. ${state.error} Refresh before making another change.` })
      }
      return true
    } catch (error) {
      showError(error)
      return false
    } finally {
      update({ pending: false })
      if (refreshQueued && alive) {
        refreshQueued = false
        if (!disconnected) void refresh()
      }
    }
  }

  function requestRefresh() {
    if (disconnected) return
    if (state.pending) { refreshQueued = true; return }
    void refresh()
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() { alive = true; return Promise.all([refresh(), loadPreferences()]) },
    dispose() { alive = false },
    refresh, run, showError, requestRefresh, setExpanded,
    dismissError() { update({ error: '' }) },
    toggle(id: string) {
      const expanded = new Set(state.expanded)
      if (expanded.has(id)) expanded.delete(id)
      else expanded.add(id)
      setExpanded(expanded)
    },
    reveal(id: string) { setExpanded(new Set([...state.expanded, id])) },
    poll() {
      if (!disconnected && !state.pending && !state.loading && Date.now() - lastLoaded >= 60_000) requestRefresh()
    },
    authorize() {
      return run(async () => { await adapter.authorize(); disconnected = false })
    },
    disconnect() {
      return run(async () => {
        await adapter.disconnect()
        disconnected = true
        lastLoaded = 0
        update({ data: undefined })
      }, false, 'Disconnected. Authorize Trello to reconnect.')
    },
  }
}

export type HierarchyStore = ReturnType<typeof createHierarchyStore>
