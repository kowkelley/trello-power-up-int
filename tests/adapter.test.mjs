import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { liveAdapter } from '../src/adapter.ts'

let values, writes, canWrite, admin, authorized, unavailable
const cards = ['a', 'b', 'c'].map(id => ({ id, name: id, idBoard: 'board', idList: 'todo', closed: false }))
const sdk = {
  getRestApi: () => ({ getToken: async () => authorized ? 'test-placeholder' : null }),
  getContext: () => ({ board: 'board' }),
  member: async () => ({ id: 'me' }),
  memberCanWriteToModel: () => canWrite,
  get: async (id, _scope, key, fallback) => {
    if (id === unavailable) throw new Error('Inaccessible')
    return values[`${id}:${key}`] ?? fallback
  },
  set: async (id, scope, key, value) => { writes.push([id, scope, key, value]); values[`${id}:${key}`] = value },
  remove: async (id, scope, key) => { writes.push([id, scope, key]); delete values[`${id}:${key}`] },
}
beforeEach(() => {
  values = {}; writes = []; canWrite = true; admin = false; authorized = true; unavailable = null
  globalThis.fetch = async url => {
    const path = url.pathname
    const value = path.endsWith('/cards') ? cards :
      path.endsWith('/lists') ? [{ id: 'todo', name: 'To do', closed: false }] :
      path.endsWith('/members') ? [{ id: 'me', fullName: 'Example' }] :
      { memberships: [{ idMember: 'me', memberType: admin ? 'admin' : 'normal' }] }
    return { ok: true, json: async () => value }
  }
})
test('viewer can read but all writes and creation are rejected', async () => {
  canWrite = false
  const adapter = liveAdapter(sdk)
  assert.equal((await adapter.load()).canWrite, false)
  await assert.rejects(adapter.link('b', 'a'), /Read-only/)
  await assert.rejects(adapter.link('b', null), /Read-only/)
  await assert.rejects(adapter.create('a', 'New child', 'todo'), /Read-only/)
  await assert.rejects(adapter.saveRules({}), /Read-only/)
  assert.equal(writes.length, 0)
})
test('link/change/unlink only edit the child pointer and preserve real cards', async () => {
  const adapter = liveAdapter(sdk)
  await adapter.link('b', 'a')
  await adapter.link('b', 'c')
  assert.equal(values['b:parent-v1'], 'c')
  await adapter.link('b', null)
  assert.equal(values['b:parent-v1'], undefined)
  assert.equal(cards.length, 3)
  assert.deepEqual(writes.map(w => w[0]), ['b', 'b', 'b'])
})
test('cycles rejected against a fresh snapshot', async () => {
  values['b:parent-v1'] = 'a'
  values['c:parent-v1'] = 'b'
  await assert.rejects(liveAdapter(sdk).link('a', 'c'), /cycle/)
  assert.equal(writes.length, 0)
})
test('only admins can save list mapping', async () => {
  const adapter = liveAdapter(sdk)
  await assert.rejects(adapter.saveRules({}), /administrators/)
  admin = true
  await adapter.saveRules({ todo: { status: 'Queued', complete: false } })
  assert.equal(values['board:list-rules-v1'].todo.status, 'Queued')
})
test('unavailable metadata does not block reading but does block mutations', async () => {
  unavailable = 'b'
  const adapter = liveAdapter(sdk)
  assert.match((await adapter.load()).issues[0], /unavailable/)
  await assert.rejects(adapter.link('a', 'c'), /metadata is unavailable/)
  await assert.rejects(adapter.create('a', 'New child', 'todo'), /metadata is unavailable/)
  assert.equal(writes.length, 0)
})
test('unauthorized users get actionable error without exposing private data', async () => {
  authorized = false
  await assert.rejects(liveAdapter(sdk).load(), /Authorize Trello/)
})
test('creation preserves the new card and reports its URL if subsequent linking fails', async () => {
  const read = globalThis.fetch
  const methods = []
  globalThis.fetch = async (url, options) => {
    methods.push(options.method)
    if (options.method === 'POST') return {
      ok: true,
      json: async () => ({ id: 'new-card', url: 'https://trello.com/c/example' }),
    }
    return read(url)
  }
  // The simulated next board read has not observed the newly created card yet.
  await assert.rejects(liveAdapter(sdk).create('a', 'New task', 'todo'),
    /Card created \(https:\/\/trello.com\/c\/example\) but linking failed/)
  assert.equal(methods.filter(m => m === 'POST').length, 1)
  assert.equal(methods.some(m => m === 'DELETE' || m === 'PUT'), false)
})
