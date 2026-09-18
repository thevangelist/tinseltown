import { PRESETS } from './cookies.js'
import { kelvinToRgb, rig, srgbToLinear, viewExtent } from './optics.js'
import { SCHEMA, resolveOptions } from './options.js'
import { FRAG, RESOLVE, VERT } from './shader.js'

const TAG = 'tinseltown-backdrop'
const TEXTURE_SIZE = 2048
const MAX_CANVAS_SIZE = 4096
// A still rig keeps refining for this many frames, then stops. 48 samples become about a thousand.
const REFINE_FRAMES = 24
// The governor: this many slow frames in a row and the render scale drops a step, down to the floor.
const SLOW_FRAME_MS = 24
const SLOW_FRAMES = 6
const QUALITY_STEP = 0.25
const QUALITY_FLOOR = 0.5
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i
const kebab = key => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)')

const STYLE = `<style>
:host { position: absolute; inset: 0; z-index: -1; display: block; pointer-events: none; background: #1c1a17; }
canvas { display: block; width: 100%; height: 100%; }
</style>`

const sizeOf = source => [
  source.videoWidth || source.naturalWidth || source.width || 0,
  source.videoHeight || source.naturalHeight || source.height || 0,
]

// Undefined for anything that is not a CSS colour, so callers choose their own fallback.
const colors = new Map()
function cssColorToLinear(color) {
  if (!CSS.supports('color', color)) return undefined
  if (!colors.has(color)) {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    if (colors.size > 64) colors.clear()
    colors.set(color, [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(c => srgbToLinear(c / 255)))
  }
  return colors.get(color)
}

// Also caps oversized sources below the GPU texture limit. An SVG without intrinsic size gets a square.
function rasterize(source) {
  const [w, h] = sizeOf(source).map(v => v || TEXTURE_SIZE)
  const scale = TEXTURE_SIZE / Math.max(w, h)
  const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale))
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function releaseVideo(video) {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

// The empty base keeps the module importable where there is no DOM, such as a server render.
export class TinseltownBackdrop extends (globalThis.HTMLElement ?? class {}) {
  static observedAttributes = ['preset', 'src', ...Object.keys(SCHEMA).map(kebab)]

  #canvas
  #gl
  #trace
  #resolve
  #locations = new Map()
  #accum = {}
  #refined = 0
  #quality = 1
  #slow = 0
  #last = 0
  #chained = false
  #cookie
  #seamless = false
  #ownedVideo
  #live = false
  #aspect = 1
  #visible = true
  #frame = 0
  #loads = 0
  #observers = []

  get options() {
    const attributes = {}
    for (const key of Object.keys(SCHEMA)) attributes[key] = this.getAttribute(kebab(key))
    return resolveOptions(PRESETS[this.getAttribute('preset')]?.rig, attributes)
  }

  connectedCallback() {
    // Decoration only: keep it out of the accessibility tree unless the author says otherwise.
    if (!this.hasAttribute('aria-hidden')) this.setAttribute('aria-hidden', 'true')
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.innerHTML = `${STYLE}<canvas></canvas>`
    this.#canvas = root.querySelector('canvas')
    this.#canvas.addEventListener('webglcontextlost', this.#onContextLost)
    this.#canvas.addEventListener('webglcontextrestored', this.#onContextRestored)
    this.#gl = this.#canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' })
    if (!this.#gl || !this.#setup()) {
      this.#gl = null
      return
    }

    const resize = new ResizeObserver(this.#invalidate)
    const intersect = new IntersectionObserver(([entry]) => {
      this.#visible = entry.isIntersecting
      this.#invalidate()
    })
    resize.observe(this)
    intersect.observe(this)
    this.#observers = [resize, intersect]
    reducedMotion.addEventListener('change', this.#invalidate)
    // Phones start a step down. The governor takes it further if frames still run long.
    this.#quality = coarsePointer.matches ? 1 - QUALITY_STEP : 1
    this.#ownedVideo?.play().catch(() => {})
    if (this.#cookie) this.setCookie(this.#cookie, { live: this.#live })
    else this.#loadCookie()
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#frame)
    this.#frame = 0
    this.#ownedVideo?.pause()
    this.#observers.forEach(o => o.disconnect())
    reducedMotion.removeEventListener('change', this.#invalidate)
    this.#gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.#gl = null
  }

  attributeChangedCallback(name, previous, value) {
    if (!this.#gl || previous === value) return
    if (name === 'preset' || name === 'src') this.#loadCookie()
    else this.#invalidate()
  }

  // Any black and alpha image, video or canvas. Pass { live: true } for a canvas that keeps animating.
  setCookie(source, { live = source instanceof HTMLVideoElement, seamless = false } = {}) {
    const [w, h] = sizeOf(source)
    if (!w || !h) throw new TypeError(`${TAG}: setCookie needs an image, video or canvas that has a size`)
    if (!live && Math.max(w, h) > TEXTURE_SIZE) source = rasterize(source)

    this.#loads++
    if (this.#ownedVideo && this.#ownedVideo !== source) {
      releaseVideo(this.#ownedVideo)
      this.#ownedVideo = null
    }
    this.#cookie = source
    this.#live = live
    this.#aspect = w / h
    this.#upload(seamless)
    this.#invalidate()
  }

  async #loadCookie() {
    const load = ++this.#loads
    const src = this.getAttribute('src')
    const preset = PRESETS[this.getAttribute('preset')] ?? PRESETS.breakup
    let video
    try {
      if (src && VIDEO.test(src)) {
        video = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' })
        await video.play()
        if (load !== this.#loads || !this.#gl) return releaseVideo(video)
        this.setCookie(video)
        this.#ownedVideo = video
        return
      }
      const image = Object.assign(new Image(), { crossOrigin: 'anonymous' })
      image.src = src ?? URL.createObjectURL(new Blob([preset.svg()], { type: 'image/svg+xml' }))
      await image.decode().finally(() => src || URL.revokeObjectURL(image.src))
      if (load === this.#loads && this.#gl) this.setCookie(rasterize(image), { live: false, seamless: !src })
    } catch (error) {
      if (video) releaseVideo(video)
      if (load === this.#loads) console.warn(`${TAG}: could not load the cookie`, src ?? preset, error)
    }
  }

  #program(fragment) {
    const gl = this.#gl
    const program = gl.createProgram()
    const shaders = [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fragment]].map(([type, code]) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, code)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
      return shader
    })
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      console.warn(`${TAG}: shader failed`, gl.getProgramInfoLog(program), ...shaders.map(s => gl.getShaderInfoLog(s)))
      return null
    }
    shaders.forEach(shader => gl.deleteShader(shader))
    return program
  }

  #setup() {
    const gl = this.#gl
    this.#locations = new Map()
    this.#trace = this.#program(FRAG)
    this.#resolve = this.#program(RESOLVE)
    if (!this.#trace || !this.#resolve) return false
    // Refinement averages frames in a float target. Without one the trace draws straight to the canvas.
    const float = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')
    this.#accum = float ? { texture: gl.createTexture(), target: gl.createFramebuffer() } : {}

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    return true
  }

  // Presets tile seamlessly. Anything else repeats mirrored, so a photo shows no seam either.
  #upload(seamless = this.#seamless) {
    const gl = this.#gl
    this.#seamless = seamless
    if (!gl || gl.isContextLost() || (this.#cookie.readyState ?? 4) < 2) return
    const wrap = seamless ? gl.REPEAT : gl.MIRRORED_REPEAT
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.#cookie)
    gl.generateMipmap(gl.TEXTURE_2D)
  }

  #uniform(name, program = this.#trace) {
    const key = `${program === this.#trace}:${name}`
    if (!this.#locations.has(key)) this.#locations.set(key, this.#gl.getUniformLocation(program, name))
    return this.#locations.get(key)
  }

  // Sizes the float target. False when the GPU refuses it, which drops the element to direct drawing.
  #sizeAccum(width, height) {
    const gl = this.#gl, accum = this.#accum
    if (!accum.target) return false
    if (accum.width === width && accum.height === height) return true
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, accum.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.target)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accum.texture, 0)
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!complete) this.#accum = {}
    Object.assign(accum, { width, height })
    return complete
  }

  #onContextLost = event => {
    event.preventDefault()
    cancelAnimationFrame(this.#frame)
    this.#frame = 0
  }

  #onContextRestored = () => {
    if (!this.#gl || !this.#setup()) return
    if (this.#cookie) this.#upload()
    this.#invalidate()
  }

  // Something changed: start refining from scratch.
  #invalidate = () => {
    this.#refined = 0
    this.#schedule()
  }

  #schedule() {
    if (!this.#frame && this.#gl) this.#frame = requestAnimationFrame(this.#render)
  }

  #render = now => {
    this.#frame = 0
    const gl = this.#gl
    if (!gl || gl.isContextLost() || !this.#cookie || !this.#visible) return

    // Only back-to-back frames say anything about speed. A frame after idle time does not.
    if (this.#chained && now - this.#last > SLOW_FRAME_MS) this.#slow++
    else this.#slow = Math.max(0, this.#slow - 1)
    if (this.#slow >= SLOW_FRAMES && this.#quality > QUALITY_FLOOR) {
      this.#quality -= QUALITY_STEP
      this.#slow = 0
    }
    this.#last = now
    this.#chained = false

    const o = this.options
    const still = reducedMotion.matches
    const time = still ? 0 : now / 1000
    const scale = Math.min(devicePixelRatio, 2) * o.resolution * this.#quality
    const width = Math.min(Math.round(this.clientWidth * scale), MAX_CANVAS_SIZE)
    const height = Math.min(Math.round(this.clientHeight * scale), MAX_CANVAS_SIZE)
    if (!width || !height) return
    if (this.#canvas.width !== width || this.#canvas.height !== height) Object.assign(this.#canvas, { width, height })
    gl.viewport(0, 0, width, height)
    if (this.#live) this.#upload()

    const animated = !still && (this.#live || o.motion || o.haze > 0)
    if (animated || this.#canvas.width !== this.#accum.width || this.#canvas.height !== this.#accum.height) this.#refined = 0
    const accumulate = this.#sizeAccum(width, height)
    gl.useProgram(this.#trace)
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumulate ? this.#accum.target : null)
    if (accumulate) {
      gl.enable(gl.BLEND)
      gl.blendColor(0, 0, 0, 1 / (this.#refined + 1))
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA)
    }

    const r = rig({ ...o, cookieAspect: this.#aspect }, time)
    const flat = key => r.layers.flatMap(layer => layer[key])
    gl.uniform2f(this.#uniform('uRes'), width, height)
    gl.uniform2fv(this.#uniform('uView'), viewExtent(width / height))
    gl.uniform1f(this.#uniform('uTime'), time)
    gl.uniform1f(this.#uniform('uFrame'), this.#refined)
    gl.uniform1i(this.#uniform('uDirect'), accumulate ? 0 : 1)
    gl.uniform1i(this.#uniform('uShape'), SCHEMA.lightShape.values.indexOf(o.lightShape))
    gl.uniform1i(this.#uniform('uSurface'), SCHEMA.surface.values.indexOf(o.surface))
    gl.uniform1f(this.#uniform('uRelief'), o.relief)
    gl.uniform1i(this.#uniform('uInvert'), o.invert ? 1 : 0)
    gl.uniform3fv(this.#uniform('uLight'), r.light)
    gl.uniform3fv(this.#uniform('uLightU'), r.lightU)
    gl.uniform3fv(this.#uniform('uLightV'), r.lightV)
    gl.uniform3fv(this.#uniform('uAxis'), r.axis)
    gl.uniform2fv(this.#uniform('uCone'), r.cone)
    gl.uniform1f(this.#uniform('uWallNorm'), r.wallNorm)
    gl.uniform1f(this.#uniform('uDistance2'), r.distance2)
    gl.uniform1i(this.#uniform('uLayers'), o.layers)
    gl.uniform1i(this.#uniform('uEdge'), SCHEMA.edge.values.indexOf(o.edge))
    gl.uniform1i(this.#uniform('uSamples'), o.samples)
    gl.uniform3fv(this.#uniform('uC'), flat('c'))
    gl.uniform3fv(this.#uniform('uN'), flat('n'))
    gl.uniform3fv(this.#uniform('uU'), flat('u'))
    gl.uniform3fv(this.#uniform('uV'), flat('v'))
    gl.uniform3fv(this.#uniform('uWall'), cssColorToLinear(o.wall) ?? cssColorToLinear(SCHEMA.wall.default))
    const lamp = cssColorToLinear(o.lightColor) ?? kelvinToRgb(o.colorTemp)
    gl.uniform3fv(this.#uniform('uLightColor'), lamp.map(c => c * o.intensity * r.gain))
    gl.uniform1f(this.#uniform('uAmbient'), o.ambient)
    gl.uniform1f(this.#uniform('uThreshold'), o.threshold)
    gl.uniform1f(this.#uniform('uBlur'), o.cookieBlur)
    gl.uniform1f(this.#uniform('uHaze'), o.haze)
    gl.uniform1f(this.#uniform('uHazeDepth'), o.cookieDistance * Math.sin((o.elevation * Math.PI) / 180) * 0.9)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    if (accumulate) {
      gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(this.#resolve)
      gl.uniform1i(this.#uniform('uAccum', this.#resolve), 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.#refined++
    }
    if (animated || (accumulate && this.#refined < REFINE_FRAMES)) {
      this.#chained = true
      this.#schedule()
    }
  }
}

if (globalThis.customElements && !customElements.get(TAG)) customElements.define(TAG, TinseltownBackdrop)
