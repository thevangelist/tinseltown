import assert from 'node:assert/strict'
import test from 'node:test'
import { kelvinToRgb, motionAt, project, rig, transmission } from '../src/optics.js'
import { resolveOptions } from '../src/options.js'

const OPTIONS = { ...resolveOptions(), cookieAspect: 1 }
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)
const length = v => Math.hypot(...v)

test('transmission: black blocks, white and transparent pass, grey is partial, colour tints', () => {
  assert.deepEqual(transmission(0, 0, 0, 1), [0, 0, 0])
  assert.deepEqual(transmission(1, 1, 1, 1), [1, 1, 1])
  assert.deepEqual(transmission(0, 0, 0, 0), [1, 1, 1])
  assert.deepEqual(transmission(0, 0, 0, 0.5), [0.5, 0.5, 0.5])
  assert.deepEqual(transmission(1, 0, 0, 1), [1, 0, 0])
  assert.deepEqual(transmission(1, 0, 0, 0.5), [1, 0.5, 0.5])
})

test('the beam axis passes through the cookie centre', () => {
  const r = rig(OPTIONS)
  const [u, v] = project([0, 0, 0], r.light, r.layers[0])
  near(u, 0.5)
  near(v, 0.5)
})

test('penumbra grows with cookie distance and light size', () => {
  const spread = options => {
    const r = rig(options), [layer] = r.layers
    const edge = sign => r.light.map((c, i) => c + sign * r.lightU[i])
    return Math.abs(project([0, 0, 0], edge(1), layer)[0] - project([0, 0, 0], edge(-1), layer)[0])
  }
  const base = spread(OPTIONS)
  assert.ok(spread({ ...OPTIONS, cookieDistance: 3 }) > base)
  near(spread({ ...OPTIONS, lightSize: 0.3 }), base * 2)
})

test('a cookie behind the light is ignored', () => {
  const r = rig(OPTIONS)
  assert.equal(project(r.light, [0, 0, 0], { ...r.layers[0], c: r.light.map(c => c * 2) }), null)
})

test('the rig stays finite and well formed at the edges of the schema', () => {
  for (const extreme of [{ elevation: 5 }, { elevation: 90 }, { lightSize: 0 }, { cookieDistance: 90, lightDistance: 0.5 }, { layers: 3 }]) {
    const r = rig({ ...OPTIONS, ...extreme })
    const numbers = [r.light, r.axis, r.lightU, r.lightV, r.cone, [r.wallNorm, r.distance2, r.gain], ...r.layers.flatMap(Object.values)].flat()
    assert.ok(numbers.every(Number.isFinite), JSON.stringify(extreme))
    near(length(r.axis), 1)
  }
})

test('extra layers sit further from the wall, never behind the lamp', () => {
  const r = rig({ ...OPTIONS, layers: 3, cookieDistance: 5 })
  const heights = r.layers.map(layer => layer.c[2])
  assert.ok(heights[0] < heights[1] && heights[1] <= heights[2])
  assert.ok(heights.every(z => z < r.light[2]))
})

test('no motion is the identity, flicker stays bounded, drift keeps moving', () => {
  assert.deepEqual(motionAt(12.3, ['']), { roll: 0, x: 0, y: 0, azimuth: 0, elevation: 0, gain: 1 })
  for (let t = 0; t < 60; t += 0.37) {
    const { gain } = motionAt(t, ['flicker'])
    assert.ok(gain > 0.7 && gain < 1.3)
  }
  assert.ok(motionAt(100, ['drift']).x > motionAt(10, ['drift']).x)
})

test('colour temperature: linear rgb in range, warm is red, cold is blue', () => {
  for (const kelvin of [1000, 1900, 3200, 6600, 12000, 40000]) assert.ok(kelvinToRgb(kelvin).every(c => c >= 0 && c <= 1), kelvin)
  const warm = kelvinToRgb(2000), cold = kelvinToRgb(12000)
  assert.ok(warm[0] > warm[2])
  assert.ok(cold[2] > cold[0])
})

test('framing covers like background-size: cover and never leaves the frame', async () => {
  const { FRAME, viewExtent } = await import('../src/optics.js')
  assert.deepEqual(viewExtent(1.6), [1.6, 1])
  assert.deepEqual(viewExtent(3.2), [1.6, 0.5])
  assert.deepEqual(viewExtent(0.5), [0.5, 1])
  for (const aspect of [0.2, 0.46, 1, 1.78, 2, 3.56, 10]) {
    const [x, y] = viewExtent(aspect)
    near(x / y, aspect)
    assert.ok(x <= FRAME[0] + 1e-9 && y <= FRAME[1] + 1e-9)
    assert.ok(x === FRAME[0] || y === FRAME[1])
  }
})
