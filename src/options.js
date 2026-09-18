import { MAX_LAYERS } from './shader.js'

// Bounds keep hostile or mistyped attributes from dividing by zero or stalling the GPU.
export const SCHEMA = {
  azimuth: { default: 140 },
  elevation: { default: 42, min: 5, max: 90 },
  lightDistance: { default: 6, min: 0.5, max: 100 },
  lightSize: { default: 0.15, min: 0, max: 5 },
  // The index of each value is the uShape code in the shader.
  lightShape: { default: 'disc', values: ['disc', 'square', 'ring'] },
  spread: { default: 32, min: 1, max: 89 },
  aimX: { default: 0, min: -10, max: 10 },
  aimY: { default: 0, min: -10, max: 10 },
  cookieDistance: { default: 1.5, min: 0.01, max: 90 },
  cookieScale: { default: 3, min: 0.05, max: 50 },
  cookieRoll: { default: 0 },
  cookieBlur: { default: 0, min: 0, max: 12 },
  threshold: { default: 0, min: 0, max: 1 },
  // A bare attribute counts as true, like any HTML boolean.
  invert: { default: false },
  layers: { default: 1, min: 1, max: MAX_LAYERS, integer: true },
  // The index of each value is the uEdge code in the shader.
  edge: { default: 'repeat', values: ['block', 'pass', 'repeat'] },
  colorTemp: { default: 3200, min: 1000, max: 40000 },
  // A gel: any CSS colour. Empty means the lamp burns at colorTemp.
  lightColor: { default: '' },
  intensity: { default: 2.2, min: 0, max: 100 },
  ambient: { default: 0.1, min: 0, max: 10 },
  wall: { default: '#3a3835' },
  // The index of each value is the uSurface code in the shader.
  surface: { default: 'none', values: ['none', 'plaster', 'linen', 'concrete'] },
  relief: { default: 0.5, min: 0, max: 1 },
  haze: { default: 0, min: 0, max: 4 },
  motion: { default: '', tokens: ['sway', 'drift', 'spin', 'breathe', 'flicker'] },
  speed: { default: 1, min: 0, max: 20 },
  samples: { default: 48, min: 1, max: 256, integer: true },
  resolution: { default: 1, min: 0.1, max: 2 },
}

function coerce(spec, raw) {
  if (raw === undefined || raw === null) return spec.default
  if (typeof spec.default === 'boolean') return raw === true || raw === '' || raw === 'true'
  if (typeof spec.default === 'number') {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
    if (!Number.isFinite(n)) return spec.default
    const clamped = Math.min(Math.max(n, spec.min ?? -Infinity), spec.max ?? Infinity)
    return spec.integer ? Math.round(clamped) : clamped
  }
  if (spec.values) return spec.values.includes(raw) ? raw : spec.default
  if (spec.tokens) return String(raw).split(/\s+/).filter(token => spec.tokens.includes(token)).join(' ')
  return String(raw)
}

// Attributes win over the preset rig, which wins over the defaults. Unknown keys are dropped.
export function resolveOptions(presetRig = {}, attributes = {}) {
  const options = {}
  for (const [key, spec] of Object.entries(SCHEMA)) options[key] = coerce(spec, attributes[key] ?? presetRig[key])
  return options
}
