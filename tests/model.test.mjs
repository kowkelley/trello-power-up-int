import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLink, assertWrite, safeParents, descendants, rollup, storageSize } from '../src/model.ts'

const card = (id, extra = {}) => ({ id, name: id, idBoard: 'board', idList: 'todo', closed: false, dueComplete: false, due: null, ...extra })
const cards = [card('a'), card('b'), card('c')]
test('rejects self-parenting, cycles, foreign, archived and missing cards', () => {
  for (const [items, parents, child, parent] of [
    [cards, {}, 'a', 'a'], [cards, { b: 'a', c: 'b' }, 'a', 'c'],
    [[card('a'), card('b', { idBoard: 'other' })], {}, 'a', 'b'],
    [[card('a'), card('b', { closed: true })], {}, 'a', 'b'],
    [cards, {}, 'a', 'missing'],
  ]) assert.throws(() => assertLink(items, parents, child, parent))
})
test('supports deeper nesting and replacing one direct parent', () => {
  assert.doesNotThrow(() => assertLink(cards, { b: 'a' }, 'c', 'b'))
  const parents = { b: 'a', c: 'a' }
  parents.c = 'b'
  assert.deepEqual(descendants('a', parents), ['b', 'c'])
})
test('stale references and concurrent cycles are deterministically excluded without deleting cards', () => {
  const raw = { a: 'b', b: 'a', c: 'gone' }
  const safe = safeParents(cards, raw)
  assert.equal(safe.issues.length, 2)
  assert.deepEqual(safe.parents, { a: 'b' })
  assert.equal(raw.b, 'a')
  assert.equal(cards.length, 3)
})
test('rollups count all descendants, completion is independent of archival', () => {
  const data = { cards: [card('a'), card('b', { idList: 'done' }), card('c', { due: '2020-01-01' }), card('d', { closed: true })],
    parents: { b: 'a', c: 'b', d: 'a' }, rules: { done: { status: 'Complete', complete: true } } }
  assert.deepEqual(rollup('a', data), { total: 2, done: 1, progress: 50, overdue: 1 })
})
test('viewers cannot mutate and private preferences respect storage budget', () => {
  assert.throws(() => assertWrite({ canWrite: false }), /Read-only/)
  assert.doesNotThrow(() => assertWrite({ canWrite: true }))
  assert.throws(() => storageSize('x'.repeat(3501)), /storage budget/)
})
