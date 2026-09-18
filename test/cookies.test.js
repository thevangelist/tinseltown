import assert from 'node:assert/strict'
import test from 'node:test'
import { PRESETS } from '../src/cookies.js'
import { SCHEMA, resolveOptions } from '../src/options.js'
import { FRAME } from '../src/optics.js'

for (const [name, preset] of Object.entries(PRESETS)) {
  test(`${name}: a deterministic SVG in black and alpha only`, () => {
    const svg = preset.svg()
    assert.equal(svg, preset.svg())
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/)
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/)
    const paints = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(match => match[1])
    assert.deepEqual(paints.filter(paint => !['#000', '#fff', 'none'].includes(paint)), [])
    assert.doesNotMatch(svg, /<script|<foreignObject|href="(?!#)/)
  })

  test(`${name}: the rig uses known options inside their bounds`, () => {
    assert.deepEqual(Object.keys(preset.rig).filter(key => !(key in SCHEMA)), [])
    const resolved = resolveOptions(preset.rig)
    for (const [key, value] of Object.entries(preset.rig)) assert.equal(resolved[key], value, key)
  })

  test(`${name}: the cookie plane meets the wall outside the frame, so no bare corner shows`, () => {
    const o = resolveOptions(preset.rig)
    const azimuth = (o.azimuth * Math.PI) / 180
    const reach = FRAME[0] * Math.abs(Math.cos(azimuth)) + FRAME[1] * Math.abs(Math.sin(azimuth))
    assert.ok(o.cookieDistance / Math.cos((o.elevation * Math.PI) / 180) > reach)
  })

  test(`${name}: penumbra stays below a tenth of the cookie`, () => {
    const o = resolveOptions(preset.rig)
    const penumbra = (2 * o.lightSize * o.cookieDistance) / (o.lightDistance - o.cookieDistance)
    assert.ok(penumbra < o.cookieScale * 0.1, `${penumbra} of ${o.cookieScale}`)
  })
}
