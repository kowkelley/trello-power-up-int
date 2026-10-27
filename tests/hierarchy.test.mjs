import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyFilters, filterOptions, hasFilters, relationshipCandidates, selectHierarchy } from '../src/features/hierarchy/selectors.ts'
import { createHierarchyStore } from '../src/features/hierarchy/store.ts'

const card = (id, idList = 'todo', extra = {}) => ({
  id, name: id, idBoard: 'board', idList, closed: false,
  due: null, dueComplete: false, labels: [], idMembers: [], ...extra,
})
const snapshot = () => ({
  boardId: 'board',
  cards: [card('parent'), card('child', 'doing'), card('leaf', 'todo', {
    labels: [{ id: 'ops', name: 'Operations', color: 'green' }], idMembers: ['alex'],
  }), card('other'), card('archived', 'todo', { closed: true })],
  lists: [{ id: 'todo', name: 'To do', closed: false }, { id: 'doing', name: 'In progress', closed: false }],
  members: [{ id: 'alex', fullName: 'Alex Example' }],
  parents: { child: 'parent', leaf: 'child' }, rules: {},
  canWrite: true, isAdmin: true, issues: [],
})
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const makeAdapter = (overrides = {}) => ({
  load: async () => snapshot(),
  preferences: async () => ({ expanded: ['parent'] }),
  savePreferences: async () => {},
  authorize: async () => {},
  disconnect: async () => {},
  ...overrides,
})

test('filtering by descendant metadata keeps ancestors across lists without changing expansion', () => {
  const data = snapshot()
  for (const filters of [
    { ...emptyFilters, query: 'alex example' },
    { ...emptyFilters, label: 'ops' },
    { ...emptyFilters, query: 'operations', status: 'To do' },
  ]) {
    const tree = selectHierarchy(data, filters)
    assert.deepEqual([...tree.matches], ['leaf'])
    assert.deepEqual([...tree.visible].sort(), ['child', 'leaf', 'parent'])
    assert.equal(tree.filtered, true)
    assert.deepEqual(tree.children.get('parent').map(card => card.id), ['child'])
  }
  assert.equal(hasFilters({ ...emptyFilters, query: '  ' }), false)
  assert.equal(selectHierarchy(data, emptyFilters).active.length, 4)
})

test('focused views include descendants but exclude siblings and unrelated matches', () => {
  const data = snapshot()
  const tree = selectHierarchy(data, emptyFilters, 'child')
  assert.deepEqual([...tree.scope], ['child', 'leaf'])
  assert.deepEqual([...tree.visible], ['child', 'leaf'])
  assert.equal(tree.focus.id, 'child')
  assert.equal(selectHierarchy(data, emptyFilters, 'archived').focus, undefined)
  assert.equal(selectHierarchy(data, { ...emptyFilters, query: 'other' }, 'child').matches.size, 0)
})

test('filter choices use active cards and list status mappings', () => {
  const data = snapshot()
  data.rules.doing = { status: 'Working', complete: false }
  data.cards.at(-1).labels = [{ id: 'hidden', name: 'Archived only', color: null }]
  assert.deepEqual(filterOptions(data), { statuses: ['To do', 'Working'], labels: [['ops', 'Operations']] })
})

test('relationship choices exclude cycles, existing direct children, and foreign or archived cards', () => {
  const data = snapshot()
  data.cards.push(card('foreign', 'todo', { idBoard: 'elsewhere' }))
  const child = data.cards.find(card => card.id === 'child')
  assert.deepEqual(relationshipCandidates(data, 'parent', child).map(card => card.id), ['parent', 'other'])
  assert.deepEqual(relationshipCandidates(data, 'link', child).map(card => card.id), ['other'])
  assert.deepEqual(relationshipCandidates(data, 'link', data.cards[0]).map(card => card.id), ['leaf', 'other'])
})

