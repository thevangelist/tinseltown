import assert from 'node:assert/strict'
import test from 'node:test'
import { SCHEMA, resolveOptions } from '../src/options.js'

test('defaults come from the schema', () => {
  const options = resolveOptions()
  for (const [key, spec] of Object.entries(SCHEMA)) assert.equal(options[key], spec.default, key)
})

test('attributes beat the preset rig, the rig beats the defaults', () => {
  const options = resolveOptions({ lightSize: 0.3, haze: 0.5 }, { lightSize: '0.05', haze: null })
  assert.equal(options.lightSize, 0.05)
  assert.equal(options.haze, 0.5)
  assert.equal(options.spread, SCHEMA.spread.default)
})

test('garbage falls back to the default instead of reaching the GPU as NaN', () => {
  for (const raw of ['', ' ', 'abc', 'NaN', 'Infinity', '-Infinity', {}, []])
    assert.equal(resolveOptions({}, { lightSize: raw }).lightSize, SCHEMA.lightSize.default, String(raw))
})

test('numbers are clamped to bounds that keep the shader safe', () => {
  const options = resolveOptions({}, { samples: '100000', elevation: '0', cookieScale: '0', resolution: '50', layers: '9', threshold: '-1' })
  assert.equal(options.samples, SCHEMA.samples.max)
  assert.equal(options.elevation, SCHEMA.elevation.min)
  assert.equal(options.cookieScale, SCHEMA.cookieScale.min)
  assert.equal(options.resolution, SCHEMA.resolution.max)
  assert.equal(options.layers, SCHEMA.layers.max)
  assert.equal(options.threshold, 0)
})

test('integer options are rounded', () => {
  assert.equal(resolveOptions({}, { samples: '12.6' }).samples, 13)
  assert.equal(resolveOptions({}, { layers: '1.4' }).layers, 1)
})

test('enums and motion tokens reject unknown values', () => {
  assert.equal(resolveOptions({}, { edge: 'explode' }).edge, 'repeat')
  assert.equal(resolveOptions({}, { edge: 'block' }).edge, 'block')
  assert.equal(resolveOptions({}, { motion: '  sway  <script> flicker constructor ' }).motion, 'sway flicker')
})

test('unknown keys never reach the options', () => {
  const options = resolveOptions({ __proto__: { polluted: 1 }, bogus: 1 }, { bogus: 2 })
  assert.deepEqual(Object.keys(options), Object.keys(SCHEMA))
})

test('a boolean option reads like an HTML boolean attribute', () => {
  assert.equal(resolveOptions().invert, false)
  assert.equal(resolveOptions({}, { invert: '' }).invert, true)
  assert.equal(resolveOptions({}, { invert: 'true' }).invert, true)
  assert.equal(resolveOptions({}, { invert: 'false' }).invert, false)
  assert.equal(resolveOptions({}, { invert: 'banana' }).invert, false)
})
