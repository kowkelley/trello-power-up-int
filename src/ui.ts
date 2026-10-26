import type { Adapter, Card, Rules, Snapshot } from './model'
import { complete, descendants, rollup, safeParents, status } from './model'

let dispose: (() => void) | undefined

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(text: string, action: () => void, className = '') {
  const node = element('button', className, text)
  node.type = 'button'
  node.addEventListener('click', action)
  return node
}

function field(title: string, control: HTMLElement) {
  const label = element('label', 'field')
  label.append(element('span', 'field-label', title), control)
  return label
}

function option(value: string, text: string) {
  const node = element('option', '', text)
  node.value = value
  return node
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function mount(
  adapter: Adapter, options: { demo: boolean; cardId?: string },
): Promise<void> {
  dispose?.()
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) throw new Error('The application container #app is missing.')
  app.replaceChildren()
  let alive = true
  let data: Snapshot | undefined
  let expanded = new Set<string>()
  let preferencesTouched = false
  let preferencesSaving = false
  let preferencesQueued = false
  let pending = false
  let loading = false
  let loadPromise: Promise<boolean> | undefined
  let refreshQueued = false
  let disconnected = false
  let lastLoaded = 0
  let errorText = ''
  let warningText = ''
  let noticeText = ''
  let modal: HTMLDialogElement | undefined
  let modalReturn: HTMLElement | undefined
  let query = ''
  let statusFilter = ''
  let labelFilter = ''
  const filtersActive = () => Boolean(query.trim() || statusFilter || labelFilter)

  const shell = element('main', 'hierarchy-app')
  const header = element('header', 'app-header')
  const heading = element('div', 'heading')
  const eyebrow = element('div', 'eyebrow', options.demo ? 'INTERACTIVE DEMO' : 'TRELLO POWER-UP')
  heading.append(eyebrow, element('h1', '', options.cardId ? 'Card hierarchy' : 'Board hierarchy'))
  heading.append(element('p', 'subtitle', 'One parent. Many possibilities. Keep related work together.'))
  const headerActions = element('div', 'header-actions')
  const refreshButton = button('Refresh', () => { errorText = ''; void refresh() })
  headerActions.append(refreshButton)
  let authorizeButton: HTMLButtonElement | undefined
  let disconnectButton: HTMLButtonElement | undefined
  if (!options.demo) {
    authorizeButton = button('Authorize Trello', () => {
      void run(async () => { await adapter.authorize(); disconnected = false }, true)
    })
    disconnectButton = button('Disconnect', () => {
      void run(async () => {
        await adapter.disconnect()
        disconnected = true
        data = undefined
        lastLoaded = 0
        noticeText = 'Disconnected. Authorize Trello to reconnect.'
        render()
      }, false)
    }, 'quiet')
    headerActions.append(authorizeButton, disconnectButton)
  }
  header.append(heading, headerActions)
  const context = element('div', 'context-note', options.demo
    ? 'Sample board · Changes stay in this demo session. No Trello cards are changed.'
    : 'Hierarchy view · Collapsing a branch here does not hide native Trello cards.')
  if (options.demo) context.append(element('span', '', ' Collapsing a branch here does not hide native Trello cards.'))
  const banners = element('section', 'banners')
  banners.setAttribute('aria-label', 'Notifications')
  const toolbar = element('section', 'toolbar')
  toolbar.setAttribute('aria-label', 'Hierarchy filters')
  const search = element('input')
  search.type = 'search'
  search.placeholder = 'Search cards, labels, people…'
  search.autocomplete = 'off'
  search.addEventListener('input', () => { query = search.value; renderTree() })
  const statuses = element('select')
  statuses.append(option('', 'All statuses'))
  statuses.addEventListener('change', () => { statusFilter = statuses.value; renderTree() })
  const labels = element('select')
  labels.append(option('', 'All labels'))
  labels.addEventListener('change', () => { labelFilter = labels.value; renderTree() })
  toolbar.append(field('Search', search), field('Status', statuses), field('Label', labels))
  const viewActions = element('div', 'view-actions')
  const expandAll = button('Expand all', () => {
    if (!data) return
    const activeIds = new Set(data.cards.filter(card => !card.closed).map(card => card.id))
    expanded = new Set(Object.values(data.parents).filter(id => activeIds.has(id)))
    void saveExpansion()
    renderTree()
  }, 'quiet')
  const collapseAll = button('Collapse all', () => {
    expanded.clear()
    void saveExpansion()
    renderTree()
  }, 'quiet')
  const clearFilters = button('Clear filters', () => {
    query = ''; statusFilter = ''; labelFilter = ''
    search.value = ''; statuses.value = ''; labels.value = ''
    renderTree()
    search.focus()
  }, 'quiet')
  const rulesButton = button('Status rules', () => openRules(), 'quiet')
  rulesButton.setAttribute('aria-haspopup', 'dialog')
  viewActions.append(expandAll, collapseAll, clearFilters, rulesButton)
  const summary = element('p', 'view-summary')
  summary.setAttribute('role', 'status')
  const content = element('section', 'tree-content')
  content.setAttribute('aria-label', 'Cards')
  content.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !(event.target instanceof HTMLElement)) return
    const menu = event.target.closest<HTMLDetailsElement>('.card-menu[open]')
    if (menu) {
      menu.open = false
      menu.querySelector('summary')?.focus()
      event.preventDefault()
      event.stopPropagation()
    }
  })
  const footer = element('footer', 'app-footer', 'Relationships organize cards without moving or deleting them. Expansion is saved privately for this board.')
  shell.append(header, context, banners, toolbar, viewActions, summary, content, footer)
  app.append(shell)

  function showError(error: unknown) {
    if (!alive) return
    errorText = message(error)
    renderBanners()
  }

  function renderBanners() {
    banners.replaceChildren()
    if (errorText) {
      const alert = element('div', 'banner error')
      alert.setAttribute('role', 'alert')
      alert.append(element('span', '', errorText), button('Dismiss', () => {
        errorText = ''; renderBanners()
      }, 'quiet'))
      banners.append(alert)
    }
    if (warningText) banners.append(element('p', 'banner warning', warningText))
    if (noticeText) {
      const notice = element('p', 'banner success', noticeText)
      notice.setAttribute('role', 'status')
      banners.append(notice)
    }
    if (data && !data.canWrite) {
      banners.append(element('p', 'banner warning', 'Read-only · Board write access is required to create cards or change relationships. You can still browse, filter, and expand.'))
    }
    if (data?.issues.length) {
      const details = element('details', 'banner warning')
      details.append(element('summary', '', `${data.issues.length} relationship issue${data.issues.length === 1 ? '' : 's'} · Review and repair`))
      const list = element('ul')
      for (const issue of data.issues) list.append(element('li', '', issue))
      details.append(list)
      banners.append(details)
    }
  }

  function syncControls() {
    const blocked = pending || loading
    refreshButton.disabled = blocked
    refreshButton.textContent = loading ? 'Refreshing…' : 'Refresh'
    if (authorizeButton) authorizeButton.disabled = blocked
    if (disconnectButton) disconnectButton.disabled = blocked
    rulesButton.hidden = !data?.isAdmin
    rulesButton.disabled = blocked || !data?.canWrite
    toolbar.hidden = !data
    viewActions.hidden = !data
    expandAll.disabled = !data || filtersActive()
    collapseAll.disabled = !data || filtersActive()
    clearFilters.hidden = !filtersActive()
    for (const control of shell.querySelectorAll<HTMLButtonElement>('[data-write]')) {
      control.disabled = blocked || !data?.canWrite || control.dataset.unavailable === 'true'
      control.title = !data?.canWrite ? 'Board write access is required.' : ''
    }
    if (modal) {
      for (const control of modal.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) {
        control.disabled = pending
      }
      const submit = modal.querySelector<HTMLButtonElement>('[type=submit]')
      if (submit) submit.disabled = blocked || !data?.canWrite || submit.dataset.unavailable === 'true'
    }
    content.setAttribute('aria-busy', String(loading))
  }

  async function saveExpansion() {
    preferencesTouched = true
    preferencesQueued = true
    if (preferencesSaving) return
    preferencesSaving = true
    try {
      while (preferencesQueued && alive) {
        preferencesQueued = false
        try {
          await adapter.savePreferences({ expanded: [...expanded] })
          if (alive && warningText.startsWith('Expansion')) { warningText = ''; renderBanners() }
        } catch (error) {
          if (alive) {
            warningText = `Expansion could not be saved: ${message(error)}`
            renderBanners()
          }
        }
      }
    } finally { preferencesSaving = false }
  }

  function updateFilterOptions() {
    if (!data) return
    const availableStatuses = [...new Set(data.cards.filter(c => !c.closed).map(c => status(c, data!)))].sort()
    const availableLabels = new Map<string, string>()
    for (const card of data.cards.filter(c => !c.closed)) {
      for (const label of card.labels) availableLabels.set(label.id, label.name || label.color || 'Unnamed label')
    }
    statuses.replaceChildren(option('', 'All statuses'), ...availableStatuses.map(s => option(s, s)))
    labels.replaceChildren(option('', 'All labels'), ...[...availableLabels].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => option(id, name)))
    if (!availableStatuses.includes(statusFilter)) statusFilter = ''
    if (!availableLabels.has(labelFilter)) labelFilter = ''
    statuses.value = statusFilter
    labels.value = labelFilter
  }

  async function refresh(): Promise<boolean> {
    if (!alive) return false
    if (loadPromise) return loadPromise
    loading = true
    if (!data) renderTree()
    syncControls()
    loadPromise = (async () => {
      try {
        const loaded = await adapter.load()
        if (!alive) return false
        const safe = safeParents(loaded.cards, loaded.parents)
        data = { ...loaded, parents: safe.parents, issues: [...new Set([...loaded.issues, ...safe.issues])] }
        lastLoaded = Date.now()
        updateFilterOptions()
        render()
        return true
      } catch (error) {
        showError(error)
        return false
      } finally {
        loading = false
        loadPromise = undefined
        if (alive) { renderTree(); syncControls() }
      }
    })()
    return loadPromise
  }

  async function run(action: () => Promise<void>, reload = true, success = ''): Promise<boolean> {
    if (pending || loading || !alive) return false
    pending = true
    errorText = ''; noticeText = ''
    renderBanners()
    syncControls()
    try {
      await action()
      if (!alive) return false
      noticeText = success
      if (reload && !await refresh()) {
        errorText = `The action completed, but refreshing failed. ${errorText} Refresh before making another change.`
        renderBanners()
      }
      return true
    } catch (error) {
      showError(error)
      const modalError = modal?.querySelector<HTMLElement>('.dialog-error')
      if (modalError) { modalError.textContent = message(error); modalError.focus() }
      return false
    } finally {
      pending = false
      if (alive) { syncControls(); renderBanners() }
      if (refreshQueued && alive) {
        refreshQueued = false
        if (!disconnected) void refresh()
      }
    }
  }

  function rememberFocus() {
    const focused = document.activeElement
    return focused instanceof HTMLElement && content.contains(focused) ? focused.dataset.focus : undefined
  }

  function render() {
    renderBanners()
    renderTree()
    syncControls()
  }

  function renderTree() {
    if (!alive) return
    const focusKey = rememberFocus()
    content.replaceChildren()
    if (!data) {
      summary.textContent = ''
      const empty = element('div', 'empty-state')
      empty.append(element('h2', '', loading ? 'Loading your hierarchy…' : 'No board loaded'))
      empty.append(element('p', '', loading ? 'Fetching cards and relationships.' : 'Refresh to try again, or authorize Trello access in live mode.'))
      content.append(empty)
      syncControls()
      return
    }
    const snapshot = data
    const active = snapshot.cards.filter(c => !c.closed)
    const cards = new Map(active.map(c => [c.id, c]))
    const children = new Map<string, Card[]>()
    for (const card of active) {
      const parent = snapshot.parents[card.id]
      if (parent && cards.has(parent)) {
        const siblings = children.get(parent) ?? []
        siblings.push(card)
        children.set(parent, siblings)
      }
    }
    const focus = options.cardId ? cards.get(options.cardId) : undefined
    if (options.cardId && !focus) {
      summary.textContent = ''
      content.append(element('div', 'empty-state', 'This card is archived, unavailable, or no longer on this board. Refresh to check again.'))
      syncControls()
      return
    }
    const scope = focus ? new Set([focus.id, ...descendants(focus.id, snapshot.parents)]) : new Set(cards.keys())
    const members = new Map(snapshot.members.map(m => [m.id, m.fullName]))
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const matches = new Set(active.filter(card => {
      const text = [card.name, status(card, snapshot), snapshot.lists.find(l => l.id === card.idList)?.name,
        ...card.labels.map(l => l.name || l.color), ...card.idMembers.map(id => members.get(id))].join(' ').toLocaleLowerCase()
      return scope.has(card.id) && (!normalizedQuery || text.includes(normalizedQuery))
        && (!statusFilter || status(card, snapshot) === statusFilter)
        && (!labelFilter || card.labels.some(label => label.id === labelFilter))
    }).map(c => c.id))
    const visible = new Set(matches)
    for (const id of matches) {
      let parent = snapshot.parents[id]
      while (parent && scope.has(parent)) {
        visible.add(parent)
        parent = snapshot.parents[parent]
      }
    }
    const filtered = filtersActive()
    summary.textContent = filtered
      ? `${matches.size} matching card${matches.size === 1 ? '' : 's'} · Ancestors and matching descendants are revealed, even in collapsed branches. Clear filters to restore your expansion.`
      : `${scope.size} active card${scope.size === 1 ? '' : 's'} · Children stay under their parent, with their actual list shown.`

    function renderCard(card: Card): HTMLLIElement {
      const item = element('li', 'tree-item')
      const panel = element('article', `card${filtered && !matches.has(card.id) ? ' ancestor-card' : ''}`)
      const cardChildren = children.get(card.id) ?? []
      const visibleChildren = cardChildren.filter(child => visible.has(child.id))
      const isExpanded = filtered || expanded.has(card.id)
      const titleRow = element('div', 'card-title-row')
      const toggle = button(cardChildren.length ? (isExpanded ? '▾' : '▸') : '·', () => {
        if (expanded.has(card.id)) expanded.delete(card.id)
        else expanded.add(card.id)
        void saveExpansion()
        renderTree()
      }, 'tree-toggle')
      toggle.dataset.focus = `expand-${card.id}`
      toggle.disabled = !cardChildren.length || filtered
      toggle.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} ${card.name}`)
      if (cardChildren.length) toggle.setAttribute('aria-expanded', String(isExpanded))
      const title = button(card.name || 'Untitled card', () => {
        void Promise.resolve().then(() => adapter.open(card)).catch(showError)
      }, 'card-title')
      title.dataset.focus = `open-${card.id}`
      titleRow.append(toggle, title)
      const menu = element('details', 'card-menu')
      const menuTitle = element('summary', '', '•••')
      menuTitle.setAttribute('aria-label', `Actions for ${card.name}`)
      menuTitle.dataset.focus = `actions-${card.id}`
      const menuBody = element('div', 'card-menu-body')
      const actions: [string, () => void][] = [
        ['Create child', () => openRelationship('create', card)],
        ['Link existing card', () => openRelationship('link', card)],
        ['Change parent', () => openRelationship('parent', card)],
        ['Unlink from parent', () => openRelationship('unlink', card)],
      ]
      for (const [name, action] of actions) {
        const control = button(name, () => { menu.open = false; action() })
        control.dataset.write = 'true'
        control.setAttribute('aria-haspopup', 'dialog')
        menuBody.append(control)
      }
      menu.append(menuTitle, menuBody)
      titleRow.append(menu)
      const metadata = element('div', 'card-metadata')
      const done = complete(card, snapshot.rules)
      metadata.append(element('span', `status-badge${done ? ' is-complete' : ''}`, `${done ? '✓ ' : ''}${status(card, snapshot)}`))
      metadata.append(element('span', 'list-badge', `List: ${snapshot.lists.find(l => l.id === card.idList)?.name ?? 'Unavailable'}`))
      if (done) metadata.append(element('span', 'completion', 'Complete'))
      if (card.due) {
        const due = new Date(card.due)
        if (Number.isFinite(due.getTime())) {
          const overdue = !done && due.getTime() < Date.now()
          const time = element('time', overdue ? 'due overdue' : 'due', `${overdue ? 'Overdue · ' : 'Due '}${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${card.dueComplete ? ' · checked' : ''}`)
          time.dateTime = due.toISOString()
          metadata.append(time)
        }
      }
      for (const label of card.labels) metadata.append(element('span', 'label-badge', label.name || label.color || 'Unnamed label'))
      if (card.idMembers.length) metadata.append(element('span', 'members', `Members: ${card.idMembers.map(id => members.get(id) ?? 'Unknown member').join(', ')}`))
      panel.append(titleRow, metadata)
      if (cardChildren.length) {
        const progress = rollup(card.id, snapshot)
        const progressRow = element('div', 'rollup')
        const meter = element('progress')
        meter.max = progress.total
        meter.value = progress.done
        meter.setAttribute('aria-label', `${progress.done} of ${progress.total} descendants complete`)
        progressRow.append(meter, element('span', '', `${progress.done}/${progress.total} descendants complete · ${progress.progress}%${progress.overdue ? ` · ${progress.overdue} overdue` : ''}`))
        panel.append(progressRow)
      }
      item.append(panel)
      if (isExpanded && visibleChildren.length) {
        const nested = element('ul', 'children')
        for (const child of visibleChildren) nested.append(renderCard(child))
        item.append(nested)
      }
      return item
    }

    if (focus) {
      const parent = cards.get(snapshot.parents[focus.id])
      const focusHeader = element('div', 'focus-context')
      if (parent) focusHeader.append(element('span', '', 'Parent: '), button(parent.name, () => {
        void Promise.resolve().then(() => adapter.open(parent)).catch(showError)
      }, 'text-button'))
      else focusHeader.append(element('span', '', 'Top-level card · No parent'))
      content.append(focusHeader)
      if (visible.has(focus.id)) {
        const tree = element('ul', 'root-tree focused-tree')
        tree.append(renderCard(focus))
        content.append(tree)
      }
    } else {
      const board = element('div', 'board-columns')
      for (const list of snapshot.lists.filter(l => !l.closed)) {
        const roots = active.filter(c => c.idList === list.id && !cards.has(snapshot.parents[c.id]))
        const shown = roots.filter(c => visible.has(c.id))
        const column = element('section', 'board-column')
        const columnHeader = element('div', 'column-header')
        columnHeader.append(element('h2', '', list.name), element('span', 'column-count', `${shown.length}${filtered ? `/${roots.length}` : ''} roots`))
        column.append(columnHeader)
        const tree = element('ul', 'root-tree')
        for (const card of shown) tree.append(renderCard(card))
        column.append(tree)
        if (!shown.length) column.append(element('p', 'column-empty', filtered ? 'No matching branches' : 'No top-level cards'))
        board.append(column)
      }
      content.append(board)
      const excluded = active.filter(c => !cards.has(snapshot.parents[c.id])
        && !snapshot.lists.some(l => l.id === c.idList && !l.closed)).length
      if (excluded) content.append(element('p', 'muted', `${excluded} top-level card(s) in archived or unavailable lists are outside this active-list view.`))
      if (!snapshot.lists.some(l => !l.closed)) content.append(element('div', 'empty-state', 'This board has no active lists.'))
    }
    if (!matches.size && filtered) content.append(element('div', 'empty-state', 'No cards match these filters. Try a different search or clear filters.'))
    if (!active.length) content.append(element('div', 'empty-state', 'No active cards yet. Create a card in Trello, then refresh to start linking related work.'))
    syncControls()
    if (focusKey) {
      for (const node of content.querySelectorAll<HTMLElement>('[data-focus]')) {
        if (node.dataset.focus === focusKey) { node.focus(); break }
      }
    }
  }

  function closeModal() {
    if (!modal || pending) return
    modal.close()
  }

  function dialog(title: string, description: string, submitText: string) {
    if (modal || pending || loading || !data?.canWrite) return
    const active = document.activeElement
    modalReturn = active instanceof HTMLElement
      ? active.closest('.card-menu')?.querySelector<HTMLElement>('summary') ?? active
      : undefined
    const dialogNode = element('dialog', 'editor-dialog')
    modal = dialogNode
    const form = element('form', 'editor-form')
    const titleNode = element('h2', '', title)
    titleNode.id = 'hierarchy-dialog-title'
    dialogNode.setAttribute('aria-labelledby', titleNode.id)
    const explanation = element('p', 'muted', description)
    const body = element('div', 'dialog-fields')
    const error = element('p', 'dialog-error')
    error.setAttribute('role', 'alert')
    error.tabIndex = -1
    const actions = element('div', 'dialog-actions')
    const cancel = button('Cancel', closeModal, 'quiet')
    const submit = element('button', 'primary', submitText)
    submit.type = 'submit'
    actions.append(cancel, submit)
    form.append(titleNode, explanation, body, error, actions)
    dialogNode.append(form)
    shell.append(dialogNode)
    dialogNode.addEventListener('cancel', event => { if (pending) event.preventDefault() })
    dialogNode.addEventListener('close', () => {
      dialogNode.remove()
      if (modal === dialogNode) modal = undefined
      if (modalReturn?.isConnected) modalReturn.focus()
      else if (modalReturn?.dataset.focus) {
        for (const control of content.querySelectorAll<HTMLElement>('[data-focus]')) {
          if (control.dataset.focus === modalReturn.dataset.focus) { control.focus(); break }
        }
      }
    })
    return { node: dialogNode, form, body, submit }
  }

  function openRelationship(kind: 'create' | 'link' | 'parent' | 'unlink', card: Card) {
    if (!data) return
    const titles = { create: 'Create a child card', link: 'Link an existing card', parent: 'Change parent', unlink: 'Unlink from parent' }
    const descriptions = {
      create: `Create a new card under “${card.name}”. Choose its actual Trello list.`,
      link: `Choose a card to nest under “${card.name}”. This replaces its previous parent, if any. Its list stays unchanged.`,
      parent: `Choose a parent for “${card.name}”. Its children stay attached and no cards move between lists.`,
      unlink: `Remove the parent relationship for “${card.name}”. The card and all its children are preserved. It becomes top-level in its actual list.`,
    }
    const editor = dialog(titles[kind], descriptions[kind], kind === 'create' ? 'Create child' : kind === 'unlink' ? 'Unlink card' : 'Save relationship')
    if (!editor) return
    const name = element('input')
    name.type = 'text'; name.required = true; name.maxLength = 16384
    const selection = element('select')
    selection.required = true
    selection.append(option('', 'Choose…'))
    if (kind === 'create') {
      name.placeholder = 'What needs to be done?'
      editor.body.append(field('Card title', name))
      for (const list of data.lists.filter(l => !l.closed)) selection.append(option(list.id, list.name))
      if (data.lists.some(l => l.id === card.idList && !l.closed)) selection.value = card.idList
      editor.body.append(field('List', selection))
    } else if (kind !== 'unlink') {
      const forbidden = kind === 'parent'
        ? new Set([card.id, ...descendants(card.id, data.parents)])
        : new Set([card.id])
      if (kind === 'link') {
        let ancestor: string | undefined = data.parents[card.id]
        while (ancestor) { forbidden.add(ancestor); ancestor = data.parents[ancestor] }
      }
      const candidates = data.cards.filter(c => !c.closed && !forbidden.has(c.id)
        && c.idBoard === card.idBoard && (kind !== 'link' || data!.parents[c.id] !== card.id))
      for (const candidate of candidates) {
        const listName = data.lists.find(l => l.id === candidate.idList)?.name ?? 'Unavailable list'
        selection.append(option(candidate.id, `${candidate.name} · ${listName}${data.parents[candidate.id] ? ' · has a parent' : ''}`))
      }
      if (kind === 'parent' && data.parents[card.id]) selection.value = data.parents[card.id]
      editor.body.append(field(kind === 'parent' ? 'New parent' : 'Child card', selection))
      if (!candidates.length) editor.body.append(element('p', 'muted', 'No eligible cards. A card cannot be its own ancestor.'))
    }
    if (kind !== 'unlink' && selection.options.length <= 1) {
      editor.submit.disabled = true
      editor.submit.dataset.unavailable = 'true'
    }
    editor.form.addEventListener('submit', event => {
      event.preventDefault()
      if (!data?.canWrite || pending || loading || !editor.form.reportValidity()) return
      const title = name.value.trim()
      if (kind === 'create' && !title) { name.setCustomValidity('Enter a card title.'); name.reportValidity(); return }
      const value = selection.value
      void run(async () => {
        if (kind === 'create') {
          await adapter.create(card.id, title, value)
          expanded.add(card.id)
          void saveExpansion()
        } else if (kind === 'unlink') await adapter.link(card.id, null)
        else if (kind === 'parent') {
          await adapter.link(card.id, value)
          expanded.add(value)
          void saveExpansion()
        } else {
          await adapter.link(value, card.id)
          expanded.add(card.id)
          void saveExpansion()
        }
      }, true, kind === 'unlink' ? 'Relationship removed. All cards were preserved.' : kind === 'create' ? 'Child card created.' : 'Relationship saved.').then(saved => {
        if (saved && alive) closeModal()
      })
    })
    name.addEventListener('input', () => name.setCustomValidity(''))
    editor.node.showModal()
    if (kind === 'create') name.focus()
    else if (kind !== 'unlink') selection.focus()
    else editor.submit.focus()
  }

  function openRules() {
    if (!data?.isAdmin) return
    const editor = dialog('List status rules', 'Map each active list to a status and mark lists whose cards count as complete. Trello’s checked due dates also count as complete. Board administrators only.', 'Save rules')
    if (!editor) return
    const rows = new Map<string, { name: HTMLInputElement; complete: HTMLInputElement }>()
    for (const list of data.lists.filter(l => !l.closed)) {
      const row = element('fieldset', 'rule-row')
      row.append(element('legend', '', list.name))
      const name = element('input')
      name.type = 'text'; name.maxLength = 100
      name.value = data.rules[list.id]?.status ?? list.name
      name.placeholder = list.name
      const done = element('input')
      done.type = 'checkbox'
      done.checked = data.rules[list.id]?.complete === true
      row.append(field('Display status', name), field('Counts as complete', done))
      editor.body.append(row)
      rows.set(list.id, { name, complete: done })
    }
    if (!rows.size) {
      editor.body.append(element('p', 'muted', 'There are no active lists to configure.'))
      editor.submit.disabled = true
      editor.submit.dataset.unavailable = 'true'
    }
    editor.form.addEventListener('submit', event => {
      event.preventDefault()
      if (!data?.canWrite || !data.isAdmin || pending || loading) return
      const rules: Rules = { ...data.rules }
      for (const [id, controls] of rows) {
        rules[id] = { status: controls.name.value.trim(), complete: controls.complete.checked }
      }
      void run(() => adapter.saveRules(rules), true, 'Status rules saved.').then(saved => {
        if (saved && alive) closeModal()
      })
    })
    editor.node.showModal()
  }

  function requestRefresh() {
    if (disconnected) return
    if (pending) { refreshQueued = true; return }
    void refresh()
  }
  function isVisible() {
    return document.visibilityState === 'visible' && app!.getClientRects().length > 0
  }
  function poll() {
    if (!options.demo && !disconnected && isVisible() && !pending && !loading && !modal && Date.now() - lastLoaded >= 60_000) void refresh()
  }
  const interval = window.setInterval(poll, 60_000)
  window.addEventListener('hierarchy-refresh', requestRefresh)
  document.addEventListener('visibilitychange', poll)
  const cleanup = () => {
    alive = false
    window.clearInterval(interval)
    window.removeEventListener('hierarchy-refresh', requestRefresh)
    document.removeEventListener('visibilitychange', poll)
    window.removeEventListener('pagehide', cleanup)
    modal?.remove()
  }
  dispose = cleanup
  window.addEventListener('pagehide', cleanup)
  const preferences = (async () => {
    try {
      const prefs = await adapter.preferences()
      if (alive && !preferencesTouched) {
        expanded = new Set(Array.isArray(prefs.expanded) ? prefs.expanded.filter((id): id is string => typeof id === 'string') : [])
        renderTree()
      }
    } catch (error) {
      if (alive) {
        warningText = `Expansion preferences could not be loaded: ${message(error)}. You can still use this view.`
        renderBanners()
      }
    }
  })()
  await Promise.all([refresh(), preferences])
}