test('store sanitizes snapshots and deduplicates concurrent refreshes', async () => {
  const load = deferred()
  let reads = 0
  const store = createHierarchyStore(makeAdapter({ load: () => { reads++; return load.promise } }))
  const first = store.refresh()
  const second = store.refresh()
  assert.equal(store.getSnapshot().loading, true)
  const data = snapshot()
  data.parents.parent = 'leaf'
  load.resolve(data)
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(reads, 1)
  assert.equal(store.getSnapshot().loading, false)
  assert.equal(store.getSnapshot().data.issues.length, 1)
})

test('expansion writes are serialized and a late preference load cannot overwrite user changes', async () => {
  const preferences = deferred()
  const firstSave = deferred()
  const writes = []
  const store = createHierarchyStore(makeAdapter({
    preferences: () => preferences.promise,
    savePreferences: value => {
      writes.push(value.expanded)
      return writes.length === 1 ? firstSave.promise : Promise.resolve()
    },
  }))
  const start = store.start()
  store.toggle('child')
  store.toggle('leaf')
  preferences.resolve({ expanded: ['other'] })
  await start
  assert.deepEqual([...store.getSnapshot().expanded], ['child', 'leaf'])
  assert.deepEqual(writes, [['child']])
  firstSave.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes, [['child'], ['child', 'leaf']])
})

test('preference failures are visible and do not prevent browsing', async () => {
  const store = createHierarchyStore(makeAdapter({
    preferences: async () => { throw new Error('SDK unavailable') },
    savePreferences: async () => { throw new Error('storage budget') },
  }))
  await store.start()
  assert.match(store.getSnapshot().warning, /preferences could not be loaded.*SDK unavailable/)
  assert.ok(store.getSnapshot().data)
  store.toggle('child')
  await new Promise(resolve => setImmediate(resolve))
  assert.match(store.getSnapshot().warning, /Expansion could not be saved: storage budget/)
})

test('mutations prevent duplicate submissions and drain a queued SDK refresh', async () => {
  let reads = 0
  const store = createHierarchyStore(makeAdapter({ load: async () => { reads++; return snapshot() } }))
  await store.start()
  const action = deferred()
  const pending = store.run(() => action.promise, false, 'Saved')
  assert.equal(store.getSnapshot().pending, true)
  assert.equal(await store.run(async () => { throw new Error('must not run') }), false)
  store.requestRefresh()
  assert.equal(reads, 1)
  action.resolve()
  assert.equal(await pending, true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 2)
  assert.equal(store.getSnapshot().notice, 'Saved')
})

test('action errors and failed post-write refreshes report distinct outcomes', async () => {
  const store = createHierarchyStore(makeAdapter())
  await store.start()
  assert.equal(await store.run(async () => { throw new Error('Write denied') }), false)
  assert.equal(store.getSnapshot().error, 'Write denied')
  const failingStore = createHierarchyStore(makeAdapter({ load: async () => { throw new Error('Rate limited') } }))
  assert.equal(await failingStore.run(async () => {}, true, 'Saved'), true)
  assert.match(failingStore.getSnapshot().error, /action completed, but refreshing failed.*Rate limited/)
  assert.equal(failingStore.getSnapshot().pending, false)
})

test('disconnect clears private board data and stops SDK refresh until reauthorization', async () => {
  let reads = 0
  const store = createHierarchyStore(makeAdapter({ load: async () => { reads++; return snapshot() } }))
  await store.start()
  await store.disconnect()
  assert.equal(store.getSnapshot().data, undefined)
  assert.match(store.getSnapshot().notice, /Disconnected/)
  store.requestRefresh()
  assert.equal(reads, 1)
  await store.authorize()
  assert.equal(reads, 2)
  assert.ok(store.getSnapshot().data)
})

test('disposing the store prevents late loads from publishing data', async () => {
  const load = deferred()
  const store = createHierarchyStore(makeAdapter({ load: () => load.promise }))
  let notifications = 0
  store.subscribe(() => notifications++)
  const pending = store.refresh()
  store.dispose()
  load.resolve(snapshot())
  assert.equal(await pending, false)
  assert.equal(store.getSnapshot().data, undefined)
  assert.equal(notifications, 1)
})
