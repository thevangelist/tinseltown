const { sin, cos, PI } = Math
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = a => mul(a, 1 / Math.hypot(...a))
const rad = deg => (deg * PI) / 180

// Half extents of the wall area every preset is composed for.
export const FRAME = [1.6, 1]

// Framing works like background-size: cover. The element shows the largest part of the frame that has its aspect,
// so a wide or huge screen never runs out of lit wall.
export function viewExtent(aspect) {
  const k = Math.min(1, FRAME[0] / aspect)
  return [aspect * k, k]
}

// Straight-alpha rule per channel: black/opaque blocks, white/transparent passes, a colour tints the light.
export const transmission = (r, g, b, a) => [r, g, b].map(c => 1 - a * (1 - c))

export const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export function kelvinToRgb(kelvin) {
  const t = kelvin / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return [r, g, b].map(c => srgbToLinear(Math.min(255, Math.max(0, c)) / 255))
}

export function motionAt(t, motions, layer = 0) {
  const p = t + layer * 1.7
  const m = { roll: 0, x: 0, y: 0, azimuth: 0, elevation: 0, gain: 1 }
  if (motions.includes('sway')) {
    m.roll = 1.1 * sin(p * 0.5) + 0.5 * sin(p * 0.93 + 1)
    m.x = 0.015 * sin(p * 0.41)
    m.y = 0.008 * sin(p * 0.67 + 2)
  }
  if (motions.includes('drift')) m.x += t * 0.02
  if (motions.includes('spin')) m.roll += t * 16
  if (motions.includes('breathe')) {
    m.azimuth = 2 * sin(t * 0.19)
    m.elevation = 1.5 * sin(t * 0.26 + 1)
  }
  if (motions.includes('flicker')) m.gain = 1 + 0.05 * sin(t * 11) + 0.035 * sin(t * 19.7 + 1) + 0.025 * sin(t * 33.3 + 2)
  return m
}

// Wall is the plane z=0, y spans [-1, 1]. Cookies face the light, extra layers sit closer to it.
export function rig(o, t = 0) {
  const time = t * o.speed
  const motions = o.motion.split(/\s+/)
  const lightMotion = motionAt(time, motions)
  const az = rad(o.azimuth + lightMotion.azimuth)
  const el = rad(o.elevation + lightMotion.elevation)
  const aim = [o.aimX, o.aimY, 0]
  const n = [cos(el) * cos(az), cos(el) * sin(az), sin(el)]
  const u0 = unit(cross(Math.abs(n[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], n))
  const v0 = cross(n, u0)

  const layers = Array.from({ length: o.layers }, (_, i) => {
    const m = motionAt(time, motions, i)
    const roll = rad(o.cookieRoll + m.roll + 97 * i)
    const u = add(mul(u0, cos(roll)), mul(v0, sin(roll)))
    const v = sub(mul(v0, cos(roll)), mul(u0, sin(roll)))
    const half = (o.cookieScale * (1 + 0.3 * i)) / 2
    const distance = Math.min(o.cookieDistance * (1 + 0.35 * i), o.lightDistance * 0.9)
    const c = add(add(aim, mul(n, distance)), add(mul(u, m.x), mul(v, m.y)))
    return { c, n, u: mul(u, 1 / (half * o.cookieAspect)), v: mul(v, 1 / half) }
  })

  return {
    light: add(aim, mul(n, o.lightDistance)),
    axis: mul(n, -1),
    lightU: mul(u0, o.lightSize),
    lightV: mul(v0, o.lightSize),
    distance2: o.lightDistance ** 2,
    wallNorm: o.lightDistance ** 2 / n[2],
    cone: [cos(rad(o.spread)), cos(rad(o.spread * 0.7))],
    gain: lightMotion.gain,
    layers,
  }
}

// Mirror of the shader's ray/plane step: where the ray from wall point p to light sample s crosses a cookie.
export function project(p, s, { c, n, u, v }) {
  const d = sub(s, p)
  const k = dot(sub(c, p), n) / dot(d, n)
  if (!(k > 0 && k < 1)) return null
  const hit = sub(add(p, mul(d, k)), c)
  return [dot(hit, u) * 0.5 + 0.5, dot(hit, v) * 0.5 + 0.5]
}
