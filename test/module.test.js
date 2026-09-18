import assert from 'node:assert/strict'
import test from 'node:test'

test('the element module imports without a DOM, as in a server render', async () => {
  assert.equal(globalThis.HTMLElement, undefined)
  const module = await import('../src/tinseltown.js')
  assert.equal(typeof module.TinseltownBackdrop, 'function')
})
